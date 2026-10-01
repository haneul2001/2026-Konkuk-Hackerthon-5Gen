"""학습도우미 AI 서버: 녹음 업로드 → 전처리 → STT → 요약·개념 추출 → 퀴즈 생성.

경로와 응답 모양은 studyapp(Express + React)의 /api 와 shared/types.ts 를 그대로 따른다.
Express(3001)가 /api/lectures, /api/concepts, /api/quiz 요청을 이 서버(8000)로 넘긴다.

90분 강의는 처리에 몇 분 걸리므로 업로드하면 강의를 만들어 바로 응답(status: processing)하고,
클라이언트는 GET /api/lectures/{id} 로 상태를 확인한다. GPU가 하나라 처리는 한 번에 하나씩 한다.
"""
import mimetypes
import shutil
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

import logging

from app import cards, config, resources, stt, vocab
from app.audio import PRESETS, preprocess, probe_duration
from app.db import Card, Concept, ConceptResource, Course, Lecture, Question, SessionLocal, init_db
from app.quiz import service as quiz_service
from app.summarize.pipeline import summarize
from app.summarize.providers import DEFAULT_PROVIDER, LOCAL_PROVIDERS, PROVIDERS, SummaryError

AUDIO_DIR = config.DATA_DIR / "audio"  # 다시 듣기용 녹음 원본
WORK_DIR = config.DATA_DIR / "work"  # 전처리 임시 파일
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
WORK_DIR.mkdir(parents=True, exist_ok=True)

_executor = ThreadPoolExecutor(max_workers=1)
_ACTIVE = ("queued", "preprocessing", "transcribing", "summarizing")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    # 서버가 처리 도중 꺼졌던 작업은 이어서 할 수 없으니 실패로 표시한다
    with SessionLocal.begin() as db:
        db.execute(
            update(Lecture).where(Lecture.status.in_(_ACTIVE)).values(status="failed", error="처리 중에 서버가 다시 시작됐어요")
        )
        _backfill_concepts(db)
    yield
    _executor.shutdown(wait=False, cancel_futures=True)


def _backfill_concepts(db: Session) -> None:
    """개념 테이블이 생기기 전에 요약된 강의는 저장된 요약에서 개념 카드를 만든다."""
    has_concepts = select(Concept.lecture_id).distinct()
    for lec in db.scalars(select(Lecture).where(Lecture.status == "done", Lecture.id.not_in(has_concepts))).all():
        for i, c in enumerate((lec.summary or {}).get("concepts", [])):
            db.add(Concept(lecture_id=lec.id, position=i, term=c["name"], summary=c["explanation"]))


app = FastAPI(title="학습도우미 AI 서버", lifespan=lifespan)


# 실패 응답은 studyapp 약속대로 { "error": "이유" }
@app.exception_handler(StarletteHTTPException)
async def _http_error(_, exc: StarletteHTTPException):
    return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)


@app.exception_handler(RequestValidationError)
async def _validation_error(_, exc: RequestValidationError):
    detail = "; ".join(f"{'.'.join(str(p) for p in e['loc'][1:])}: {e['msg']}" for e in exc.errors())
    return JSONResponse({"error": detail}, status_code=400)


# ---------- 처리 파이프라인 ----------


def _set(lecture_id: str, **values) -> None:
    with SessionLocal.begin() as db:
        db.execute(update(Lecture).where(Lecture.id == lecture_id).values(**values))


def _course_vocab(course: Course) -> tuple[list[str], dict[str, str]]:
    """courses/<과목명>.txt 가 있으면 파일, 없으면 DB"""
    from_file = vocab.load_course_file(course.name)
    return from_file if from_file else (course.terms, dict(course.corrections))


def _vocab_for(lecture_id: str) -> tuple[list[str], dict[str, str], list[str]]:
    """(STT 힌트 용어 = 강의 용어 + 과목 용어집, 과목 교정 사전, 요약 힌트 용어 = 강의 용어만)

    과목 용어집을 요약에 넘기면 작은 모델이 강의에서 다루지 않은 용어까지 개념 카드로 지어낸다.
    철자는 STT 단계(hotwords + 교정 사전)에서 이미 바로잡으므로 요약에는 사용자가 이 강의에 입력한 용어만 준다.
    """
    with SessionLocal() as db:
        lec = db.get(Lecture, lecture_id)
        course = db.get(Course, lec.course_id) if lec.course_id else None
        course_terms, corrections = _course_vocab(course) if course else ([], {})
        lecture_terms = vocab.parse_terms(lec.terms)
        return vocab.merge_terms(lecture_terms, course_terms), corrections, lecture_terms


