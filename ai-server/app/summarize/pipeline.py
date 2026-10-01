"""강의 요약 흐름.

- 짧은 전사본: 한 번에 요약
- 긴 전사본: 구간별로 개념·공지를 뽑고(map), 개념을 합쳐 최종 요약(reduce)
- 공지는 LLM이 낸 근거 문장이 실제 전사본에 있는 것만 남긴다 (작은 모델이 시험 날짜 등을 지어내는 문제 방지)
"""
import os
import re
from dataclasses import dataclass, field

from app.summarize import prompt
from app.summarize.providers import DEFAULT_PROVIDER, LLMResult, call

# 이보다 긴 전사본은 구간별로 요약한다 (글자 수)
CHUNK_THRESHOLD = int(os.getenv("SUMMARY_CHUNK_THRESHOLD", "12000"))
CHUNK_SIZE = int(os.getenv("SUMMARY_CHUNK_SIZE", "6000"))
CHUNK_OVERLAP = 300


@dataclass
class SummaryResult:
    provider: str
    model: str
    summary: dict  # {title, overview, concepts: [{name, explanation}], announcements: [str]}
    latency_sec: float
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    extra: dict = field(default_factory=dict)


# ---------- 구간 나누기 ----------

_SENTENCE_END = re.compile(r"(?<=[.?!])\s+")


def split_chunks(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> list[str]:
    """문장 경계에서 size 글자 안팎으로 자른다. 경계에서 설명이 끊기지 않게 앞 구간 끝 문장을 조금 겹친다."""
    sentences = [s for s in _SENTENCE_END.split(text) if s.strip()]
    chunks, current, length = [], [], 0
    for sentence in sentences:
        if current and length + len(sentence) > size:
            chunks.append(" ".join(current))
            tail, tail_len = [], 0
            for s in reversed(current):
                if tail_len >= overlap:
                    break
                tail.insert(0, s)
                tail_len += len(s)
            current, length = tail, tail_len
        current.append(sentence)
        length += len(sentence) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks


# ---------- 공지 근거 확인 ----------

def _norm(s: str) -> str:
    return re.sub(r"[\s.,?!·'\"“”‘’~\-]", "", s)


def _ngrams(s: str, n: int = 4) -> set[str]:
    return {s[i : i + n] for i in range(len(s) - n + 1)}


class _Grounder:
    def __init__(self, transcript: str):
        self.text = _norm(transcript)
        self.grams = _ngrams(self.text)

    def is_grounded(self, evidence: str) -> bool:
        ev = _norm(evidence)
        if len(ev) < 6:
            return False
        if ev in self.text:
            return True
        # 모델이 문장을 살짝 다듬어 옮기는 경우를 허용
        grams = _ngrams(ev)
        return len(grams & self.grams) / len(grams) >= 0.7


def clean_announcements(items: list[dict], transcript: str) -> tuple[list[str], list[dict]]:
    """근거가 전사본에 있는 공지만 남기고 중복을 없앤다. (남은 공지, 버린 공지)"""
    grounder = _Grounder(transcript)
    kept, dropped, seen = [], [], set()
    for item in items:
        if not grounder.is_grounded(item.get("evidence", "")):
            dropped.append(item)
            continue
        key = _norm(item["text"])
        if key not in seen:
            seen.add(key)
            kept.append(item["text"])
    return kept, dropped


# ---------- 요약 ----------

def _add_usage(acc: dict, r: LLMResult) -> None:
    acc["latency"] += r.latency_sec
    for key, value in (("in", r.input_tokens), ("out", r.output_tokens), ("cost", r.cost_usd)):
        if value is not None:
            acc[key] = (acc[key] or 0) + value
    if r.extra.get("warning"):
        acc["warnings"].append(r.extra["warning"])


def summarize(
    transcript: str,
    terms: str | None = None,
    provider: str | None = None,
    mode: str = "auto",
    on_progress=None,
) -> SummaryResult:
    """mode: auto(길이로 결정) | single | chunked"""
    provider = provider or DEFAULT_PROVIDER
    if mode == "auto":
        mode = "chunked" if len(transcript) > CHUNK_THRESHOLD else "single"
    acc = {"latency": 0.0, "in": None, "out": None, "cost": None, "warnings": []}

    if mode == "single":
        r = call(provider, prompt.SYSTEM_PROMPT, prompt.build_user_message(transcript, terms), prompt.SUMMARY_SCHEMA)
        _add_usage(acc, r)
        model = r.model
        title, overview, concepts = r.data["title"], r.data["overview"], r.data["concepts"]
        raw_announcements = r.data["announcements"]
        chunk_count = 1
    else:
        chunks = split_chunks(transcript)
        chunk_count = len(chunks)
        chunk_concepts, raw_announcements = [], []
        for i, chunk in enumerate(chunks, 1):
            if on_progress:
                on_progress(i - 1, len(chunks) + 1)
            r = call(
                provider,
                prompt.CHUNK_SYSTEM_PROMPT,
                prompt.build_chunk_message(chunk, i, len(chunks), terms),
                prompt.CHUNK_SCHEMA,
            )
            _add_usage(acc, r)
            chunk_concepts.append(r.data["concepts"])
            raw_announcements += r.data["announcements"]

        if on_progress:
            on_progress(len(chunks), len(chunks) + 1)
        r = call(provider, prompt.MERGE_SYSTEM_PROMPT, prompt.build_merge_message(chunk_concepts, terms), prompt.MERGE_SCHEMA)
        _add_usage(acc, r)
        model = r.model
        title, overview, concepts = r.data["title"], r.data["overview"], r.data["concepts"]

    announcements, dropped = clean_announcements(raw_announcements, transcript)
    return SummaryResult(
        provider=provider,
        model=model,
        summary={"title": title, "overview": overview, "concepts": concepts, "announcements": announcements},
        latency_sec=acc["latency"],
        input_tokens=acc["in"],
        output_tokens=acc["out"],
        cost_usd=acc["cost"],
        extra={
            "mode": mode,
            "chunks": chunk_count,
            "dropped_announcements": dropped,
            "warnings": acc["warnings"],
        },
    )
