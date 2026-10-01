"""요약 LLM 벤치마크: Claude / Gemini / EXAONE(로컬) / Qwen(로컬).

같은 전사본·같은 프롬프트로 각 제공자를 돌리고 자동 채점한다.
  - 개념 커버리지: fixture의 must_include 개념이 요약에 들어갔는지
  - 잡담 누출: must_exclude 단어(잡담·농담)가 요약에 섞였는지
  - 공지 추출: 시험·과제 공지가 announcements에 들어갔는지
  - 속도, 토큰, 비용

    python -m scripts.bench_summary                      # 사용 가능한 제공자 전부
    python -m scripts.bench_summary -p claude qwen -n 3   # 골라서, 3회 반복
    python -m scripts.bench_summary --lecture-id <id>     # DB에 저장된 실제 강의 전사본으로 (채점 없이 결과만)

결과: data/bench/<타임스탬프>/report.md + 제공자별 요약 JSON
"""
import argparse
import json
import os
import statistics
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.summarize import pipeline, providers  # noqa: E402

FIXTURE_DIR = Path(__file__).resolve().parent.parent / "bench" / "fixtures"


def available(provider: str) -> tuple[bool, str]:
    if provider == "claude":
        ok = bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN"))
        return ok, "" if ok else "ANTHROPIC_API_KEY 없음"
    if provider == "gemini":
        ok = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
        return ok, "" if ok else "GEMINI_API_KEY 없음"
    import ollama

    model = providers.EXAONE_MODEL if provider == "exaone" else providers.QWEN_MODEL
    try:
        names = {m.model for m in ollama.Client(host=providers.OLLAMA_HOST).list().models}
    except Exception:
        return False, "Ollama 서버에 연결 안 됨"
    if model not in names:
        return False, f"Ollama에 {model} 없음 (ollama pull {model})"
    return True, ""


def _norm(s: str) -> str:
    return s.lower().replace(" ", "")


def score(summary: dict, fixture: dict) -> dict:
    body = summary.get("overview", "") + " " + " ".join(
        c.get("name", "") + " " + c.get("explanation", "") for c in summary.get("concepts", [])
    )
    # 누출 검사는 띄어쓰기를 살린다 ("미스 시 발생" 이 "시발" 로 잡히는 오탐 방지)
    everything = json.dumps(summary, ensure_ascii=False).lower()
    ann = _norm(" ".join(summary.get("announcements", [])))
    body = _norm(body)

    covered = [g[0] for g in fixture["must_include"] if any(_norm(k) in body for k in g)]
    leaked = [w for w in fixture["must_exclude"] if w.lower() in everything]
    ann_hit = [g[0] for g in fixture["announcements"] if any(_norm(k) in ann for k in g)]
    # 기대 공지가 없는 강의는 공지를 하나도 안 내야 만점
    ann_score = len(ann_hit) / len(fixture["announcements"]) if fixture["announcements"] else float(not summary.get("announcements"))
    return {
        "coverage": len(covered) / len(fixture["must_include"]),
        "missed": [g[0] for g in fixture["must_include"] if g[0] not in covered],
        "leaked": leaked,
        "announcements": ann_score,
        "concept_count": len(summary.get("concepts", [])),
    }