log = logging.getLogger(__name__)


def _delete_concepts(db: Session, lecture_id: str) -> None:
    # SQLite는 외래 키 CASCADE가 기본으로 꺼져 있어서 개념에 딸린 것부터 직접 지운다
    concept_ids = select(Concept.id).where(Concept.lecture_id == lecture_id)
    db.execute(delete(ConceptResource).where(ConceptResource.concept_id.in_(concept_ids)))
    cards.delete_cards(db, lecture_id)
    db.execute(delete(Question).where(Question.lecture_id == lecture_id))
    db.execute(delete(Concept).where(Concept.lecture_id == lecture_id))


def _save_summary(lecture_id: str, result) -> None:
    """요약 결과와 개념을 저장한다. 다시 요약하면 이전 개념·문제·큐카드·자료는 지운다.
    status는 큐카드와 자료까지 만든 뒤 done으로 바꾼다 (_summarize_step)."""
    with SessionLocal.begin() as db:
        lec = db.get(Lecture, lecture_id)
        _delete_concepts(db, lecture_id)
        for i, c in enumerate(result.summary["concepts"]):
            db.add(Concept(lecture_id=lecture_id, position=i, term=c["name"], summary=c["explanation"]))
        if lec.title_auto and result.summary.get("title"):
            week = lec.title.split(" — ")[0]
            lec.title = f"{week} — {result.summary['title']}"
        lec.summary = result.summary
        lec.summary_provider = result.provider
        lec.summary_model = result.model
        lec.error = None


def _attach_resources(lecture_id: str, provider: str) -> None:
    """개념마다 틀렸을 때 볼 공부 자료 링크를 찾아 저장한다 (위키백과, 신뢰 블로그)."""
    with SessionLocal() as db:
        lec = db.get(Lecture, lecture_id)
        course = db.get(Course, lec.course_id) if lec.course_id else None
        concepts = db.scalars(select(Concept).where(Concept.lecture_id == lecture_id)).all()
        items = [{"id": c.id, "term": c.term, "summary": c.summary} for c in concepts]
    links = resources.find_resources(items, course.name if course else "", provider)
    with SessionLocal.begin() as db:
        for cid, found in links.items():
            db.execute(delete(ConceptResource).where(ConceptResource.concept_id == cid))
            urls = set()
            for i, r in enumerate(found):
                if r["url"] not in urls:
                    urls.add(r["url"])
                    db.add(ConceptResource(concept_id=cid, position=i, **r))


def _make_cards(lecture_id: str, provider: str) -> None:
    with SessionLocal.begin() as db:
        cards.generate_cards(db, lecture_id, provider)


def _summarize_step(lecture_id: str, transcript: str, terms: str | None, provider: str) -> None:
    _set(lecture_id, status="summarizing")
    if provider in LOCAL_PROVIDERS:
        # Whisper와 로컬 LLM이 동시에 GPU에 올라가면 VRAM이 넘쳐 극단적으로 느려진다
        stt.unload_model()
    _save_summary(lecture_id, summarize(transcript, terms, provider))
    # 큐카드와 자료 링크는 부가 단계라 실패해도 강의는 ready로 둔다 (각각 다시 만드는 API가 있다)
    for name, step in (("cards", _make_cards), ("resources", _attach_resources)):
        try:
            step(lecture_id, provider)
        except Exception as e:
            log.warning("%s step failed for %s: %s", name, lecture_id, e)
    _set(lecture_id, status="done")


