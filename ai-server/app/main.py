"""녹음 업로드 → 전처리 → STT → LLM 요약 백엔드.

90분 강의는 처리에 몇 분 걸리므로 업로드하면 강의(lecture)를 만들고 바로 응답하고,
클라이언트는 GET /lectures/{id} 로 상태를 폴링한다.
GPU가 하나라 작업은 한 번에 하나씩 순서대로 처리한다.
"""
import shutil
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import select, update

from app import config, stt, vocab
from app.audio import PRESETS, preprocess
from app.db import Course, Lecture, SessionLocal, init_db
from app.summarize.pipeline import summarize
from app.summarize.providers import DEFAULT_PROVIDER, LOCAL_PROVIDERS, PROVIDERS

UPLOAD_DIR = config.DATA_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_executor = ThreadPoolExecutor(max_workers=1)
_ACTIVE = ("queued", "preprocessing", "transcribing", "summarizing")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    # 서버가 처리 도중 꺼졌던 작업은 이어서 할 수 없으니 실패로 표시한다
    with SessionLocal.begin() as db:
        db.execute(
            update(Lecture).where(Lecture.status.in_(_ACTIVE)).values(status="failed", error="server restarted during processing")
        )
    yield
    _executor.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="학습도우미 오디오 백엔드", lifespan=lifespan)


def _set(lecture_id: str, **values) -> None:
    with SessionLocal.begin() as db:
        db.execute(update(Lecture).where(Lecture.id == lecture_id).values(**values))


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


def _course_vocab(course: Course) -> tuple[list[str], dict[str, str]]:
    """courses/<과목명>.txt 가 있으면 파일, 없으면 DB"""
    from_file = vocab.load_course_file(course.name)
    return from_file if from_file else (course.terms, dict(course.corrections))


def _summarize_step(lecture_id: str, transcript: str, terms: str | None, provider: str) -> None:
    _set(lecture_id, status="summarizing")
    if provider in LOCAL_PROVIDERS:
        # Whisper와 로컬 LLM이 동시에 GPU에 올라가면 VRAM이 넘쳐 극단적으로 느려진다
        stt.unload_model()
    result = summarize(transcript, terms, provider)
    _set(lecture_id, status="done", summary=result.summary, summary_provider=result.provider, summary_model=result.model, error=None)


def _run_pipeline(lecture_id: str, src: Path, preset: str, provider: str) -> None:
    wav = src.with_name(f"{lecture_id}.{preset}.wav")
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

        # 요약이 실패해도 전사본은 남아 있으니 POST /lectures/{id}/summary 로 다시 시도할 수 있다
        _summarize_step(lecture_id, transcript, vocab.hotwords(summary_terms), provider)
    except Exception as e:
        _set(lecture_id, status="failed", error=f"{type(e).__name__}: {e}")
    finally:
        if not config.KEEP_AUDIO_FILES:
            src.unlink(missing_ok=True)
            wav.unlink(missing_ok=True)


def _resummarize(lecture_id: str, provider: str) -> None:
    with SessionLocal() as db:
        transcript = db.get(Lecture, lecture_id).transcript_text
    try:
        _, _, summary_terms = _vocab_for(lecture_id)
        _summarize_step(lecture_id, transcript, vocab.hotwords(summary_terms), provider)
    except Exception as e:
        _set(lecture_id, status="failed", error=f"{type(e).__name__}: {e}")


def _to_dict(lec: Lecture, full: bool = True) -> dict:
    data = {
        "id": lec.id,
        "course_id": lec.course_id,
        "title": lec.title,
        "status": lec.status,
        "progress": lec.progress,
        "error": lec.error,
        "preset": lec.preset,
        "duration_sec": lec.duration_sec,
        "summary_provider": lec.summary_provider,
        "summary_model": lec.summary_model,
        "created_at": lec.created_at.isoformat(),
    }
    if full:
        data.update(terms=lec.terms, summary=lec.summary, transcript_text=lec.transcript_text, segments=lec.segments)
    return data


def _check_provider(provider: str) -> None:
    if provider not in PROVIDERS:
        raise HTTPException(400, f"provider must be one of {list(PROVIDERS)}")


