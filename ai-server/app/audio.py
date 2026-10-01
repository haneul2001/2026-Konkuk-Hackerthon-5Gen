"""1단계: 오디오 전처리.

강한 잡음 제거는 STT 인식률을 오히려 떨어뜨릴 수 있어서 기본값(clean)은
저주파 제거 + 음량 정규화만 한다. 무음 구간은 STT 단계의 VAD가 처리한다.
"""
import re
import subprocess
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

_HIGHPASS = "highpass=f=80"  # 에어컨, 책상 진동 같은 웅웅거림 제거
_NORMALIZE = "dynaudnorm=f=500:g=31:p=0.95:m=15"  # 멀리 있는 교수님 목소리를 키움
_DENOISE = "afftdn=nr=12:nf=-40"  # 약한 스펙트럼 잡음 제거 (A/B 비교용)

PRESETS: dict[str, str | None] = {
    "raw": None,  # 포맷 변환만
    "clean": f"{_HIGHPASS},{_NORMALIZE}",
    "clean_denoise": f"{_HIGHPASS},{_DENOISE},{_NORMALIZE}",
}


_DURATION = re.compile(r"Duration: (\d+):(\d+):(\d+(?:\.\d+)?)")


def probe_duration(src: Path) -> float | None:
    """녹음 길이(초). 업로드 직후 화면에 길이를 보여주려고 STT 전에 잰다. 못 읽으면 None."""
    result = subprocess.run(
        [FFMPEG, "-hide_banner", "-i", str(src)], capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    match = _DURATION.search(result.stderr)
    if not match:
        return None
    h, m, s = match.groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


def preprocess(
    src: Path,
    dst: Path,
    preset: str = "clean",
    start: float | None = None,
    duration: float | None = None,
) -> Path:
    """src를 STT 표준 입력(16kHz 모노 PCM wav)으로 변환하면서 preset 필터를 적용한다."""
    if preset not in PRESETS:
        raise ValueError(f"unknown preset: {preset} (choose from {list(PRESETS)})")

    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y"]
    if start is not None:
        cmd += ["-ss", str(start)]
    if duration is not None:
        cmd += ["-t", str(duration)]
    cmd += ["-i", str(src), "-vn", "-ac", "1", "-ar", "16000"]
    if PRESETS[preset]:
        cmd += ["-af", PRESETS[preset]]
    cmd += ["-c:a", "pcm_s16le", str(dst)]

    result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr.strip()}")
    return dst