def _run_pipeline(lecture_id: str, src: Path, preset: str, provider: str) -> None:
    wav = WORK_DIR / f"{lecture_id}.{preset}.wav"
    try:
        stt_terms, corrections, summary_terms = _vocab_for(lecture_id)

        _set(lecture_id, status="preprocessing")
        preprocess(src, wav, preset)

        _set(lecture_id, status="transcribing")
        result = stt.transcribe(wav, vocab.hotwords(stt_terms), on_progress=lambda p: _set(lecture_id, progress=round(p, 3)))
        segments, _ = vocab.correct_segments(result["segments"], corrections)
        transcript = " ".join(s["text"] for s in segments)
        _set(
            lecture_id,
            progress=1.0,
            duration_sec=result["duration"],
            speech_sec=result["speech_duration"],
            transcript_text=transcript,
            segments=segments,
        )

        # 요약이 실패해도 전사본은 남아 있으니 POST /api/lectures/{id}/summary 로 다시 시도할 수 있다
        _summarize_step(lecture_id, transcript, vocab.hotwords(summary_terms), provider)
    except Exception as e:
        _set(lecture_id, status="failed", error=f"{type(e).__name__}: {e}")
    finally:
        wav.unlink(missing_ok=True)  # 원본(src)은 다시 듣기용으로 남긴다


def _resummarize(lecture_id: str, provider: str) -> None:
    with SessionLocal() as db:
        transcript = db.get(Lecture, lecture_id).transcript_text
    try:
        _, _, summary_terms = _vocab_for(lecture_id)
        _summarize_step(lecture_id, transcript, vocab.hotwords(summary_terms), provider)
    except Exception as e:
        _set(lecture_id, status="failed", error=f"{type(e).__name__}: {e}")


# ---------- studyapp 타입으로 내보내기 ----------


def _lecture_out(db: Session, lec: Lecture) -> dict:
    """shared/types.ts 의 Lecture + 추가 필드(stage, progress, error, overview, announcements)"""
    course = db.get(Course, lec.course_id) if lec.course_id else None
    card_count = db.scalar(select(func.count()).select_from(Card).where(Card.lecture_id == lec.id))
    quiz_count = db.scalar(select(func.count()).select_from(Question).where(Question.lecture_id == lec.id))
    summary = lec.summary or {}
    return {
        "id": lec.id,
        "title": lec.title,
        "course": course.name if course else "",
        "recordedAt": lec.recorded_at or lec.created_at.date().isoformat(),
        "durationMin": round((lec.duration_sec or 0) / 60),
        # processing | ready | failed. failed는 studyapp 타입에 아직 없다 (INTEGRATION.md 참고)
        "status": {"done": "ready", "failed": "failed"}.get(lec.status, "processing"),
        "cardCount": card_count,
        "quizCount": quiz_count,
        "stage": lec.status,  # queued | preprocessing | transcribing | summarizing | done | failed
        "progress": lec.progress,
        "error": lec.error,
        "overview": summary.get("overview"),
        "announcements": summary.get("announcements", []),
    }


def _resources_of(db: Session, concept_ids: list[str]) -> dict[str, list[dict]]:
    rows = db.scalars(
        select(ConceptResource).where(ConceptResource.concept_id.in_(concept_ids)).order_by(ConceptResource.position)
    ).all()
    out: dict[str, list[dict]] = {}
    for r in rows:
        out.setdefault(r.concept_id, []).append(
            {"kind": r.kind, "source": r.source, "title": r.title, "url": r.url, "snippet": r.snippet}
        )
    return out


def _concept_out(c: Concept, lec: Lecture, course_name: str, links: list[dict]) -> dict:
    return {
        "id": c.id,
        "term": c.term,
        "summary": c.summary,
        "lectureId": lec.id,
        "lectureTitle": lec.title,
        "course": course_name,
        "mastery": c.mastery,
        "resources": links,  # 공부 자료 링크 (studyapp 타입에 없는 추가 필드)
    }


def _check_provider(provider: str | None) -> None:
    if provider and provider not in PROVIDERS:
        raise HTTPException(400, f"provider는 {list(PROVIDERS)} 중 하나여야 해요")


# ---------- 강의 ----------


