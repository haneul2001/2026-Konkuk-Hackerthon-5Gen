# 학습도우미 AI 서버

녹음 업로드 → 전처리(ffmpeg) → STT(faster-whisper, 로컬 GPU + VAD) → 요약·개념 추출(LLM) → 퀴즈 생성(LLM)

studyapp(Express)이 `/api/lectures`, `/api/concepts`, `/api/quiz` 요청을 이 서버로 넘긴다. 연결 방법은 [INTEGRATION.md](INTEGRATION.md).

## 1. 설치 (처음 한 번)

필요한 것: Python 3.11+, NVIDIA GPU(CUDA 12), [Ollama](https://ollama.com/download)

```bash
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
ollama pull qwen3:8b
```

ffmpeg는 `imageio-ffmpeg`에 들어 있고, STT 모델(약 1.6GB)은 처음 실행할 때 자동으로 받는다.
GPU가 없으면 `.env`에 `WHISPER_DEVICE=cpu`, `WHISPER_COMPUTE_TYPE=int8` (느림).

## 2. 실행

```bash
.venv\Scripts\python -m uvicorn app.main:app --reload --port 8000
```

http://localhost:8000/docs 에서 API를 직접 눌러볼 수 있다.

## 3. API

응답 모양은 `studyapp/shared/types.ts`를 따르고, 실패하면 `{ "error": "이유" }`.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/api/lectures` | multipart: `audio`(필수), `course`(과목 이름, 필수), `title`, `recordedAt`(YYYY-MM-DD) → 202 `Lecture` (status: processing) |
| GET | `/api/lectures`, `/api/lectures/{id}` | `Lecture` + `stage`, `progress`, `error`, `overview`, `announcements` |
| GET | `/api/lectures/{id}/audio-file` | 녹음 원본 (다시 듣기) |
| GET | `/api/lectures/{id}/transcript` | 전사본과 시간 정보 |
| POST | `/api/lectures/{id}/summary?provider=` | 요약만 다시 (개념·문제도 새로 만든다) |
| DELETE | `/api/lectures/{id}` | 강의와 원본·개념·문제 삭제 |
| GET | `/api/concepts?lecture=` | `Concept[]` (서재 개념 카드) |
| POST | `/api/quiz` | `{ source: {kind, id, title?}, type, count, conceptIds? }` → `Quiz`. 누를 때마다 새로 생성, 틀린 문제는 가중치를 높여 다시 낸다 |
| POST | `/api/reviews/{id}/quiz` | `{ lectureId, reason: wrong \| interval, count }` → 저장된 문제로 복습 퀴즈 |
| POST | `/api/quiz/{id}/submit` | `{ results: [{questionId, correct}] }` → 출제 가중치·개념 숙련도 갱신, `graded` 반환 |
| GET/POST/PATCH | `/api/courses…` | 과목 용어집·교정 사전 |

- 처리 상태: `queued → preprocessing → transcribing → summarizing → done / failed`. 2시간 녹음 기준 약 2~3분.
- 퀴즈 생성은 15~45초 걸린다 (Qwen 로컬 기준).
- 녹음 원본은 `data/audio/`, DB는 `data/app.db`(SQLite). 출시 때 `DATABASE_URL`만 PostgreSQL로 바꾸면 된다.

## 4. 과목 용어집

`courses/<과목명>.txt` 에 한 줄에 하나씩 용어를, `틀린 표현 -> 맞는 표현` 으로 교정을 적는다.
업로드할 때 `course`가 같은 이름이면 STT 힌트(30초 구간마다 적용)와 오인식 교정에 쓰인다. 저장하면 다음 강의부터 반영된다.

## 5. 측정 스크립트

```bash
.venv\Scripts\python -m scripts.bench_summary -p qwen gemini --modes single chunked -n 3   # 요약 LLM 비교
.venv\Scripts\python -m scripts.compare 강의.m4a --duration 600 --terms "과목 용어"         # 전처리 프리셋 비교
.venv\Scripts\python -m scripts.vocab_test 강의.aac --clips 1410-1590 --terms "..." --check SRAM DRAM  # 용어집 효과
```

요약 LLM은 `.env`의 `SUMMARY_PROVIDER`로 바꾼다 (`qwen` 기본, `claude`, `gemini`, `exaone`). 퀴즈 생성도 같은 LLM을 쓴다.