@app.post("/lectures", status_code=202)
def create_lecture(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    course_id: str | None = Form(None, description="과목 id. 과목 용어집·교정 사전이 적용된다"),
    terms: str | None = Form(None, description="이 강의에만 쓸 추가 용어, 쉼표로 구분"),
    preset: str = Form(config.DEFAULT_PRESET, description=f"전처리 프리셋: {list(PRESETS)}"),
    provider: str = Form(DEFAULT_PROVIDER, description=f"요약 LLM: {list(PROVIDERS)}"),
):
    if preset not in PRESETS:
        raise HTTPException(400, f"preset must be one of {list(PRESETS)}")
    _check_provider(provider)

    with SessionLocal.begin() as db:
        if course_id and not db.get(Course, course_id):
            raise HTTPException(404, "course not found")
        lec = Lecture(title=title or Path(file.filename or "녹음").stem, course_id=course_id, terms=terms, preset=preset)
        db.add(lec)
        db.flush()
        lecture_id = lec.id

    src = UPLOAD_DIR / f"{lecture_id}{Path(file.filename or '').suffix}"
    with src.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    _executor.submit(_run_pipeline, lecture_id, src, preset, provider)
    return {"id": lecture_id, "status": "queued"}


@app.get("/lectures")
def list_lectures():
    with SessionLocal() as db:
        lectures = db.scalars(select(Lecture).order_by(Lecture.created_at.desc())).all()
        return [_to_dict(lec, full=False) for lec in lectures]


@app.get("/lectures/{lecture_id}")
def get_lecture(lecture_id: str):
    with SessionLocal() as db:
        lec = db.get(Lecture, lecture_id)
        if not lec:
            raise HTTPException(404, "lecture not found")
        return _to_dict(lec)


@app.post("/lectures/{lecture_id}/summary", status_code=202)
def resummarize(lecture_id: str, provider: str = DEFAULT_PROVIDER):
    """전사본으로 요약만 다시 만든다 (요약 실패 시 재시도, 다른 LLM으로 바꿔보기)."""
    _check_provider(provider)
    with SessionLocal() as db:
        lec = db.get(Lecture, lecture_id)
        if not lec:
            raise HTTPException(404, "lecture not found")
        if not lec.transcript_text:
            raise HTTPException(409, "transcript not ready")
        if lec.status in _ACTIVE:
            raise HTTPException(409, f"lecture is {lec.status}")
    _set(lecture_id, status="queued")
    _executor.submit(_resummarize, lecture_id, provider)
    return {"id": lecture_id, "status": "queued"}


@app.delete("/lectures/{lecture_id}", status_code=204)
def delete_lecture(lecture_id: str):
    with SessionLocal.begin() as db:
        lec = db.get(Lecture, lecture_id)
        if not lec:
            raise HTTPException(404, "lecture not found")
        if lec.status in _ACTIVE:
            raise HTTPException(409, f"lecture is {lec.status}")
        db.delete(lec)


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


@app.post("/courses", status_code=201)
def create_course(body: CourseIn):
    with SessionLocal.begin() as db:
        course = Course(name=body.name, professor=body.professor, terms=vocab.parse_terms(body.terms), corrections=body.corrections)
        db.add(course)
        db.flush()
        return _course_dict(course)


@app.get("/courses")
def list_courses():
    with SessionLocal() as db:
        return [_course_dict(c) for c in db.scalars(select(Course).order_by(Course.name)).all()]


@app.get("/courses/{course_id}")
def get_course(course_id: str):
    with SessionLocal() as db:
        course = db.get(Course, course_id)
        if not course:
            raise HTTPException(404, "course not found")
        return _course_dict(course)


@app.patch("/courses/{course_id}")
def update_course(course_id: str, body: CoursePatch):
    """보낸 필드만 바꾼다 (terms, corrections는 통째로 교체). courses/<과목명>.txt 가 있으면 용어·교정은 파일을 고친다."""
    with SessionLocal.begin() as db:
        course = db.get(Course, course_id)
        if not course:
            raise HTTPException(404, "course not found")
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


@app.post("/courses/{course_id}/corrections")
def add_correction(course_id: str, body: CorrectionIn):
    """교정 하나 추가. 사용자가 전사본에서 틀린 단어를 고칠 때 호출하면 다음 강의부터 자동 적용된다."""
    with SessionLocal.begin() as db:
        course = db.get(Course, course_id)
        if not course:
            raise HTTPException(404, "course not found")
        if vocab.course_file(course.name).exists():
            vocab.append_correction(course.name, body.wrong, body.right)
        else:
            # JSON 컬럼은 새 객체를 넣어야 변경이 저장된다
            course.corrections = {**course.corrections, body.wrong: body.right}
        return _course_dict(course)


@app.get("/health")
def health():
    return {"ok": True, "stt_model": config.WHISPER_MODEL, "device": config.WHISPER_DEVICE, "summary_provider": DEFAULT_PROVIDER}