@app.post("/api/lectures", status_code=202)
def create_lecture(
    audio: UploadFile = File(..., description="녹음 파일. m4a, mp3, wav, webm 등"),
    course: str = Form(..., description="과목 이름. 예: 자료구조"),
    title: str | None = Form(None, description="없으면 'N주차'로 시작해서 요약이 끝나면 'N주차 — 주제'가 된다"),
    recordedAt: str | None = Form(None, description="녹음한 날 YYYY-MM-DD. 없으면 오늘"),
    terms: str | None = Form(None, description="이 강의에만 쓸 추가 용어, 쉼표로 구분"),
    preset: str = Form(config.DEFAULT_PRESET, description=f"전처리 프리셋: {list(PRESETS)}"),
    provider: str = Form(DEFAULT_PROVIDER, description=f"요약 LLM: {list(PROVIDERS)}"),
):
    if preset not in PRESETS:
        raise HTTPException(400, f"preset은 {list(PRESETS)} 중 하나여야 해요")
    _check_provider(provider)
    course_name = course.strip()
    if not course_name:
        raise HTTPException(400, "과목 이름이 비어 있어요")
    if recordedAt:
        try:
            date.fromisoformat(recordedAt)
        except ValueError:
            raise HTTPException(400, "recordedAt은 YYYY-MM-DD 형식이어야 해요") from None

    with SessionLocal.begin() as db:
        # 과목은 이름으로 찾고 없으면 만든다 (courses/<과목명>.txt 용어집과 이름으로 연결된다)
        course_row = db.scalars(select(Course).where(Course.name == course_name)).first()
        if not course_row:
            course_row = Course(name=course_name)
            db.add(course_row)
            db.flush()
        week = db.scalar(select(func.count()).select_from(Lecture).where(Lecture.course_id == course_row.id)) + 1
        lec = Lecture(
            course_id=course_row.id,
            title=(title or "").strip() or f"{week}주차",
            title_auto=not (title or "").strip(),
            recorded_at=recordedAt or date.today().isoformat(),
            terms=terms,
            preset=preset,
        )
        db.add(lec)
        db.flush()
        lecture_id = lec.id

    src = AUDIO_DIR / f"{lecture_id}{Path(audio.filename or '').suffix.lower() or '.bin'}"
    with src.open("wb") as f:
        shutil.copyfileobj(audio.file, f)
    duration = probe_duration(src)
    if duration is None:
        src.unlink(missing_ok=True)
        with SessionLocal.begin() as db:
            db.delete(db.get(Lecture, lecture_id))
        raise HTTPException(400, "오디오 파일을 읽을 수 없어요. 녹음 파일이 맞는지 확인해 주세요")

    _set(lecture_id, audio_path=src.relative_to(config.DATA_DIR).as_posix(), duration_sec=duration)
    _executor.submit(_run_pipeline, lecture_id, src, preset, provider)
    with SessionLocal() as db:
        return _lecture_out(db, db.get(Lecture, lecture_id))


@app.get("/api/lectures")
def list_lectures():
    with SessionLocal() as db:
        lectures = db.scalars(select(Lecture).order_by(Lecture.created_at.desc())).all()
        return [_lecture_out(db, lec) for lec in lectures]


def _get_lecture(db: Session, lecture_id: str) -> Lecture:
    lec = db.get(Lecture, lecture_id)
    if not lec:
        raise HTTPException(404, "강의를 찾을 수 없어요")
    return lec


@app.get("/api/lectures/{lecture_id}")
def get_lecture(lecture_id: str):
    with SessionLocal() as db:
        return _lecture_out(db, _get_lecture(db, lecture_id))


@app.get("/api/lectures/{lecture_id}/transcript")
def get_transcript(lecture_id: str):
    """전사본 (시간 정보 포함). 다시 듣기 화면에서 문장을 눌러 그 위치로 가는 데 쓸 수 있다."""
    with SessionLocal() as db:
        lec = _get_lecture(db, lecture_id)
        return {"text": lec.transcript_text, "segments": lec.segments or []}


@app.get("/api/lectures/{lecture_id}/audio-file")
def get_audio_file(lecture_id: str):
    """다시 듣기용 녹음 원본"""
    with SessionLocal() as db:
        lec = _get_lecture(db, lecture_id)
        path = config.DATA_DIR / lec.audio_path if lec.audio_path else None
    if not path or not path.exists():
        raise HTTPException(404, "녹음 원본이 없어요")
    return FileResponse(path, media_type=mimetypes.guess_type(path.name)[0] or "application/octet-stream")


