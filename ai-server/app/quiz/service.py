"""퀴즈 출제·채점 반영.

출제(POST /api/quiz)할 때마다 LLM으로 새 문제를 만든다. 단,
- 전에 틀린 문제는 연속으로 틀린 횟수만큼 가중치를 높여 다시 낸다 (최대 문제 수의 절반)
- 새 문제도 많이 틀린 개념, 아직 익히지 못한 개념에서 더 많이 나오게 한다
- 문제마다 근거 문장을 받고, 전사본에 없는 근거로 만든 문제는 버린다
"""
import math
import random
import re
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import Concept, Lecture, Question, Quiz, new_id
from app.quiz import prompt
from app.summarize.pipeline import Grounder
from app.summarize.providers import DEFAULT_PROVIDER, SummaryError, call

QUESTION_TYPES = ("multiple", "ox", "essay")
MAX_REUSE_RATIO = 0.5  # 다시 내는 틀린 문제는 최대 이 비율까지
EXCERPT_CHARS = 1200  # 개념당 전사본 발췌 길이
AVOID_LIMIT = 30  # "이미 낸 문제"로 보여줄 최대 개수


# ---------- 출제 범위 ----------

def scope_concepts(db: Session, source: dict, concept_ids: list[str] | None) -> tuple[str, list[Concept]] | None:
    """(퀴즈 제목, 개념 목록). 강의면 강의의 개념 전체, 폴더면 Express가 넘겨준 개념 id들."""
    kind = source.get("kind")
    if kind == "lecture":
        lecture = db.get(Lecture, source.get("id"))
        if not lecture:
            return None
        concepts = db.scalars(select(Concept).where(Concept.lecture_id == lecture.id).order_by(Concept.position)).all()
        return lecture.title, list(concepts)
    if kind == "folder":
        ids = concept_ids or []
        concepts = db.scalars(select(Concept).where(Concept.id.in_(ids))).all() if ids else []
        return source.get("title") or "폴더 퀴즈", list(concepts)
    return None


# ---------- 가중치 ----------

def _reuse_weight(q: Question) -> float:
    # 연속으로 틀릴수록 두 배씩 (최대 16배)
    return 2.0 ** min(q.wrong_streak, 4)


def _concept_weight(concept: Concept, wrong_count: int) -> float:
    base = {"new": 1.5, "learning": 1.5, "mastered": 0.5}.get(concept.mastery, 1.0)
    return base + wrong_count


def _weighted_sample(items: list, weights: list[float], k: int) -> list:
    """가중치 비복원 추출"""
    items, weights, picked = list(items), list(weights), []
    for _ in range(min(k, len(items))):
        i = random.choices(range(len(items)), weights=weights)[0]
        picked.append(items.pop(i))
        weights.pop(i)
    return picked


def _allocate(need: int, concepts: list[Concept], weights: list[float]) -> dict[str, int]:
    """새 문제 need개를 개념에 나눈다. 가중치대로 뽑되 한 개념에 몰리지 않게 상한을 둔다."""
    cap = math.ceil(need / len(concepts)) + 1
    counts = {c.id: 0 for c in concepts}
    for _ in range(need):
        open_ = [(c, w) for c, w in zip(concepts, weights) if counts[c.id] < cap]
        if not open_:
            break
        c = random.choices([c for c, _ in open_], weights=[w for _, w in open_])[0]
        counts[c.id] += 1
    return {cid: n for cid, n in counts.items() if n}


# ---------- 문제 생성 ----------

def _norm(s: str) -> str:
    return re.sub(r"\s+", "", s).lower()


