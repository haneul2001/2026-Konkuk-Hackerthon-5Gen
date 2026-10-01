"""모든 LLM 제공자가 공유하는 요약 프롬프트와 출력 스키마.

벤치마크를 공정하게 하려고 제공자별로 프롬프트를 바꾸지 않는다.
"""

_RULES = """규칙:
- 강의 내용만 요약한다. 학생 잡담, 수업과 무관한 대화, 출석 확인, 농담, 수업이 끝난 뒤의 대화, 마이크·장비 소리 등은 무시한다.
- 전사본은 STT 결과라 잘못 인식된 단어가 있다. 문맥상 명백하면 올바른 용어로 고쳐서 쓴다 (예: "올옥렘" → "O(log n)").
- 전사본에 없는 내용을 지어내지 않는다. 교수가 말하지 않은 수치, 예시, 정의, 용어를 덧붙이지 않는다. 비유로 설명했다면 그 비유를 그대로 살린다.
- 교수가 "시험에 나온다", "헷갈린다", "주의해야 한다"처럼 강조한 내용과 공식·수식은 반드시 해당 개념에 포함한다.
- 개념 하나는 복습 카드 한 장 분량(2~4문장)으로, 정의와 교수가 강조한 포인트를 담는다.
- 공지(announcements)는 시험·과제·휴강·일정처럼 교수가 실제로 말한 수업 운영 정보만 담는다. 날짜·마감·감점 규칙까지 쓴다. 각 공지의 evidence에는 그 공지가 나온 전사본 문장을 고치지 말고 그대로 옮긴다. 공지가 없으면 빈 배열로 둔다. 공지를 concepts에 넣지 않는다.
- 한국어로 쓴다."""

SYSTEM_PROMPT = f"""너는 대학생의 복습을 돕는 조교다. 강의 녹음을 음성 인식(STT)한 전사본을 받아, 복습용 요약을 만든다.

{_RULES}"""

CHUNK_SYSTEM_PROMPT = f"""너는 대학생의 복습을 돕는 조교다. 긴 강의 전사본을 여러 구간으로 나눴고, 지금은 그중 한 구간을 받는다.
이 구간에서 다룬 핵심 개념과 공지만 뽑는다. 앞뒤 구간에서 이어지는 설명이 잘려 있을 수 있으니, 이 구간에 실제로 있는 내용만 쓴다.

{_RULES}"""

MERGE_SYSTEM_PROMPT = """너는 대학생의 복습을 돕는 조교다. 한 강의를 구간별로 정리한 개념 목록을 받아, 강의 전체의 최종 복습 요약을 만든다.

규칙:
- 같거나 겹치는 개념은 하나로 합치고, 각 구간의 설명에서 중요한 내용은 빠뜨리지 않는다.
- 강의 진행 순서를 유지한다.
- 입력에 없는 내용을 새로 지어내지 않는다.
- 개념 하나는 복습 카드 한 장 분량(2~4문장)으로 쓴다.
- 한국어로 쓴다."""

_CONCEPTS = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "explanation": {"type": "string"},
        },
        "required": ["name", "explanation"],
        "additionalProperties": False,
    },
}

_ANNOUNCEMENTS = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "text": {"type": "string", "description": "공지 내용"},
            "evidence": {"type": "string", "description": "이 공지가 나온 전사본 문장 (그대로 복사)"},
        },
        "required": ["text", "evidence"],
        "additionalProperties": False,
    },
}

# 한 번에 요약할 때 LLM 출력 스키마
SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "이 강의 회차의 주제"},
        "overview": {"type": "string", "description": "강의 전체 흐름 2~3문장"},
        "concepts": _CONCEPTS,
        "announcements": _ANNOUNCEMENTS,
    },
    "required": ["title", "overview", "concepts", "announcements"],
    "additionalProperties": False,
}

# 구간별 요약 출력 스키마
CHUNK_SCHEMA = {
    "type": "object",
    "properties": {"concepts": _CONCEPTS, "announcements": _ANNOUNCEMENTS},
    "required": ["concepts", "announcements"],
    "additionalProperties": False,
}

# 구간 요약을 합치는 단계 출력 스키마 (공지는 코드에서 합친다)
MERGE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "이 강의 회차의 주제"},
        "overview": {"type": "string", "description": "강의 전체 흐름 2~3문장"},
        "concepts": _CONCEPTS,
    },
    "required": ["title", "overview", "concepts"],
    "additionalProperties": False,
}


def _hint(terms: str | None) -> str:
    # 용어집을 그냥 주면 작은 모델이 강의에서 안 다룬 용어까지 카드로 만든다. 표기 참고용임을 못박는다
    if not terms:
        return ""
    return (
        f"용어 표기 참고: {terms}\n"
        "(이 목록은 STT 오인식을 바로잡을 때 철자를 참고하는 용도다. 목록에 있어도 전사본에서 실제로 설명하지 않은 용어는 개념으로 만들지 않는다.)\n\n"
    )


def build_user_message(transcript: str, terms: str | None = None) -> str:
    return f"{_hint(terms)}<transcript>\n{transcript}\n</transcript>\n\n위 전사본을 규칙에 따라 요약해줘."


def build_chunk_message(chunk: str, index: int, total: int, terms: str | None = None) -> str:
    return (
        f"{_hint(terms)}전체 {total}개 구간 중 {index}번째 구간이다.\n\n"
        f"<transcript>\n{chunk}\n</transcript>\n\n이 구간의 핵심 개념과 공지를 규칙에 따라 정리해줘."
    )


def build_merge_message(chunk_concepts: list[list[dict]], terms: str | None = None) -> str:
    parts = []
    for i, concepts in enumerate(chunk_concepts, 1):
        lines = "\n".join(f"- {c['name']}: {c['explanation']}" for c in concepts)
        parts.append(f"## 구간 {i}\n{lines or '(개념 없음)'}")
    body = "\n\n".join(parts)
    return f"{_hint(terms)}{body}\n\n위 구간별 개념을 합쳐 강의 전체의 최종 요약을 만들어줘."