def load_inputs(args) -> list[dict]:
    if args.lecture_id:
        from app.db import Lecture, SessionLocal

        with SessionLocal() as db:
            lec = db.get(Lecture, args.lecture_id)
            if not lec or not lec.transcript_text:
                sys.exit(f"lecture {args.lecture_id} 없음 또는 전사본 없음")
            return [{"name": lec.title, "terms": lec.terms, "transcript": lec.transcript_text}]
    paths = args.fixture or sorted(FIXTURE_DIR.glob("*.json"))
    return [json.loads(p.read_text(encoding="utf-8")) for p in paths]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("-p", "--providers", nargs="+", default=list(providers.PROVIDERS), choices=list(providers.PROVIDERS))
    parser.add_argument("-n", "--runs", type=int, default=1, help="제공자별 반복 횟수 (로컬 모델은 결과가 흔들려서 3 이상 권장)")
    parser.add_argument("--lecture-id", help="DB에 저장된 강의 전사본으로 실행")
    parser.add_argument("--fixture", type=Path, nargs="+", help="채점표 JSON 경로 (기본: bench/fixtures/*.json)")
    parser.add_argument("--modes", nargs="+", default=["auto"], choices=["auto", "single", "chunked"],
                        help="요약 방식. 여러 개 주면 방식끼리 비교 (예: --modes single chunked)")
    args = parser.parse_args()

    inputs = load_inputs(args)
    out_dir = Path("data/bench") / time.strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)

    rows, skipped = [], []
    for provider in args.providers:
        ok, reason = available(provider)
        if not ok:
            skipped.append(f"- **{provider}**: 건너뜀 ({reason})")
            print(f"[{provider}] 건너뜀: {reason}")
            continue
        for item, mode in [(item, mode) for item in inputs for mode in args.modes]:
            runs = []
            for i in range(args.runs):
                print(f"[{provider}/{mode}] {item['name']} #{i + 1} ...", flush=True)
                try:
                    r = pipeline.summarize(item["transcript"], item.get("terms"), provider, mode)
                except Exception as e:
                    traceback.print_exc()
                    runs.append({"error": f"{type(e).__name__}: {e}"})
                    continue
                run = {
                    "model": r.model,
                    "latency": r.latency_sec,
                    "in": r.input_tokens,
                    "out": r.output_tokens,
                    "cost": r.cost_usd,
                    "extra": r.extra,
                }
                if "must_include" in item:
                    run.update(score(r.summary, item))
                runs.append(run)
                (out_dir / f"{provider}_{len(rows)}_{i + 1}.json").write_text(
                    json.dumps({"meta": run, "summary": r.summary}, ensure_ascii=False, indent=2), encoding="utf-8"
                )
            rows.append({"provider": provider, "mode": mode, "input": item["name"], "runs": runs})

    report = render_report(rows, skipped)
    (out_dir / "report.md").write_text(report, encoding="utf-8")
    print("\n" + report)
    print(f"\n결과 폴더: {out_dir.resolve()}")


def _avg(values):
    values = [v for v in values if v is not None]
    return statistics.mean(values) if values else None


def _fmt(v, spec):
    return "-" if v is None else format(v, spec)


def render_report(rows: list[dict], skipped: list[str]) -> str:
    lines = [
        "# 요약 벤치마크 결과",
        "",
        "| 제공자 | 방식 | 모델 | 입력 | 성공 | 개념 커버리지 | 잡담 누출 | 공지 추출 | 개념 수 | 지연(초) | 입력/출력 토큰 | 비용(USD) | 버린 공지 |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    details = []
    for row in rows:
        ok = [r for r in row["runs"] if "error" not in r]
        model = ok[0]["model"] if ok else "-"
        leaks = sorted({w for r in ok for w in r.get("leaked", [])})
        lines.append(
            "| {p} | {mode} | {m} | {i} | {s}/{n} | {cov} | {leak} | {ann} | {cc} | {lat} | {tin}/{tout} | {cost} | {drop} |".format(
                p=row["provider"],
                mode="/".join(sorted({f"{r['extra']['mode']}({r['extra']['chunks']})" for r in ok})) or row["mode"],
                drop=_fmt(_avg([len(r["extra"]["dropped_announcements"]) for r in ok]), ".1f"),
                m=model,
                i=row["input"],
                s=len(ok),
                n=len(row["runs"]),
                cov=_fmt(_avg([r.get("coverage") for r in ok]), ".0%"),
                leak=", ".join(leaks) if leaks else ("없음" if ok and "leaked" in ok[0] else "-"),
                ann=_fmt(_avg([r.get("announcements") for r in ok]), ".0%"),
                cc=_fmt(_avg([r.get("concept_count") for r in ok]), ".1f"),
                lat=_fmt(_avg([r["latency"] for r in ok]), ".1f"),
                tin=_fmt(_avg([r["in"] for r in ok]), ".0f"),
                tout=_fmt(_avg([r["out"] for r in ok]), ".0f"),
                cost=_fmt(_avg([r["cost"] for r in ok]), ".4f"),
            )
        )
        missed = sorted({m for r in ok for m in r.get("missed", [])})
        errors = [r["error"] for r in row["runs"] if "error" in r]
        warnings = sorted({w for r in ok for w in r["extra"]["warnings"]})
        if missed or errors or warnings:
            details.append(f"- **{row['provider']}/{row['mode']}**: " + "; ".join(
                ([f"놓친 개념: {', '.join(missed)}"] if missed else [])
                + [f"오류: {e}" for e in errors]
                + warnings
            ))
    if details:
        lines += ["", "## 세부", *details]
    if skipped:
        lines += ["", "## 건너뛴 제공자", *skipped]
    lines += ["", "자동 채점은 키워드 기반이라 참고용이다. 같은 폴더의 요약 JSON을 직접 읽고 품질을 비교할 것."]
    return "\n".join(lines)


if __name__ == "__main__":
    main()