@app.post("/api/lectures/{lecture_id}/summary", status_code=202)
def resummarize(lecture_id: str, provider: str = DEFAULT_PROVIDER):
    """전사본으로 요약만 다시 만든다 (실패 재시도, 다른 LLM으로 바꿔보기). 이 강의의 개념과 문제는 새로 만들어진다."""
    _check_provider(provider)
    with SessionLocal() as db:
        lec = _get_lecture(db, lecture_id)
        if not lec.transcript_text:
            raise HTTPException(409, "전사본이 아직 없어요")
        if lec.status in _ACTIVE:
            raise HTTPException(409, "아직 처리 중이에요")
    _set(lecture_id, status="queued")
    _executor.submit(_resummarize, lecture_id, provider)
    with SessionLocal() as db:
        return _lecture_out(db, db.get(Lecture, lecture_id))


@app.post("/api/lectures/{lecture_id}/resources")
def rebuild_resources(lecture_id: str, provider: str = DEFAULT_PROVIDER):
    """개념별 공부 자료 링크를 다시 찾는다 (자료 기능이 생기기 전에 요약한 강의에도 쓴다)."""
    _check_provider(provider)
    with SessionLocal() as db:
        _get_lecture(db, lecture_id)
    _attach_resources(lecture_id, provider)
    return list_concepts(lecture_id)


# ---------- 큐카드 ----------


class CardSessionIn(BaseModel):
    count: int | None = Field(None, description="세트에 넣을 카드 수. 없으면 강의 카드 전부 (다시 볼 카드·몰라요 카드가 앞)")


class CardSubmitIn(BaseModel):
    results: list[dict] = Field(description="[{cardId, known: true | false}]")


@app.get("/api/lectures/{lecture_id}/cards")
def get_cards(lecture_id: str):
    """강의의 큐카드 전체 (box: 라이트너 상자 1~5, 아직 안 본 카드는 null)"""
    with SessionLocal() as db:
        _get_lecture(db, lecture_id)
        return cards.list_cards(db, lecture_id)


@app.post("/api/lectures/{lecture_id}/cards")
def regenerate_cards(lecture_id: str, provider: str = DEFAULT_PROVIDER):
    """큐카드를 다시 만든다 (이 강의의 카드 학습 기록은 지워진다)."""
    _check_provider(provider)
    with SessionLocal() as db:
        _get_lecture(db, lecture_id)
    try:
        with SessionLocal.begin() as db:
            stats = cards.generate_cards(db, lecture_id, provider)
    except SummaryError as e:
        raise HTTPException(502, f"큐카드를 만들지 못했어요: {e}") from e
    with SessionLocal() as db:
        return {"stats": stats, "cards": cards.list_cards(db, lecture_id)}


@app.post("/api/lectures/{lecture_id}/card-sessions")
def start_card_session(lecture_id: str, body: CardSessionIn | None = None):
    """큐카드 한 세트 시작. 카드가 없으면 null."""
    count = body.count if body and body.count else None
    with SessionLocal.begin() as db:
        _get_lecture(db, lecture_id)
        return cards.start_session(db, lecture_id, max(1, count) if count else None)


@app.post("/api/card-sessions/{session_id}/submit")
def submit_card_session(session_id: str, body: CardSubmitIn):
    """알아요/몰라요 반영. finished=true면 한 세트를 끝까지 본 것 (Express가 XP를 준다)."""
    with SessionLocal.begin() as db:
        result = cards.submit_session(db, session_id, body.results)
    if result is None:
        raise HTTPException(404, "큐카드 세트를 찾을 수 없어요")
    return result


class LecturePatch(BaseModel):
    title: str | None = None
    course: str | None = Field(None, description="과목 이름. 없으면 새로 만든다")
    recordedAt: str | None = None


@app.patch("/api/lectures/{lecture_id}")
def update_lecture(lecture_id: str, body: LecturePatch):
    """제목·과목·녹음 날짜 수정. 제목을 직접 바꾸면 요약 뒤 자동 제목이 더 이상 덮어쓰지 않는다."""
    with SessionLocal.begin() as db:
        lec = _get_lecture(db, lecture_id)
        if body.title is not None:
            if not body.title.strip():
                raise HTTPException(400, "제목이 비어 있어요")
            lec.title = body.title.strip()
            lec.title_auto = False
        if body.course is not None:
            name = body.course.strip()
            if not name:
                raise HTTPException(400, "과목 이름이 비어 있어요")
            course = db.scalars(select(Course).where(Course.name == name)).first()
            if not course:
                course = Course(name=name)
                db.add(course)
                db.flush()
            lec.course_id = course.id
        if body.recordedAt is not None:
            try:
                date.fromisoformat(body.recordedAt)
            except ValueError:
                raise HTTPException(400, "recordedAt은 YYYY-MM-DD 형식이어야 해요") from None
            lec.recorded_at = body.recordedAt
        db.flush()
        return _lecture_out(db, lec)


