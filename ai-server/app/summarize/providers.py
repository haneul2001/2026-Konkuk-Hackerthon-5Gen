"""요약 LLM 제공자: Claude, Gemini, 로컬(Ollama: EXAONE, Qwen).

각 제공자는 (system, user, schema)를 받아 JSON 한 번 생성만 한다.
프롬프트 구성, 구간 나누기, 근거 검증은 app/summarize/pipeline.py 가 맡는다.
"""
import json
import os
import time
from dataclasses import dataclass, field


@dataclass
class LLMResult:
    provider: str
    model: str
    data: dict
    latency_sec: float
    input_tokens: int | None = None
    output_tokens: int | None = None
    cost_usd: float | None = None
    extra: dict = field(default_factory=dict)


class SummaryError(RuntimeError):
    pass


# ---------- Claude ----------

CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-opus-5-5")
CLAUDE_EFFORT = os.getenv("CLAUDE_EFFORT", "medium")
# 달러 / 1M 토큰 (claude-opus-5-5 기준). 모델을 바꾸면 같이 바꾼다
CLAUDE_PRICE = (float(os.getenv("CLAUDE_PRICE_IN", "4")), float(os.getenv("CLAUDE_PRICE_OUT", "20")))


def call_claude(system: str, user: str, schema: dict) -> LLMResult:
    import anthropic

    client = anthropic.Anthropic()
    t0 = time.perf_counter()
    # 긴 강의 입력이라 스트리밍으로 받아 HTTP 타임아웃을 피한다.
    # fallbacks="default": 안전 분류기가 거절하면 서버가 다른 모델로 자동 재시도
    with client.beta.messages.stream(
        model=CLAUDE_MODEL,
        max_tokens=16000,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_config={"effort": CLAUDE_EFFORT, "format": {"type": "json_schema", "schema": schema}},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
    ) as stream:
        message = stream.get_final_message()
    latency = time.perf_counter() - t0

    if message.stop_reason == "refusal":
        raise SummaryError(f"Claude refused: {message.stop_details}")
    if message.stop_reason == "max_tokens":
        raise SummaryError("Claude output truncated (max_tokens)")
    text = next(b.text for b in message.content if b.type == "text")

    usage = message.usage
    return LLMResult(
        provider="claude",
        model=message.model,
        data=json.loads(text),
        latency_sec=latency,
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cost_usd=(usage.input_tokens * CLAUDE_PRICE[0] + usage.output_tokens * CLAUDE_PRICE[1]) / 1e6,
    )


# ---------- Gemini ----------

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
# 달러 / 1M 토큰. 모델 요금표를 확인해서 환경변수로 넣으면 비용이 계산된다
_GEMINI_PRICE_IN = os.getenv("GEMINI_PRICE_IN")
_GEMINI_PRICE_OUT = os.getenv("GEMINI_PRICE_OUT")


def call_gemini(system: str, user: str, schema: dict) -> LLMResult:
    from google import genai
    from google.genai import types

    # GEMINI_API_KEY 환경변수 사용. 과부하(503)·한도(429)는 지수 백오프로 재시도
    client = genai.Client(
        http_options=types.HttpOptions(
            retry_options=types.HttpRetryOptions(
                attempts=3, initial_delay=5.0, max_delay=30.0, http_status_codes=[429, 500, 502, 503, 504]
            )
        )
    )
    t0 = time.perf_counter()
    response = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user,
        config=types.GenerateContentConfig(
            system_instruction=system,
            response_mime_type="application/json",
            response_json_schema=schema,
        ),
    )
    latency = time.perf_counter() - t0
    if not response.text:
        raise SummaryError(f"Gemini returned no text: {response.candidates}")

    meta = response.usage_metadata
    in_tok = meta.prompt_token_count if meta else None
    # thinking 토큰도 출력 요금으로 과금된다
    out_tok = ((meta.candidates_token_count or 0) + (meta.thoughts_token_count or 0)) if meta else None
    cost = None
    if _GEMINI_PRICE_IN and _GEMINI_PRICE_OUT and in_tok is not None:
        cost = (in_tok * float(_GEMINI_PRICE_IN) + out_tok * float(_GEMINI_PRICE_OUT)) / 1e6
    return LLMResult(
        provider="gemini",
        model=GEMINI_MODEL,
        data=json.loads(response.text),
        latency_sec=latency,
        input_tokens=in_tok,
        output_tokens=out_tok,
        cost_usd=cost,
    )


