import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))

# faster-whisper 설정. GPU가 없으면 WHISPER_DEVICE=cpu, WHISPER_COMPUTE_TYPE=int8 로 실행
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "large-v3-turbo")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cuda")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
WHISPER_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "ko")

# 업로드 원본과 전처리 파일은 STT가 끝나면 지운다 (녹음은 개인용, 서버에 남기지 않음)
KEEP_AUDIO_FILES = os.getenv("KEEP_AUDIO_FILES", "0") == "1"

DEFAULT_PRESET = os.getenv("AUDIO_PRESET", "clean")