@app.delete("/api/lectures/{lecture_id}")
def delete_lecture(lecture_id: str):
    with SessionLocal.begin() as db:
        lec = _get_lecture(db, lecture_id)
        if lec.status in _ACTIVE:
            raise HTTPException(409, "처리 중인 강의는 지울 수 없어요")
        if lec.audio_path:
            (config.DATA_DIR / lec.audio_path).unlink(missing_ok=True)
        _delete_concepts(db, lecture_id)
        db.delete(lec)
    return True


# ---------- 개념 ----------


@app.get("/api/concepts")
def list_concepts(lecture: str | None = None):
    """서재의 개념 카드. ?lecture=ID 로 강의별"""
    with SessionLocal() as db:
        query = select(Concept, Lecture).join(Lecture, Concept.lecture_id == Lecture.id)
        if lecture:
            query = query.where(Concept.lecture_id == lecture)
        rows = db.execute(query.order_by(Lecture.created_at.desc(), Concept.position)).all()
        courses = {c.id: c.name for c in db.scalars(select(Course)).all()}
        links = _resources_of(db, [c.id for c, _ in rows])
        return [_concept_out(c, lec, courses.get(lec.course_id, ""), links.get(c.id, [])) for c, lec in rows]


# ---------- 퀴즈 ----------


class QuizSource(BaseModel):
    kind: str = Field(description="lecture | folder")
    id: str
    title: str | None = Field(None, description="folder일 때 화면에 띄울 폴더 이름 (Express가 넘겨준다)")


class QuizIn(BaseModel):
    source: QuizSource
    type: str = Field(description="multiple | ox | essay")
    count: int = 10
    conceptIds: list[str] | None = Field(None, description="folder일 때 폴더에 담긴 개념 id (Express가 넘겨준다)")
    provider: str | None = Field(None, description=f"문제 생성 LLM: {list(PROVIDERS)}. 없으면 기본값")


class ReviewQuizIn(BaseModel):
    lectureId: str
    reason: str = Field(description="wrong(틀린 문제) | interval(간격 복습)")
    count: int = 5


class SubmitIn(BaseModel):
    results: list[dict] = Field(description="[{questionId, correct: true | false | null}]")


@app.post("/api/quiz")
def create_quiz(body: QuizIn):
    """누를 때마다 LLM으로 새 문제를 만든다. 전에 틀린 문제는 가중치를 높여 섞는다. 낼 문제가 없으면 null."""
    if body.source.kind not in ("lecture", "folder"):
        raise HTTPException(400, "source.kind는 lecture 또는 folder여야 해요")
    if body.type not in quiz_service.QUESTION_TYPES:
        raise HTTPException(400, "type은 multiple, ox, essay 중 하나여야 해요")
    _check_provider(body.provider)
    count = max(1, min(20, body.count))
    try:
        with SessionLocal.begin() as db:
            return quiz_service.build_quiz(
                db, body.source.model_dump(exclude_none=True), body.type, count, body.conceptIds, body.provider
            )
    except SummaryError as e:
        raise HTTPException(502, f"문제를 만들지 못했어요: {e}") from e
    except ConnectionError as e:
        raise HTTPException(503, f"LLM 서버에 연결할 수 없어요: {e}") from e


@app.post("/api/reviews/{review_id}/quiz")
def create_review_quiz(review_id: str, body: ReviewQuizIn):
    """오늘 복습 퀴즈. 새로 만들지 않고 저장된 문제에서 낸다 (오늘 복습 목록은 Express가 관리)."""
    with SessionLocal.begin() as db:
        return quiz_service.build_review_quiz(db, body.lectureId, body.reason, max(1, min(20, body.count)), review_id)


@app.post("/api/quiz/{quiz_id}/submit")
def submit_quiz(quiz_id: str, body: SubmitIn):
    """채점 결과로 다음 출제 가중치와 개념 숙련도를 갱신한다. XP·리그는 Express가 이 응답의 graded로 처리한다."""
    with SessionLocal.begin() as db:
        result = quiz_service.submit(db, quiz_id, body.results)
    if result is None:
        raise HTTPException(404, "퀴즈를 찾을 수 없어요")
    return result


