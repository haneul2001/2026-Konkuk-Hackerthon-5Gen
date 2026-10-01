"""개념 이름을 과목 용어집의 표준 용어로 맞춘다 (요약이 끝난 뒤).

작은 모델은 개념 이름을 틀린 전문 용어로 짓기도 한다 (예: '다인실' 비유로 설명한 세트 연관 캐시를 '세그먼트 매핑 캐시'로).
용어집을 요약 프롬프트에 넣으면 강의에서 안 다룬 용어까지 개념으로 지어내서, 요약이 끝난 뒤 이름만 따로 맞춘다.
LLM은 용어집 목록에서 번호로만 고를 수 있다 (목록 밖의 이름을 만들지 않는다).
"""
import re

from app.summarize.providers import call

SYSTEM = """너는 대학 강의 요약의 개념 이름을 과목 표준 용어로 맞춘다.
각 개념의 설명을 읽고, 용어집에서 정확히 같은 개념을 가리키는 용어가 있으면 그 번호를 고른다.
- 이름이 비슷해도 다른 개념이면 고르지 않는다 (예: '캐시 교체 알고리즘'을 '캐시'로 바꾸지 않는다).
- 개념이 용어집 용어보다 넓거나 좁으면 고르지 않는다.
- 맞는 용어가 없거나 애매하면 0을 쓴다."""

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"conceptId": {"type": "string"}, "pick": {"type": "integer"}},
                "required": ["conceptId", "pick"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


def _norm(text: str) -> str:
    return re.sub(r"\s+", "", text).lower()


def normalize_names(concepts: list[dict], vocabulary: list[str], provider: str) -> dict[str, str]:
    """concepts: [{id, term, summary}] → {conceptId: 용어집 이름} (바꿀 것만)"""
    if not concepts or not vocabulary:
        return {}
    numbered = "\n".join(f"{i}. {t}" for i, t in enumerate(vocabulary, 1))
    listing = "\n".join(f"- {c['id']}: {c['term']} — {c['summary'][:200]}" for c in concepts)
    message = f"## 용어집\n{numbered}\n\n## 개념\n{listing}\n\n개념마다 맞는 용어집 번호를 골라줘 (없으면 0)."
    picks = call(provider, SYSTEM, message, SCHEMA).data.get("items", [])

    current = {c["id"]: c["term"] for c in concepts}
    renamed = {}
    for pick in picks:
        cid, n = pick.get("conceptId"), pick.get("pick")
        if cid not in current or not isinstance(n, int) or not 1 <= n <= len(vocabulary):
            continue  # 용어집 밖은 받지 않는다
        new = vocabulary[n - 1]
        if _norm(new) != _norm(current[cid]):
            renamed[cid] = new
    return renamed
