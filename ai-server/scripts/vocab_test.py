"""과목 용어집 효과 측정.

같은 녹음 구간을 용어 힌트 없이 / initial_prompt(첫 30초만) / hotwords(구간마다) 로 STT 해서
용어가 몇 번 정확히 인식됐는지 센다. 교정 사전을 주면 교정 후 결과도 센다.

    python -m scripts.vocab_test 강의.aac --clips 1410-1590 2550-2670 3090-3620 \
        --terms "캐시, SRAM, DRAM, 다이렉트 매핑 캐시" --check SRAM DRAM 다이렉트 --corrections 교정.json
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import stt, vocab  # noqa: E402
from app.audio import preprocess  # noqa: E402

MODES = ["none", "initial_prompt", "hotwords"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--clips", nargs="+", required=True, help="시작-끝(초) 구간들, 예: 1410-1590")
    parser.add_argument("--terms", required=True, help="과목 용어집 (쉼표 구분)")
    parser.add_argument("--check", nargs="+", required=True, help="정확히 인식됐는지 셀 표현들")
    parser.add_argument("--corrections", type=Path, help='교정 사전 JSON {"틀린": "맞는"}')
    parser.add_argument("--out", type=Path, default=Path("data/vocab_test"))
    args = parser.parse_args()

    terms = vocab.hotwords(vocab.parse_terms(args.terms))
    corrections = json.loads(args.corrections.read_text(encoding="utf-8")) if args.corrections else {}
    args.out.mkdir(parents=True, exist_ok=True)

    wavs = []
    for clip in args.clips:
        start, end = (float(x) for x in clip.split("-"))
        wav = args.out / f"clip_{int(start)}_{int(end)}.wav"
        preprocess(args.audio, wav, "clean", start, end - start)
        wavs.append(wav)

    stt.get_model()
    texts = {}
    for mode in MODES:
        t0 = time.perf_counter()
        parts = [
            stt.transcribe(w, None if mode == "none" else terms, hint="hotwords" if mode == "none" else mode)["text"]
            for w in wavs
        ]
        texts[mode] = "\n".join(parts)
        print(f"{mode:15} STT {time.perf_counter() - t0:5.1f}s")
    if corrections:
        texts["hotwords+교정"], _ = vocab.apply_corrections(texts["hotwords"], corrections)

    for name, text in texts.items():
        (args.out / f"{name}.txt").write_text(text, encoding="utf-8")

    header = f"| 표현 | " + " | ".join(texts) + " |"
    print("\n" + header + "\n|" + "---|" * (len(texts) + 1))
    totals = dict.fromkeys(texts, 0)
    for word in args.check:
        counts = {name: text.count(word) for name, text in texts.items()}
        for name in texts:
            totals[name] += counts[name]
        print(f"| {word} | " + " | ".join(str(counts[n]) for n in texts) + " |")
    print("| **합계** | " + " | ".join(f"**{totals[n]}**" for n in texts) + " |")
    print(f"\n전사본: {args.out.resolve()}")


if __name__ == "__main__":
    main()
