"""전처리 프리셋 A/B 비교.

같은 녹음 구간을 raw / clean / clean_denoise 로 각각 STT 해서 결과를 나란히 저장한다.
실제 강의 녹음 10분 정도로 돌려보고, 용어·문장이 더 정확한 프리셋을 기본값으로 정하면 된다.

    python -m scripts.compare 강의.m4a --start 600 --duration 600 --terms "자료구조, 힙"
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app import stt  # noqa: E402
from app.audio import PRESETS, preprocess  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--start", type=float, help="시작 위치(초)")
    parser.add_argument("--duration", type=float, default=600, help="비교할 길이(초), 기본 10분")
    parser.add_argument("--terms", help="과목명·전공 용어")
    parser.add_argument("--presets", nargs="+", default=list(PRESETS), choices=list(PRESETS))
    parser.add_argument("--out", type=Path, default=Path("data/compare"))
    args = parser.parse_args()

    out_dir = args.out / args.audio.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    print("모델 로딩 중... (처음 실행 시 다운로드)")
    stt.get_model()

    summary = []
    for preset in args.presets:
        wav = out_dir / f"{preset}.wav"
        t0 = time.perf_counter()
        preprocess(args.audio, wav, preset, args.start, args.duration)
        t1 = time.perf_counter()
        result = stt.transcribe(wav, args.terms)
        t2 = time.perf_counter()

        lines = [f"[{s['start']:7.1f} - {s['end']:7.1f}] {s['text']}" for s in result["segments"]]
        (out_dir / f"{preset}.txt").write_text("\n".join(lines), encoding="utf-8")
        summary.append(
            f"{preset:14} 전처리 {t1 - t0:5.1f}s | STT {t2 - t1:6.1f}s | "
            f"음성 {result['speech_duration']:6.1f}s / 전체 {result['duration']:6.1f}s | "
            f"세그먼트 {len(result['segments']):4} | 글자 {len(result['text']):6}"
        )
        print(summary[-1])

    (out_dir / "summary.txt").write_text("\n".join(summary), encoding="utf-8")
    print(f"\n결과: {out_dir.resolve()}  (wav도 같이 저장되니 직접 들어보며 비교)")


if __name__ == "__main__":
    main()
