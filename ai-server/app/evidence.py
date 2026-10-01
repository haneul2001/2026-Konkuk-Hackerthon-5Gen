"""개념의 근거 자막 찾기 ("근거 듣기").

요약이 끝난 뒤 전사본 자막에서 개념 이름이 나온 곳을 찾아 개념마다 붙인다.
학생은 그 시간을 눌러 녹음의 그 부분을 직접 들어볼 수 있고, 근거를 못 찾은 개념은
"강의에서 근거를 찾지 못했어요"로 표시돼 AI가 덧붙인 내용일 수 있음을 알 수 있다.
LLM을 쓰지 않고 글자로만 찾는다 (근거가 없는 걸 근거가 있다고 지어내지 않게).
"""
import re

MAX_EVIDENCE = 3
_MIN_GAP_SEC = 20  # 근거끼리 너무 붙어 있으면 같은 설명으로 본다


def _norm(text: str) -> str:
    return re.sub(r"[\s.,?!·'\"()\-]", "", text).lower()


_PARTICLE = re.compile(r"(의|과|와|및|을|를|은|는|이|가|에서|으로|로)$")


def _tokens(term: str) -> list[str]:
    """개념 이름의 단어들 (괄호 속 영어 표기도 따로). 조사를 떼고, 두 글자 미만은 뺀다"""
    words = []
    for w in re.split(r"[\s()/,·\-]+", term):
        w = _norm(w)
        if len(w) > 2:
            w = _PARTICLE.sub("", w)
        if len(w) >= 2 and w not in {"vs"}:
            words.append(w)
    return list(dict.fromkeys(words))


def find_evidence(term: str, segments: list[dict], limit: int = MAX_EVIDENCE) -> list[dict]:
    """개념 이름의 단어가 나온 자막을 골라 시간순으로. [{start, end, text}]

    - 그 강의에서 가장 드물게 나오는 단어(가장 개념을 가려 주는 단어)가 들어간 자막만 근거로 본다.
      그 단어가 강의에 한 번도 없으면 근거 없음 ("세그먼트 매핑 캐시"가 "매핑"·"캐시"만 나온 곳에 붙지 않게)
    - 단어가 여러 개면 두 단어 이상 맞아야 한다
    """
    tokens = _tokens(term)
    if not tokens or not segments:
        return []
    texts = [_norm(seg.get("text", "")) for seg in segments]
    freq = {t: sum(1 for text in texts if t in text) for t in tokens}
    rarest = min(tokens, key=lambda t: freq[t])
    if freq[rarest] == 0:
        return []
    need = 2 if len(tokens) >= 2 else 1
    whole = _norm(term)
    scored = []
    for seg, text in zip(segments, texts):
        if rarest not in text:
            continue
        hits = sum(1 for t in tokens if t in text)
        if whole and whole in text:
            hits += len(tokens)  # 이름이 통째로 나오면 가장 강한 근거
        if hits >= need:
            scored.append((hits, seg))
    scored.sort(key=lambda x: (-x[0], x[1]["start"]))

    picked: list[dict] = []
    for _, seg in scored:
        if all(abs(seg["start"] - p["start"]) >= _MIN_GAP_SEC for p in picked):
            picked.append({"start": seg["start"], "end": seg["end"], "text": seg["text"]})
        if len(picked) >= limit:
            break
    return sorted(picked, key=lambda p: p["start"])