def _excerpt(transcript: str, term: str) -> str:
    """전사본에서 개념 용어가 나온 부분 주변을 잘라온다. 못 찾으면 빈 문자열."""
    if not transcript:
        return ""
    candidates = [term] + [w for w in re.split(r"[\s()/,·]+", term) if len(w) >= 2]
    for word in candidates:
        i = transcript.find(word)
        if i >= 0:
            start = max(0, i - EXCERPT_CHARS // 3)
            return transcript[start : start + EXCERPT_CHARS]
    return ""


def _grams(s: str, n: int = 3) -> set[str]:
    s = _norm(s)
    return {s[i : i + n] for i in range(len(s) - n + 1)}


def _similar(a: set[str], b: set[str], threshold: float) -> bool:
    return bool(a and b) and len(a & b) / len(a | b) >= threshold


def _answer_text(qtype: str, body: dict) -> str:
    """정답 쪽 내용. 질문 문장이 달라도 정답이 같으면 사실상 같은 문제다"""
    if qtype == "multiple":
        return body["choices"][body["answerIndex"]]
    if qtype == "essay":
        return " ".join(w for group in body["keywords"] for w in group)
    return ""  # O/X는 질문 문장 자체가 정답이다


def _is_duplicate(sig: tuple[set[str], set[str]], seen: list[tuple[set[str], set[str]]]) -> bool:
    return any(_similar(sig[0], s[0], 0.5) or _similar(sig[1], s[1], 0.7) for s in seen)


def _valid(qtype: str, item: dict) -> bool:
    if not item.get("prompt", "").strip():
        return False
    if qtype == "multiple":
        choices = [c.strip() for c in item.get("choices", [])]
        return (
            len(choices) == 4
            and len({_norm(c) for c in choices}) == 4
            and all(choices)
            and isinstance(item.get("answerIndex"), int)
            and 0 <= item["answerIndex"] < 4
        )
    if qtype == "ox":
        return isinstance(item.get("answer"), bool)
    if qtype == "essay":
        keywords = item.get("keywords") or []
        return bool(item.get("modelAnswer", "").strip()) and bool(keywords) and all(
            isinstance(g, list) and any(str(w).strip() for w in g) for g in keywords
        )
    return False


def _body(qtype: str, item: dict) -> dict:
    if qtype == "multiple":
        return {"choices": [c.strip() for c in item["choices"]], "answerIndex": item["answerIndex"]}
    if qtype == "ox":
        return {"answer": item["answer"]}
    return {
        "modelAnswer": item["modelAnswer"].strip(),
        "keywords": [[str(w).strip() for w in g if str(w).strip()] for g in item["keywords"]],
    }


def generate_questions(
    db: Session,
    qtype: str,
    allocation: dict[str, int],
    concepts: dict[str, Concept],
    provider: str,
) -> tuple[list[Question], dict]:
    """allocation대로 새 문제를 만들어 저장한다. (만든 문제, 통계)"""
    lectures = {c.lecture_id for c in concepts.values() if c.id in allocation}
    transcripts = {lid: (db.get(Lecture, lid).transcript_text or "") for lid in lectures}

    plan = [
        {
            "id": cid,
            "term": concepts[cid].term,
            "summary": concepts[cid].summary,
            "excerpt": _excerpt(transcripts[concepts[cid].lecture_id], concepts[cid].term),
            "count": n,
        }
        for cid, n in allocation.items()
    ]
    avoid = db.scalars(
        select(Question)
        .where(Question.concept_id.in_(list(allocation)), Question.type == qtype)
        .order_by(Question.created_at.desc())
        .limit(AVOID_LIMIT)
    ).all()

    result = call(provider, prompt.SYSTEM_PROMPT, prompt.build_user_message(qtype, plan, [q.prompt for q in avoid]), prompt.schema_for(qtype))

    # 근거 확인: 전사본 또는 (발췌가 없을 때) 개념 설명에 있는 문장이어야 한다
    grounders = {
        lid: Grounder(text + " " + " ".join(c.summary for c in concepts.values() if c.lecture_id == lid))
        for lid, text in transcripts.items()
    }
    by_term = {_norm(c.term): c.id for c in concepts.values() if c.id in allocation}
    made, dropped = [], {"invalid": 0, "ungrounded": 0, "unknown_concept": 0, "over_quota": 0, "duplicate": 0}
    # 이미 낸 문제와 이번에 만든 문제의 (질문, 정답) 특징
    seen = [(_grams(q.prompt), _grams(_answer_text(q.type, q.body))) for q in avoid]
    for item in result.data.get("questions", []):
        cid = item.get("conceptId", "")
        if cid not in allocation:
            # 모델이 id 대신 용어를 쓴 경우를 살린다
            cid = by_term.get(_norm(cid), "")
        if not cid:
            dropped["unknown_concept"] += 1
            continue
        # 개념별 배분은 권장이다. 모델이 한 개념에 더 냈어도 전체 개수 안이면 받는다
        if len(made) >= sum(allocation.values()):
            dropped["over_quota"] += 1
            continue
        if not _valid(qtype, item):
            dropped["invalid"] += 1
            continue
        sig = (_grams(item["prompt"]), _grams(_answer_text(qtype, _body(qtype, item))))
        if _is_duplicate(sig, seen):
            dropped["duplicate"] += 1
            continue
        concept = concepts[cid]
        if not grounders[concept.lecture_id].is_grounded(item.get("evidence", "")):
            dropped["ungrounded"] += 1
            continue
        q = Question(
            lecture_id=concept.lecture_id,
            concept_id=cid,
            type=qtype,
            prompt=item["prompt"].strip(),
            explanation=item.get("explanation", "").strip(),
            body=_body(qtype, item),
            evidence=item.get("evidence", "").strip(),
            provider=result.provider,
        )
        db.add(q)
        made.append(q)
        seen.append(sig)
    db.flush()
    return made, {"latency_sec": round(result.latency_sec, 1), "dropped": dropped}


# ---------- 출제 ----------

def to_frontend(q: Question, shuffle_choices: bool = True) -> dict:
    """studyapp/shared/types.ts 의 QuizQuestion 모양"""
    data = {"id": q.id, "conceptId": q.concept_id, "type": q.type, "prompt": q.prompt, "explanation": q.explanation}
    if q.type == "multiple":
        choices, answer = q.body["choices"], q.body["answerIndex"]
        if shuffle_choices:
            order = random.sample(range(len(choices)), len(choices))
            choices, answer = [choices[i] for i in order], order.index(answer)
        data.update(choices=choices, answerIndex=answer)
    elif q.type == "ox":
        data["answer"] = q.body["answer"]
    else:
        data.update(modelAnswer=q.body["modelAnswer"], keywords=q.body["keywords"])
        data["explanation"] = data["explanation"] or q.body["modelAnswer"]
    return data


def build_quiz(
    db: Session,
    source: dict,
    qtype: str,
    count: int,
    concept_ids: list[str] | None = None,
    provider: str | None = None,
) -> dict | None:
    scope = scope_concepts(db, source, concept_ids)
    if not scope or not scope[1]:
        return None
    title, concepts = scope
    ids = [c.id for c in concepts]

    # 1) 전에 틀린 문제 다시 내기
    wrong = db.scalars(
        select(Question).where(Question.concept_id.in_(ids), Question.type == qtype, Question.wrong_streak > 0)
    ).all()
    reuse_n = min(len(wrong), max(1, int(count * MAX_REUSE_RATIO))) if wrong else 0
    reused = _weighted_sample(wrong, [_reuse_weight(q) for q in wrong], reuse_n)

    # 2) 나머지는 새로 생성. 많이 틀린 개념, 아직 못 익힌 개념에 더 배분한다
    need = count - len(reused)
    stats: dict = {"reused": len(reused)}
    generated: list[Question] = []
    if need > 0:
        wrong_by_concept: dict[str, int] = {}
        for cid, n in db.execute(select(Question.concept_id, Question.times_wrong).where(Question.concept_id.in_(ids))):
            wrong_by_concept[cid] = wrong_by_concept.get(cid, 0) + n
        weights = [_concept_weight(c, wrong_by_concept.get(c.id, 0)) for c in concepts]
        by_id = {c.id: c for c in concepts}
        try:
            # 중복·근거 없음으로 버려져 모자라면 한 번 더 만든다 (이번에 만든 문제는 "이미 낸 문제"로 들어간다)
            for attempt in range(2):
                shortfall = need - len(generated)
                if shortfall <= 0:
                    break
                made, gen_stats = generate_questions(db, qtype, _allocate(shortfall, concepts, weights), by_id, provider or DEFAULT_PROVIDER)
                generated += made
                stats[f"attempt{attempt + 1}"] = {"made": len(made), **gen_stats}
            stats["generated"] = len(generated)
        except SummaryError as e:
            stats["error"] = str(e)
            if not reused and not generated:
                raise

    questions = reused + generated
    if not questions:
        return None
    random.shuffle(questions)
    quiz = Quiz(id=new_id("quiz"), source=source, title=title, question_ids=[q.id for q in questions])
    db.add(quiz)
    for q in questions:
        q.times_asked += 1
    db.flush()
    return {
        "id": quiz.id,
        "title": title,
        "source": source,
        # retry: 전에 틀려서 다시 낸 문제 (화면에서 "다시 도전" 표시용)
        "questions": [{**to_frontend(q), "retry": q in reused} for q in questions],
        "meta": stats,
    }


def build_review_quiz(db: Session, lecture_id: str, reason: str, count: int, review_id: str) -> dict | None:
    """오늘 복습 퀴즈. 생성 없이 저장된 문제에서 낸다.
    reason=wrong: 아직 다시 맞히지 못한 틀린 문제 / interval: 전에 낸 문제 중 자동 채점되는 것"""
    lecture = db.get(Lecture, lecture_id)
    if not lecture:
        return None
    if reason == "wrong":
        pool = db.scalars(select(Question).where(Question.lecture_id == lecture_id, Question.wrong_streak > 0)).all()
        questions = _weighted_sample(pool, [_reuse_weight(q) for q in pool], count)
    else:
        pool = db.scalars(
            select(Question).where(Question.lecture_id == lecture_id, Question.type != "essay", Question.times_asked > 0)
        ).all()
        questions = random.sample(list(pool), min(count, len(pool)))
    if not questions:
        return None
    source = {"kind": "review", "id": review_id}
    quiz = Quiz(id=new_id("quiz"), source=source, title=lecture.title, question_ids=[q.id for q in questions])
    db.add(quiz)
    for q in questions:
        q.times_asked += 1
    db.flush()
    return {"id": quiz.id, "title": lecture.title, "source": source, "questions": [to_frontend(q) for q in questions]}


# ---------- 채점 결과 반영 ----------

def submit(db: Session, quiz_id: str, results: list[dict]) -> dict | None:
    """문제별 맞음/틀림을 반영해 다음 출제 가중치와 개념 숙련도를 갱신한다.
    XP·연속 학습일·리그는 Express(studyapp)가 처리하므로, 그쪽에 필요한 문제 → 강의·개념 연결을 돌려준다."""
    quiz = db.get(Quiz, quiz_id)
    if not quiz:
        return None
    now = datetime.now(timezone.utc)
    graded, by_concept = [], {}
    for r in results:
        q = db.get(Question, r.get("questionId"))
        if not q or q.id not in quiz.question_ids:
            continue
        correct = r.get("correct")
        graded.append({"questionId": q.id, "lectureId": q.lecture_id, "conceptId": q.concept_id, "correct": correct})
        if correct is None:  # 서술형은 자동 채점하지 않는다
            continue
        q.last_answered_at = now
        if correct:
            q.wrong_streak = 0
        else:
            q.times_wrong += 1
            q.wrong_streak += 1
        by_concept[q.concept_id] = by_concept.get(q.concept_id, True) and bool(correct)

    # 개념 숙련도: 하나라도 틀리면 익히는 중, 다 맞으면 한 단계 올린다 (studyapp/shared/quiz.ts 와 같은 규칙)
    concepts = []
    for cid, all_right in by_concept.items():
        c = db.get(Concept, cid)
        if not c:
            continue
        if not all_right:
            c.mastery = "learning"
        else:
            c.mastery = "learning" if c.mastery == "new" else "mastered"
        concepts.append({"id": c.id, "mastery": c.mastery})
    quiz.submitted_at = now
    db.flush()
    return {"quizId": quiz_id, "graded": graded, "concepts": concepts}
