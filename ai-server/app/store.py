"""앱 상태 저장소: studyapp Express가 메모리에 들고 있던 것(게시판, 폴더·태그, XP·리그, 오늘 복습)을 여기 둔다.

Express는 켜질 때 GET /api/store 로 전부 불러오고, 바뀔 때마다 PUT /api/store 로 통째로 저장한다.
키마다 JSON 한 덩어리라 정식 테이블은 아니다. 사용자별로 나눌 때(로그인) 정식 테이블로 옮긴다.
"""
import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import JSON, DateTime, String, select
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base, SessionLocal, _now

KEY = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,63}$")
MAX_BYTES = 5_000_000  # 키 하나당. 게시판 글 수천 개도 넉넉하다


class AppState(Base):
    """Express 상태. key 예: posts, comments, folders, me …"""

    __tablename__ = "app_state"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[Any] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class AppUser(Base):
    """studyapp 사용자. 비밀번호는 Express가 scrypt로 해시해서 보낸다. 이름은 Express 상태에도 있다(표시용)."""

    __tablename__ = "app_users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    login: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(32))
    password_hash: Mapped[str] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


router = APIRouter(prefix="/api/store", tags=["store"])


@router.get("")
def read_all() -> dict[str, Any]:
    """저장된 상태 전부. { key: value }. 비어 있으면 {}"""
    with SessionLocal() as db:
        return {row.key: row.value for row in db.scalars(select(AppState)).all()}


@router.put("")
def write_all(body: dict[str, Any]) -> dict[str, int]:
    """여러 키를 한 번에 저장(덮어쓰기). body = { key: value }"""
    for key in body:
        if not KEY.match(key):
            raise HTTPException(400, f"키 이름이 이상해요: {key}")
    with SessionLocal.begin() as db:
        rows = {row.key: row for row in db.scalars(select(AppState).where(AppState.key.in_(list(body)))).all()}
        for key, value in body.items():
            row = rows.get(key)
            if row is None:
                db.add(AppState(key=key, value=value))
            else:
                row.value = value
    return {"saved": len(body)}


# ---- 사용자 (로그인은 Express가 한다. 여기는 저장만) ----


class UserIn(BaseModel):
    id: str
    login: str
    name: str
    passwordHash: str


def _user_out(u: AppUser) -> dict[str, Any]:
    return {"id": u.id, "login": u.login, "name": u.name, "passwordHash": u.password_hash}


@router.post("/users", status_code=201)
def create_user(body: UserIn) -> dict[str, Any]:
    """가입. 아이디가 이미 있으면 409"""
    with SessionLocal.begin() as db:
        if db.scalars(select(AppUser).where(AppUser.login == body.login)).first():
            raise HTTPException(409, "이미 있는 아이디예요")
        u = AppUser(id=body.id, login=body.login, name=body.name, password_hash=body.passwordHash)
        db.add(u)
        db.flush()
        return _user_out(u)


@router.get("/users/{login}")
def get_user(login: str) -> dict[str, Any]:
    """로그인 확인용. 없으면 404"""
    with SessionLocal() as db:
        u = db.scalars(select(AppUser).where(AppUser.login == login)).first()
        if not u:
            raise HTTPException(404, "없는 아이디예요")
        return _user_out(u)
