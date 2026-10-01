"""STT: faster-whisper (로컬 GPU) + 내장 Silero VAD."""
import gc
import os
import sys
import threading
import wave
from collections.abc import Callable
from pathlib import Path

from app import config


def _add_cuda_dlls() -> None:
    """Windows에서 pip로 설치한 cuBLAS/cuDNN DLL을 ctranslate2가 찾을 수 있게 PATH에 추가."""
    if sys.platform != "win32":
        return
    nvidia_dir = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
    for bin_dir in nvidia_dir.glob("*/bin"):
        os.add_dll_directory(str(bin_dir))
        os.environ["PATH"] = str(bin_dir) + os.pathsep + os.environ["PATH"]


_add_cuda_dlls()

import numpy as np  # noqa: E402
from faster_whisper import WhisperModel  # noqa: E402

_model: WhisperModel | None = None
_model_lock = threading.Lock()


def get_model() -> WhisperModel:
    global _model
    with _model_lock:
        if _model is None:
            _model = WhisperModel(
                config.WHISPER_MODEL,
                device=config.WHISPER_DEVICE,
                compute_type=config.WHISPER_COMPUTE_TYPE,
            )
        return _model


def unload_model() -> None:
    """GPU 메모리를 비운다. 로컬 LLM과 GPU를 나눠 쓸 때 요약 전에 호출한다 (다음 STT 때 다시 로드)."""
    global _model
    with _model_lock:
        _model = None
    gc.collect()


def _load_wav(path: Path) -> np.ndarray:
    """전처리 결과(16kHz 모노 s16le wav)를 float32 배열로 읽는다.

    faster-whisper 내장 디코더(PyAV)는 버전 호환 문제가 잦아서 쓰지 않는다.
    """
    with wave.open(str(path), "rb") as w:
        if w.getframerate() != 16000 or w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError("audio must be preprocessed to 16kHz mono s16le wav")
        pcm = w.readframes(w.getnframes())
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0


def transcribe(
    audio_path: Path,
    terms: str | None = None,
    on_progress: Callable[[float], None] | None = None,
    hint: str = "hotwords",
) -> dict:
    """terms: 전공 용어 (예: "자료구조, 힙, 트리 순회"). 용어 인식률을 높인다.

    hint="hotwords": 30초 구간마다 용어 힌트를 넣는다 (기본).
    hint="initial_prompt": 첫 구간에만 들어간다. condition_on_previous_text=False라 이후 구간엔 힌트가 없다 (비교용).
    """
    segments, info = get_model().transcribe(
        _load_wav(audio_path),
        language=config.WHISPER_LANGUAGE,
        beam_size=5,
        hotwords=(terms or None) if hint == "hotwords" else None,
        initial_prompt=(terms or None) if hint == "initial_prompt" else None,
        # 긴 강의에서 같은 문장 반복(환각 루프)을 줄인다
        condition_on_previous_text=False,
        # 무음 구간을 잘라 환각과 처리 시간을 줄인다
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 500},
    )

    result = []
    for seg in segments:
        result.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": seg.text.strip()})
        if on_progress and info.duration:
            on_progress(min(seg.end / info.duration, 1.0))

    return {
        "language": info.language,
        "duration": round(info.duration, 2),
        "speech_duration": round(info.duration_after_vad, 2),
        "text": " ".join(s["text"] for s in result),
        "segments": result,
    }
