"""퀴즈 생성 프롬프트와 유형별 출력 스키마. 출력은 studyapp/shared/types.ts 의 QuizQuestion 모양을 따른다."""

SYSTEM_PROMPT = """너는 대학 강의 복습 퀴즈 출제자다. 강의에서 뽑은 개념과 그 개념을 설명한 강의 전사본 발췌를 받아 문제를 낸다.

규칙:
- 주어진 개념 설명과 전사본 발췌에 있는 내용으로만 출제한다. 강의에 나오지 않은 수치, 사례, 용어로 문제를 만들지 않는다.
- 각 문제의 evidence에는 그 문제의 근거가 된 전사본 문장을 고치지 말고 그대로 복사한다.
- conceptId에는 문제가 다루는 개념의 id를 주어진 목록에서 그대로 쓴다.
- 단순 용어 맞히기보다 원리, 차이, 이유, 계산 과정을 이해했는지 묻는다. 교수가 든 예시나 계산이 있으면 활용한다.
- "이미 낸 문제"와 같거나 거의 같은 문제는 내지 않는다.
- 개념마다 괄호 안에 적힌 측면(정의, 원리·이유 …)을 하나씩 맡아서, 같은 개념의 문제라도 서로 다른 측면을 묻는다. aspect에는 그 문제가 묻는 측면을 그대로 쓴다.
- 교수가 말하다가 정정한 내용("사실은 이거 계산 잘못한 거고…")은 정정한 쪽을 정답으로 한다. 정정 전 내용은 오답 보기로만 쓸 수 있다.
- 전사본은 음성 인식 결과라 오타가 있다. 문제와 보기에는 올바른 용어로 고쳐 쓴다.
- explanation은 왜 그게 정답인지 1~2문장으로, "~해요" 체로 쓴다.
- 한국어로 쓴다."""

# 같은 개념에서 서로 다른 측면을 묻게 해, 개념이 적은 강의에서도 문제가 겹치지 않게 한다
ASPECTS = ["정의", "원리·이유", "비교·차이", "계산·예시", "장단점·한계", "적용 상황"]

TYPE_RULES = {
    "multiple": """문제 유형: 객관식
- choices는 정확히 4개. 정답은 하나뿐이어야 한다. answerIndex는 정답 보기의 위치(0~3).
- 오답 보기는 그럴듯하지만 강의 내용에 비추어 분명히 틀려야 한다. "모두 정답", "정답 없음" 같은 보기는 쓰지 않는다.
- 보기 4개는 서로 다른 내용이어야 한다. 표현만 바꾼 같은 뜻의 보기를 두 개 넣지 않는다. 오답마다 다른 오해(정의 혼동, 원인 혼동, 반대 개념 등)를 담는다.""",
    "ox": """문제 유형: O/X
- prompt는 참 또는 거짓으로 판단할 수 있는 한 문장이다. answer가 true면 O, false면 X.
- 전체 문제의 절반 정도는 거짓(X)이 되게 한다. 거짓 문장은 강의 내용을 한 군데만 틀리게 바꿔서 만든다.""",
    "essay": """문제 유형: 서술형
- modelAnswer는 2~3문장의 모범 답안이다.
- keywords는 채점용 핵심어 묶음 2~4개다. 묶음 하나는 같은 뜻의 표현 1~3개로 이루어진다 (예: [["지역성", "locality"], ["블록", "블락"]]).""",
}

_COMMON = {
    "conceptId": {"type": "string"},
    "aspect": {"type": "string", "description": "이 문제가 묻는 측면 (괄호 안 목록에서)"},
    "prompt": {"type": "string"},
    "explanation": {"type": "string"},
    "evidence": {"type": "string", "description": "근거가 된 전사본 문장 (그대로 복사)"},
}

_TYPE_FIELDS = {
    "multiple": {
        "choices": {"type": "array", "items": {"type": "string"}},
        "answerIndex": {"type": "integer"},
    },
    "ox": {"answer": {"type": "boolean"}},
    "essay": {
        "modelAnswer": {"type": "string"},
        "keywords": {"type": "array", "items": {"type": "array", "items": {"type": "string"}}},
    },
}


def schema_for(qtype: str) -> dict:
    fields = {**_COMMON, **_TYPE_FIELDS[qtype]}
    return {
        "type": "object",
        "properties": {
            "questions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": fields,
                    "required": list(fields),
                    "additionalProperties": False,
                },
            }
        },
        "required": ["questions"],
        "additionalProperties": False,
    }


def build_user_message(qtype: str, plan: list[dict], avoid: list[str]) -> str:
    """plan: [{id, term, summary, excerpt, count, aspects}]"""
    blocks = []
    for c in plan:
        excerpt = c["excerpt"] or "(발췌 없음. 개념 설명만 근거로 쓴다. 이 경우 evidence에는 개념 설명 문장을 그대로 쓴다)"
        blocks.append(
            f"### 개념 id: {c['id']} — {c['term']} ({c['count']}문제: {', '.join(c['aspects'])})\n"
            f"개념 설명: {c['summary']}\n"
            f"<transcript>\n{excerpt}\n</transcript>"
        )
    total = sum(c["count"] for c in plan)
    avoid_text = "\n".join(f"- {p}" for p in avoid) if avoid else "(없음)"
    return (
        f"{TYPE_RULES[qtype]}\n\n"
        f"아래 개념마다 괄호 안의 개수만큼, 모두 {total}문제를 만들어줘.\n\n"
        + "\n\n".join(blocks)
        + f"\n\n## 이미 낸 문제 (겹치지 않게)\n{avoid_text}"
    )


# ---------- 객관식 보기 검수 ----------
# 글자가 비슷한 보기는 대개 좋은 오답("빠르다"/"느리다")이라 글자 비교로는 못 거른다. 뜻을 LLM이 본다

REVIEW_SYSTEM = """너는 객관식 문제 검수자다. 각 문제에서 두 가지를 확인한다.
- same_meaning: 표현만 다르고 뜻이 같은 보기 쌍이 있으면 true. (예: "교체 알고리즘의 문제다"와 "교체 알고리즘의 한계 때문이다")
  한 단어만 바꿔 뜻이 반대가 된 보기(예: "빠르다"와 "느리다", "아래층"과 "위층")는 뜻이 다르므로 false.
- multiple_answers: 표시된 정답 말고도 맞는 보기가 있거나, 표시된 정답이 틀렸으면 true."""

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "index": {"type": "integer"},
                    "same_meaning": {"type": "boolean"},
                    "multiple_answers": {"type": "boolean"},
                },
                "required": ["index", "same_meaning", "multiple_answers"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


def build_review_message(items: list[dict]) -> str:
    """items: [{prompt, choices, answerIndex}]"""
    blocks = []
    for i, item in enumerate(items):
        choices = "\n".join(
            f"  {n + 1}. {c}{'  ← 정답' if n == item['answerIndex'] else ''}" for n, c in enumerate(item["choices"])
        )
        blocks.append(f"### 문제 {i}\n{item['prompt']}\n{choices}")
    return "\n\n".join(blocks) + "\n\n문제마다 index(문제 번호)와 검수 결과를 써줘."
