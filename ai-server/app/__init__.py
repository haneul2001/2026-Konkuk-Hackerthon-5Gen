from pathlib import Path

from dotenv import load_dotenv

# API 키 등은 프로젝트 루트의 .env 에서 읽는다 (.env.example 참고)
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
