"""DB: MVP는 SQLite. 출시 단계에서 DATABASE_URL만 PostgreSQL로 바꾸면 된다."""
import os
import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, Float, ForeignKey, String, Text, create_engine, inspect, text
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


class Base(DeclarativeBase):
    pass


class Course(Base):
    """과목. 용어집과 오인식 교정 사전을 과목 단위로 쌓아 STT·요약 정확도를 높인다."""

    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id: Mapped[str | None] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(100))
    professor: Mapped[str | None] = mapped_column(String(50))
    # STT hotwords와 요약 힌트로 쓰는 전공 용어 목록
    terms: Mapped[list] = mapped_column(JSON, default=list)
    # STT가 자주 틀리는 표현 → 올바른 표현 (예: {"바이렉트메트": "다이렉트 매핑"})
    corrections: Mapped[dict] = mapped_column(JSON, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class Lecture(Base):
    """강의 녹음 1건. 업로드 → 전처리 → STT → 요약 진행 상태와 결과를 담는다."""

    __tablename__ = "lectures"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    # 로그인 붙이기 전까지는 비워둔다
    user_id: Mapped[str | None] = mapped_column(String(64), index=True)
    course_id: Mapped[str | None] = mapped_column(String(32), ForeignKey("courses.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    terms: Mapped[str | None] = mapped_column(Text)
    preset: Mapped[str] = mapped_column(String(32))

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


def init_db() -> None:
    Base.metadata.create_all(engine)
    # MVP용 간단 마이그레이션: 기존 DB에 새 컬럼 추가 (출시 전에는 Alembic으로 바꾼다)
    columns = {c["name"] for c in inspect(engine).get_columns("lectures")}
    if "course_id" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE lectures ADD COLUMN course_id VARCHAR(32) REFERENCES courses(id)"))
