# 학습도우미 오디오 백엔드

녹음 업로드 → 전처리(ffmpeg) → STT(faster-whisper, 로컬 GPU + VAD) → LLM 요약 → DB 저장

## 1. 설치 (처음 한 번)

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
cp .env.example .env
```

기본 요약 모델은 로컬 Qwen이다. [Ollama](https://ollama.com/download)를 설치하고 모델을 받는다.

```bash
ollama pull qwen3:8b
```

Claude/Gemini를 쓰려면 `.env`에 API 키를 넣고 `SUMMARY_PROVIDER`를 바꾼다.
로컬 LLM으로 요약할 때는 GPU 메모리를 비우려고 Whisper를 내렸다가 다음 STT 때 다시 올린다.

ffmpeg는 `imageio-ffmpeg`에 포함돼 있고, STT 모델(약 1.6GB)은 처음 실행할 때 자동으로 받는다.

## 2. 서버 실행

```bash
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

브라우저에서 http://localhost:8000/docs 를 열면 API를 직접 눌러보며 테스트할 수 있다.

| 메서드 | 경로 | 설명 |
|---|---|---|
| POST | `/lectures` | multipart: `file`(필수), `title`, `terms`(과목명·용어), `preset`, `provider` → `{id}` |
| GET | `/lectures` | 강의 목록 |
| GET | `/lectures/{id}` | 상태(`queued → preprocessing → transcribing → summarizing → done/failed`), 진행률, 전사본, 요약 |
| POST | `/lectures/{id}/summary?provider=` | 전사본으로 요약만 다시 만들기 (실패 재시도, 다른 LLM 비교) |
| DELETE | `/lectures/{id}` | 삭제 |
| POST | `/courses` | 과목 생성: `name`, `professor`, `terms`(용어집), `corrections`(`{"틀린": "맞는"}`) |
| GET | `/courses`, `/courses/{id}` | 과목 목록·상세 |
| PATCH | `/courses/{id}` | 과목 수정 (보낸 필드만, `terms`·`corrections`는 통째로 교체) |
| POST | `/courses/{id}/corrections` | 교정 하나 추가 `{wrong, right}` → 다음 강의부터 자동 적용 |

강의를 올릴 때 `course_id`를 주면 과목 용어집이 STT `hotwords`(30초 구간마다 적용)와 요약 힌트로 쓰이고, 교정 사전이 STT 결과에 적용된다.
용어집 효과는 `python -m scripts.vocab_test`로 측정할 수 있다.

- 업로드 원본과 전처리 파일은 처리 후 지운다(`KEEP_AUDIO_FILES=1`이면 보관). 전사본과 요약은 DB에 남는다.
- DB는 `data/app.db`(SQLite). 출시 단계에서 `DATABASE_URL`을 PostgreSQL로 바꾸면 된다.

## 3. 요약 LLM 벤치마크

```bash
.venv/Scripts/python -m scripts.bench_summary                     # 키/모델이 준비된 제공자 전부
.venv/Scripts/python -m scripts.bench_summary -p exaone qwen -n 3  # 골라서 3회 반복
.venv/Scripts/python -m scripts.bench_summary --lecture-id <id>    # 실제 업로드한 강의 전사본으로
```

`bench/fixtures/*.json`(잡담·공지·STT 오류가 섞인 전사본)으로 개념 커버리지, 잡담 누출, 공지 추출, 속도, 비용을 채점한다.
결과는 `data/bench/<시각>/report.md`와 제공자별 요약 JSON.

## 4. 전처리 프리셋 비교

```bash
.venv/Scripts/python -m scripts.compare 강의.m4a --start 600 --duration 600 --terms "자료구조, 힙"
```

`data/compare/<파일명>/`에 프리셋(`raw`/`clean`/`clean_denoise`)별 STT 결과와 wav가 저장된다.