# ---------- 과목 (용어집·교정 사전) ----------


class CourseIn(BaseModel):
    name: str
    professor: str | None = None
    terms: list[str] = Field(default_factory=list, description="전공 용어. 앞쪽일수록 STT 힌트에서 우선")
    corrections: dict[str, str] = Field(default_factory=dict, description='{"틀린 표현": "올바른 표현"}')


class CoursePatch(BaseModel):
    name: str | None = None
    professor: str | None = None
    terms: list[str] | None = None
    corrections: dict[str, str] | None = None


class CorrectionIn(BaseModel):
    wrong: str
    right: str


def _course_dict(c: Course) -> dict:
    terms, corrections = _course_vocab(c)
    path = vocab.course_file(c.name)
    return {
        "id": c.id,
        "name": c.name,
        "professor": c.professor,
        "terms": terms,
        "corrections": corrections,
        "source": f"courses/{path.name}" if path.exists() else "db",
    }


def _get_course(db: Session, course_id: str) -> Course:
    course = db.get(Course, course_id)
    if not course:
        raise HTTPException(404, "과목을 찾을 수 없어요")
    return course


@app.post("/api/courses", status_code=201)
def create_course(body: CourseIn):
    with SessionLocal.begin() as db:
        if db.scalars(select(Course).where(Course.name == body.name)).first():
            raise HTTPException(409, "같은 이름의 과목이 이미 있어요")
        course = Course(name=body.name, professor=body.professor, terms=vocab.parse_terms(body.terms), corrections=body.corrections)
        db.add(course)
        db.flush()
        return _course_dict(course)


@app.get("/api/courses")
def list_courses():
    with SessionLocal() as db:
        return [_course_dict(c) for c in db.scalars(select(Course).order_by(Course.name)).all()]


@app.get("/api/courses/{course_id}")
def get_course(course_id: str):
    with SessionLocal() as db:
        return _course_dict(_get_course(db, course_id))


@app.patch("/api/courses/{course_id}")
def update_course(course_id: str, body: CoursePatch):
    """보낸 필드만 바꾼다 (terms, corrections는 통째로 교체). courses/<과목명>.txt 가 있으면 용어·교정은 파일을 고친다."""
    with SessionLocal.begin() as db:
        course = _get_course(db, course_id)
        if body.name is not None and body.name != course.name:
            old_file = vocab.course_file(course.name)
            if old_file.exists():
                old_file.rename(vocab.course_file(body.name))
            course.name = body.name
        if body.professor is not None:
            course.professor = body.professor
        from_file = vocab.load_course_file(course.name)
        if from_file and (body.terms is not None or body.corrections is not None):
            terms, corrections = from_file
            vocab.write_course_file(
                course.name,
                vocab.parse_terms(body.terms) if body.terms is not None else terms,
                body.corrections if body.corrections is not None else corrections,
            )
        else:
            if body.terms is not None:
                course.terms = vocab.parse_terms(body.terms)
            if body.corrections is not None:
                course.corrections = body.corrections
        return _course_dict(course)


@app.post("/api/courses/{course_id}/corrections")
def add_correction(course_id: str, body: CorrectionIn):
    """교정 하나 추가. 사용자가 전사본에서 틀린 단어를 고칠 때 호출하면 다음 강의부터 자동 적용된다."""
    with SessionLocal.begin() as db:
        course = _get_course(db, course_id)
        if vocab.course_file(course.name).exists():
            vocab.append_correction(course.name, body.wrong, body.right)
        else:
            # JSON 컬럼은 새 객체를 넣어야 변경이 저장된다
            course.corrections = {**course.corrections, body.wrong: body.right}
        return _course_dict(course)


@app.get("/playground", response_class=HTMLResponse, include_in_schema=False)
def playground():
    """퀴즈 생성을 직접 풀어보는 개발용 페이지"""
    return (Path(__file__).parent / "static" / "playground.html").read_text(encoding="utf-8")


@app.get("/health")
def health():
    return {"ok": True, "stt_model": config.WHISPER_MODEL, "device": config.WHISPER_DEVICE, "llm": DEFAULT_PROVIDER}
