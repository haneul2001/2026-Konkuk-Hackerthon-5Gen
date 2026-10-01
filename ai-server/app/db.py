"""DB: MVP는 SQLite. 출시 단계에서 DATABASE_URL만 PostgreSQL로 바꾸면 된다.

강의·개념·문제는 이 서버가 기준이다. 프론트 타입(studyapp/shared/types.ts)으로 바꾸는 건 app/schemas.py.
"""
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from app import config

config.DATA_DIR.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{(config.DATA_DIR / 'app.db').as_posix()}")

engine = create_engine(
    DATABASE_URL,
    # 작업 스레드와 요청 스레드가 같은 SQLite 파일을 쓴다
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(engine, expire_on_commit=False)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    """프론트 목 데이터와 같은 모양의 id (lec_…, con_…, q_…, quiz_…)"""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


class Base(DeclarativeBase):
    pass


class Course(Base):
    """과목. 용어집과 오인식 교정 사전을 과목 단위로 쌓아 STT 정확도를 높인다."""

    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str | None] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    professor: Mapped[str | None] = mapped_column(String(50))
    # STT hotwords로 쓰는 전공 용어 목록 (courses/<과목명>.txt 가 있으면 그 파일이 우선)
    terms: Mapped[list] = mapped_column(JSON, default=list)
    # STT가 자주 틀리는 표현 → 올바른 표현 (예: {"바이렉트메트": "다이렉트 매핑"})
    corrections: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Lecture(Base):
    """강의 녹음 1건. 업로드 → 전처리 → STT → 요약 진행 상태와 결과를 담는다."""

    __tablename__ = "lectures"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("lec"))
    # 로그인 붙이기 전까지는 비워둔다
    user_id: Mapped[str | None] = mapped_column(String(64), index=True)
    course_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    # 사용자가 제목을 안 줬으면 "N주차" 로 시작해서 요약이 끝나면 "N주차 — 주제" 로 채운다
    title_auto: Mapped[bool] = mapped_column(default=False)
    recorded_at: Mapped[str | None] = mapped_column(String(10))  # YYYY-MM-DD
    terms: Mapped[str | None] = mapped_column(Text)
    preset: Mapped[str] = mapped_column(String(32))
    # 다시 듣기용 녹음 원본 경로 (DATA_DIR 기준 상대 경로)
    audio_path: Mapped[str | None] = mapped_column(String(300))

    # queued → preprocessing → transcribing → summarizing → done / failed
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str | None] = mapped_column(Text)

    duration_sec: Mapped[float | None] = mapped_column(Float)
    speech_sec: Mapped[float | None] = mapped_column(Float)
    transcript_text: Mapped[str | None] = mapped_column(Text)
    segments: Mapped[list | None] = mapped_column(JSON)

    summary: Mapped[dict | None] = mapped_column(JSON)
    summary_provider: Mapped[str | None] = mapped_column(String(32))
    summary_model: Mapped[str | None] = mapped_column(String(64))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Concept(Base):
    """요약에서 뽑은 핵심 개념 = 서재의 개념 카드. 문제는 개념에 연결된다."""

    __tablename__ = "concepts"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("con"))
    lecture_id: Mapped[str] = mapped_column(String(32), ForeignKey("lectures.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)  # 강의 안에서의 순서
    term: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text)
    # new → learning → mastered (퀴즈 결과로 갱신)
    mastery: Mapped[str] = mapped_column(String(10), default="new")


class Question(Base):
    """생성된 문제. 퀴즈를 만들 때마다 새로 생성하고, 틀린 문제는 가중치를 높여 다시 낸다."""

    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("q"))
    lecture_id: Mapped[str] = mapped_column(String(32), ForeignKey("lectures.id", ondelete="CASCADE"), index=True)
    concept_id: Mapped[str] = mapped_column(String(32), ForeignKey("concepts.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(10), index=True)  # multiple | ox | essay
    prompt: Mapped[str] = mapped_column(Text)
    explanation: Mapped[str] = mapped_column(Text)
    # 유형별 정답 정보: multiple {choices, answerIndex} / ox {answer} / essay {modelAnswer, keywords}
    body: Mapped[dict] = mapped_column(JSON)
    # 문제의 근거가 된 전사본 문장 (강의에 없는 내용으로 출제하지 않았는지 확인용)
    evidence: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(String(32))

    times_asked: Mapped[int] = mapped_column(Integer, default=0)
    times_wrong: Mapped[int] = mapped_column(Integer, default=0)
    # 연속으로 틀린 횟수. 맞히면 0으로 돌아간다. 다시 낼 때 가중치로 쓴다
    wrong_streak: Mapped[int] = mapped_column(Integer, default=0)
    last_answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Quiz(Base):
    """출제 기록. 제출할 때 어떤 문제가 나갔는지 확인한다."""

    __tablename__ = "quizzes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: new_id("quiz"))
    source: Mapped[dict] = mapped_column(JSON)  # {kind, id}
    title: Mapped[str] = mapped_column(String(200))
    question_ids: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# MVP용 간단 마이그레이션: 기존 DB에 새 컬럼 추가 (출시 전에는 Alembic으로 바꾼다)
_LECTURE_COLUMNS = {
    "course_id": "VARCHAR(32) REFERENCES courses(id)",
    "title_auto": "BOOLEAN DEFAULT 0",
    "recorded_at": "VARCHAR(10)",
    "audio_path": "VARCHAR(300)",
}


def init_db() -> None:
    Base.metadata.create_all(engine)
    columns = {c["name"] for c in inspect(engine).get_columns("lectures")}
    with engine.begin() as conn:
        for name, ddl in _LECTURE_COLUMNS.items():
            if name not in columns:
                conn.execute(text(f"ALTER TABLE lectures ADD COLUMN {name} {ddl}"))
