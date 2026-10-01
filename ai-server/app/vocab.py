"""과목 용어집과 오인식 교정 사전.

- 용어집: STT의 hotwords(30초 구간마다 적용되는 힌트)와 요약 힌트로 쓴다.
- 교정 사전: STT 결과에서 자주 틀리는 표현을 바꾼다. 사용자가 고친 내용을 쌓아서 키워간다.

courses/<과목명>.txt 파일이 있으면 DB 대신 그 파일을 쓴다 (직접 편집하기 편하게).
파일 형식: 한 줄에 하나. "틀린 -> 맞는" 은 교정, 나머지는 용어. "#" 으로 시작하는 줄은 주석.
강의를 처리할 때마다 새로 읽으므로 서버를 켜둔 채로 고쳐도 다음 강의부터 반영된다.
"""
import re

from app.config import BASE_DIR

COURSES_DIR = BASE_DIR / "courses"
_ARROW = "->"


def course_file(name: str):
    return COURSES_DIR / f"{name}.txt"


def load_course_file(name: str) -> tuple[list[str], dict[str, str]] | None:
    """(용어 목록, 교정 사전). 파일이 없으면 None."""
    path = course_file(name)
    if not path.exists():
        return None
    terms, corrections = [], {}
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if _ARROW in line:
            wrong, right = (s.strip() for s in line.split(_ARROW, 1))
            if wrong:
                corrections[wrong] = right
        else:
            terms.append(line)
    return parse_terms(terms), corrections


def write_course_file(name: str, terms: list[str], corrections: dict[str, str]) -> None:
    COURSES_DIR.mkdir(exist_ok=True)
    lines = [
        f"# {name} 용어집",
        "# 한 줄에 용어 하나. 위쪽 용어일수록 STT 힌트에서 우선한다 (힌트 길이 한도가 있어 너무 길면 뒤쪽은 잘림).",
        '# 교정은 "틀린 표현 -> 맞는 표현" 형식. STT 결과에서 자동으로 바꾼다.',
        "# '#' 으로 시작하는 줄은 무시. 저장하면 다음 강의부터 반영된다.",
        "",
        "# ===== 용어 =====",
        *terms,
        "",
        "# ===== 교정 =====",
        *(f"{wrong} {_ARROW} {right}" for wrong, right in corrections.items()),
        "",
    ]
    course_file(name).write_text("\n".join(lines), encoding="utf-8")


def append_correction(name: str, wrong: str, right: str) -> None:
    with course_file(name).open("a", encoding="utf-8") as f:
        f.write(f"{wrong} {_ARROW} {right}\n")


def parse_terms(raw: str | list[str] | None) -> list[str]:
    """쉼표·줄바꿈으로 구분된 문자열이나 목록을 중복 없는 용어 목록으로."""
    if not raw:
        return []
    items = raw if isinstance(raw, list) else re.split(r"[,\n]", raw)
    seen, terms = set(), []
    for item in items:
        term = item.strip()
        if term and term not in seen:
            seen.add(term)
            terms.append(term)
    return terms


def merge_terms(*groups: list[str]) -> list[str]:
    return parse_terms([t for group in groups for t in group])


def hotwords(terms: list[str]) -> str | None:
    """Whisper hotwords 문자열. 너무 길면 Whisper가 앞부분만 쓰므로 앞쪽 용어가 우선이다."""
    return ", ".join(terms) if terms else None


def apply_corrections(text: str, corrections: dict[str, str]) -> tuple[str, int]:
    """긴 표현부터 바꾼다 ("S램이" 보다 "SSM이" 같은 긴 오인식이 먼저). (바뀐 텍스트, 바꾼 횟수)"""
    count = 0
    for wrong in sorted(corrections, key=len, reverse=True):
        if wrong and wrong in text:
            count += text.count(wrong)
            text = text.replace(wrong, corrections[wrong])
    return text, count


def correct_segments(segments: list[dict], corrections: dict[str, str]) -> tuple[list[dict], int]:
    total = 0
    fixed = []
    for seg in segments:
        new_text, n = apply_corrections(seg["text"], corrections)
        total += n
        fixed.append({**seg, "text": new_text})
    return fixed, total