# ---------- 로컬 (Ollama) ----------

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
EXAONE_MODEL = os.getenv("EXAONE_MODEL", "exaone3.5:7.8b")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen3:8b")
# 컨텍스트 상한. 컨텍스트가 클수록 GPU 메모리(KV 캐시)를 많이 잡는다 (qwen3:8b, 32k ≈ 9.8GB)
OLLAMA_NUM_CTX = int(os.getenv("OLLAMA_NUM_CTX", "32768"))
_OUTPUT_RESERVE = 4096  # 요약 출력용 여유


def _num_ctx_for(text: str) -> int:
    """입력 길이에 맞춰 컨텍스트를 잡는다. 한국어는 대략 1글자 ≈ 1토큰으로 넉넉히 잡는다."""
    need = len(text) + _OUTPUT_RESERVE
    ctx = 8192
    while ctx < need and ctx < OLLAMA_NUM_CTX:
        ctx *= 2
    return min(ctx, OLLAMA_NUM_CTX)


def _call_ollama(provider: str, model: str, system: str, user: str, schema: dict) -> LLMResult:
    import ollama

    client = ollama.Client(host=OLLAMA_HOST)
    num_ctx = _num_ctx_for(system + user)
    t0 = time.perf_counter()
    response = client.chat(
        model=model,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        format=schema,
        options={"num_ctx": num_ctx, "temperature": 0.2},
        # Qwen3의 thinking 모드는 끈다 (JSON 출력과 속도 우선). 지원 안 하는 모델엔 보내지 않음
        think=False if provider == "qwen" else None,
    )
    latency = time.perf_counter() - t0

    prompt_tokens = response.prompt_eval_count
    extra = {"num_ctx": num_ctx}
    if prompt_tokens is not None and prompt_tokens + (response.eval_count or 0) >= num_ctx:
        extra["warning"] = f"입력+출력이 num_ctx({num_ctx})에 닿아 잘렸을 수 있음"
    return LLMResult(
        provider=provider,
        model=model,
        data=json.loads(response.message.content),
        latency_sec=latency,
        input_tokens=prompt_tokens,
        output_tokens=response.eval_count,
        cost_usd=0.0,
        extra=extra,
    )


def call_exaone(system: str, user: str, schema: dict) -> LLMResult:
    return _call_ollama("exaone", EXAONE_MODEL, system, user, schema)


def call_qwen(system: str, user: str, schema: dict) -> LLMResult:
    return _call_ollama("qwen", QWEN_MODEL, system, user, schema)


PROVIDERS = {
    "claude": call_claude,
    "gemini": call_gemini,
    "exaone": call_exaone,
    "qwen": call_qwen,
}

# 서버와 같은 GPU를 쓰는 제공자
LOCAL_PROVIDERS = {"exaone", "qwen"}

DEFAULT_PROVIDER = os.getenv("SUMMARY_PROVIDER", "qwen")


def call(provider: str, system: str, user: str, schema: dict) -> LLMResult:
    if provider not in PROVIDERS:
        raise ValueError(f"unknown provider: {provider} (choose from {list(PROVIDERS)})")
    try:
        return PROVIDERS[provider](system, user, schema)
    except json.JSONDecodeError as e:
        raise SummaryError(f"{provider} returned invalid JSON: {e}") from e
