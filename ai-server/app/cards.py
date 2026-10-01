"""큐카드(플래시카드): 강의 처리 때 개념마다 1~3장 만들어 저장하고, 알아요/몰라요로 반복 학습한다.

반복은 라이트너 상자 방식이다. 몰라요 → 1번 상자(다음 세트에 바로), 알아요 → 한 칸 위.
상자별 다시 볼 간격은 기획서의 망각곡선 복습(1일·3일·7일)에 맞췄다.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db import Card, CardProgress, CardSession, Concept, Lecture, new_id
from app.quiz.service import _excerpt
from app.summarize.pipeline import Grounder
from app.summarize.providers import call

BOX_INTERVAL_DAYS = {1: 0, 2: 1, 3: 3, 4: 7, 5: 14}
MAX_BOX = 5

SYSTEM_PROMPT = """너는 대학 강의 복습용 큐카드(플래시카드)를 만든다. 학생은 앞면 질문을 보고 답을 떠올린 뒤, 카드를 뒤집어 확인한다.

규칙:
- 개념마다 1~3장. 중요한 개념이나 교수가 강조한 개념은 여러 장으로 나눠 다른 측면(정의, 이유, 비교, 계산)을 묻는다.
- front: 답을 떠올릴 수 있는 짧은 질문 (2~3줄 이내). 정답 단어를 질문에 그대로 쓰지 않는다.
- answer: 짧은 정답 (용어나 한 구절).
- explanation: 강의 내용으로만 쓴 설명 1~2문장, "~해요" 체. 강의에 없는 수치나 사실을 쓰지 않는다.
- example: 이해를 돕는 일상 비유나 예시 한 문장. 교수가 든 비유가 있으면 그것을 쓴다. 적절한 게 없으면 빈 문자열.
- icon: 카드 내용에 어울리는 이모지 하나.
- evidence: 근거가 된 전사본 문장을 고치지 말고 그대로 복사한다.
- conceptId는 주어진 목록에서 그대로 쓴다.
- 전사본은 음성 인식 결과라 오타가 있다. 카드에는 올바른 용어로 고쳐 쓴다.
- 한국어로 쓴다."""

_FIELDS = ["conceptId", "icon", "front", "answer", "explanation", "example", "evidence"]
SCHEMA = {
    "type": "object",
    "properties": {
        "cards": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {f: {"type": "string"} for f in _FIELDS},
                "required": _FIELDS,
                "additionalProperties": False,
            },
        }
    },
    "required": ["cards"],
    "additionalProperties": False,
}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    # SQLite는 시간대 정보를 버리고 돌려준다
    return dt.replace(tzinfo=timezone.utc) if dt and dt.tzinfo is None else dt


# ---------- 생성 ----------

def generate_cards(db: Session, lecture_id: str, provider: str) -> dict:
    """강의의 개념으로 큐카드를 만든다. 이전 카드와 학습 기록은 지운다. (통계)"""
    lecture = db.get(Lecture, lecture_id)
    concepts = db.scalars(select(Concept).where(Concept.lecture_id == lecture_id).order_by(Concept.position)).all()
    delete_cards(db, lecture_id)
    if not concepts:
        return {"made": 0}
    transcript = lecture.transcript_text or ""

    blocks = []
    for c in concepts:
        excerpt = _excerpt(transcript, c.term) or "(발췌 없음. 개념 설명만 근거로 쓰고, evidence에는 개념 설명 문장을 그대로 쓴다)"
        blocks.append(f"### 개념 id: {c.id} — {c.term}\n개념 설명: {c.summary}\n<transcript>\n{excerpt}\n</transcript>")
    result = call(provider, SYSTEM_PROMPT, "\n\n".join(blocks) + "\n\n위 개념들로 큐카드를 만들어줘.", SCHEMA)

    grounder = Grounder(transcript + " " + " ".join(c.summary for c in concepts))
    by_id = {c.id: c for c in concepts}
    order = {c.id: i for i, c in enumerate(concepts)}
    per_concept: dict[str, int] = {}
    dropped = {"invalid": 0, "ungrounded": 0, "unknown_concept": 0, "over_limit": 0}
    made = []
    for item in result.data.get("cards", []):
        cid = item.get("conceptId", "")
        if cid not in by_id:
            dropped["unknown_concept"] += 1
            continue
        if not item.get("front", "").strip() or not item.get("answer", "").strip():
            dropped["invalid"] += 1
            continue
        if per_concept.get(cid, 0) >= 3:
            dropped["over_limit"] += 1
            continue
        if not grounder.is_grounded(item.get("evidence", "")):
            dropped["ungrounded"] += 1
            continue
        per_concept[cid] = per_concept.get(cid, 0) + 1
        made.append(
            Card(
                lecture_id=lecture_id,
                concept_id=cid,
                # 개념 순서를 따르고, 같은 개념 안에서는 만든 순서
                position=order[cid] * 10 + per_concept[cid],
                icon=(item.get("icon") or "📚").strip()[:8],
                front=item["front"].strip(),
                answer=item["answer"].strip()[:300],
                explanation=item.get("explanation", "").strip(),
                example=item.get("example", "").strip() or None,
                evidence=item.get("evidence", "").strip(),
                provider=result.provider,
            )
        )
    db.add_all(made)
    db.flush()
    return {"made": len(made), "latency_sec": round(result.latency_sec, 1), "dropped": dropped}


def delete_cards(db: Session, lecture_id: str) -> None:
    card_ids = select(Card.id).where(Card.lecture_id == lecture_id)
    db.execute(delete(CardProgress).where(CardProgress.card_id.in_(card_ids)))
    db.execute(delete(CardSession).where(CardSession.lecture_id == lecture_id))
    db.execute(delete(Card).where(Card.lecture_id == lecture_id))


# ---------- 내보내기 ----------

def card_out(card: Card, progress: CardProgress | None = None) -> dict:
    return {
        "id": card.id,
        "lectureId": card.lecture_id,
        "conceptId": card.concept_id,
        "icon": card.icon,
        "front": card.front,
        "answer": card.answer,
        "explanation": card.explanation,
        "example": card.example,  # AI가 덧붙인 비유·예시 (강의 내용과 구분해서 보여준다)
        "box": progress.box if progress else None,  # 아직 안 본 카드는 null
        "dueAt": _aware(progress.due_at).isoformat() if progress and progress.due_at else None,
    }


def _progress_map(db: Session, card_ids: list[str], user_id: str | None) -> dict[str, CardProgress]:
    rows = db.scalars(
        select(CardProgress).where(CardProgress.card_id.in_(card_ids), CardProgress.user_id.is_(user_id) if user_id is None else CardProgress.user_id == user_id)
    ).all()
    return {p.card_id: p for p in rows}


def list_cards(db: Session, lecture_id: str, user_id: str | None = None) -> list[dict]:
    cards = db.scalars(select(Card).where(Card.lecture_id == lecture_id).order_by(Card.position)).all()
    progress = _progress_map(db, [c.id for c in cards], user_id)
    return [card_out(c, progress.get(c.id)) for c in cards]


# ---------- 학습 세트 ----------

def start_session(db: Session, lecture_id: str, count: int | None = None, user_id: str | None = None) -> dict | None:
    """다시 볼 때가 된 카드와 몰라요 카드(낮은 상자)를 앞에 둔다. count가 없으면 강의 카드 전부."""
    lecture = db.get(Lecture, lecture_id)
    cards = db.scalars(select(Card).where(Card.lecture_id == lecture_id)).all()
    if not lecture or not cards:
        return None
    progress = _progress_map(db, [c.id for c in cards], user_id)
    now = _now()

    def priority(card: Card):
        p = progress.get(card.id)
        due = p is None or p.due_at is None or _aware(p.due_at) <= now
        return (0 if due else 1, p.box if p else 0, card.position)

    chosen = sorted(cards, key=priority)[: count or len(cards)]
    session = CardSession(id=new_id("cs"), lecture_id=lecture_id, user_id=user_id, card_ids=[c.id for c in chosen])
    db.add(session)
    db.flush()
    return {
        "id": session.id,
        "lectureId": lecture_id,
        "title": lecture.title,
        "cards": [card_out(c, progress.get(c.id)) for c in chosen],
        "dueCount": sum(1 for c in chosen if priority(c)[0] == 0),
    }


def _apply(db: Session, card_id: str, known: bool, user_id: str | None, now: datetime) -> None:
    """라이트너 상자 갱신: 알아요 → 한 칸 위, 몰라요 → 1번 상자. 다시 볼 때를 상자 간격으로 정한다"""
    p = db.scalars(
        select(CardProgress).where(
            CardProgress.card_id == card_id,
            CardProgress.user_id.is_(user_id) if user_id is None else CardProgress.user_id == user_id,
        )
    ).first()
    if not p:
        p = CardProgress(card_id=card_id, user_id=user_id, box=1, known_count=0, unknown_count=0)
        db.add(p)
    if known:
        p.known_count += 1
        p.box = min(p.box + 1, MAX_BOX)
    else:
        p.unknown_count += 1
        p.box = 1
    p.last_reviewed_at = now
    p.due_at = now + timedelta(days=BOX_INTERVAL_DAYS[p.box])


def submit_session(db: Session, session_id: str, results: list[dict]) -> dict | None:
    """알아요/몰라요를 반영한다. 세트의 카드를 다 봤으면 finished=true (Express가 XP를 준다)."""
    session = db.get(CardSession, session_id)
    if not session:
        return None
    now = _now()
    seen, known = set(), 0
    for r in results:
        card_id = r.get("cardId")
        if card_id not in session.card_ids or card_id in seen or not isinstance(r.get("known"), bool):
            continue
        seen.add(card_id)
        _apply(db, card_id, r["known"], session.user_id, now)
        known += r["known"]
    finished = seen >= set(session.card_ids)
    if finished and not session.finished_at:
        session.finished_at = now
    db.flush()
    return {
        "sessionId": session.id,
        "lectureId": session.lecture_id,
        "finished": finished,
        "cardCount": len(session.card_ids),
        "known": known,
        "unknown": len(seen) - known,
    }


# ---------- 플래시카드 화면용 (강의·폴더·과목 어디서든) ----------

def cards_for(db: Session, concept_ids: list[str] | None, user_id: str | None = None) -> list[dict]:
    """개념 묶음의 카드. 다시 볼 때가 된 카드·몰라요 카드(낮은 상자)가 앞에 온다. concept_ids가 None이면 전체"""
    query = select(Card, Concept, Lecture).join(Concept, Card.concept_id == Concept.id).join(Lecture, Card.lecture_id == Lecture.id)
    if concept_ids is not None:
        if not concept_ids:
            return []
        query = query.where(Card.concept_id.in_(concept_ids))
    rows = db.execute(query).all()
    progress = _progress_map(db, [card.id for card, _, _ in rows], user_id)
    now = _now()

    def priority(row):
        card = row[0]
        p = progress.get(card.id)
        due = p is None or p.due_at is None or _aware(p.due_at) <= now
        return (0 if due else 1, p.box if p else 0, row[2].created_at, card.position)

    return [
        {**card_out(card, progress.get(card.id)), "term": concept.term, "lectureTitle": lecture.title}
        for card, concept, lecture in sorted(rows, key=priority)
    ]


def review(db: Session, results: list[dict], user_id: str | None = None) -> dict:
    """플래시카드 결과 [{cardId, known}]를 반영한다"""
    now = _now()
    known = unknown = 0
    for r in results:
        if not isinstance(r.get("known"), bool) or not db.get(Card, r.get("cardId")):
            continue
        _apply(db, r["cardId"], r["known"], user_id, now)
        known += r["known"]
        unknown += not r["known"]
    db.flush()
    return {"reviewed": known + unknown, "known": known, "unknown": unknown}
