# studyapp ↔ AI 서버 연결

녹음 업로드부터 퀴즈 생성까지는 `ai-server/`(Python, 포트 8000)가 맡는다.
화면은 지금처럼 Express(3001)만 부르고, Express가 아래 요청을 AI 서버로 넘긴다.

```
화면(5173) ─/api→ Express(3001) ─→ AI 서버(8000): STT · 요약 · 개념 · 퀴즈 생성
                       └ XP · 리그 · 연속 학습일 · 오늘 복습 · 폴더 · 게시판은 Express 그대로
```

강의 · 개념 · 문제 데이터는 AI 서버(SQLite)가 기준이다. 경로와 응답 모양은 `shared/types.ts`를 그대로 따른다.

## 넘길 요청

| Express 경로 | AI 서버 | 넘기는 방법 |
| --- | --- | --- |
| `POST /api/lectures` | 같은 경로 | multipart 본문 그대로 (`audio`, `course`, `title?`, `recordedAt?`) |
| `GET /api/lectures`, `GET /api/lectures/:id` | 같은 경로 | 그대로 |
| `GET /api/lectures/:id/audio-file` | 같은 경로 | 그대로 (스트리밍) |
| `GET /api/concepts?lecture=` | 같은 경로 | 그대로 |
| `GET /api/lectures/:id/cards` | 같은 경로 | 그대로 (LecturePage의 카드 자리) |
| `POST /api/lectures/:id/card-sessions` | 같은 경로 | 그대로. 큐카드 한 세트 |
| `POST /api/card-sessions/:id/submit` | 같은 경로 | **AI 서버에 먼저 넘기고**, `finished: true`면 "한 세트 끝까지" XP를 준다 |
| `POST /api/quiz` | 같은 경로 | 강의면 그대로. **폴더면 Express가 폴더를 풀어서** `conceptIds`, `source.title`을 붙인다 |
| `POST /api/reviews/:id/quiz` | 같은 경로 | Express의 오늘 복습 항목에서 `{ lectureId, reason, count }`를 붙인다 |
| `POST /api/quiz/:id/submit` | 같은 경로 | **AI 서버에 먼저 넘기고**, 응답의 `graded`로 XP·오답 복습을 처리한다 |

## 응답에서 달라지는 점

**Lecture**: `shared/types.ts`의 필드에 아래가 더 붙는다. 기존 화면은 그대로 동작한다.

| 필드 | 설명 |
| --- | --- |
| `status` | `processing` · `ready` 에 더해 **`failed`** 가 올 수 있다. 타입에 추가 필요 |
| `error` | 실패 이유 (status가 failed일 때) |
| `stage`, `progress` | 처리 단계(`queued` → `preprocessing` → `transcribing` → `summarizing` → `done`)와 STT 진행률 0~1 |
| `overview`, `announcements` | 강의 개요 2~3문장, 시험·과제 공지 (전사본에 근거가 있는 것만) |

- 처리 시간: 2시간 녹음 기준 약 2~3분. `title`을 안 주면 `N주차`로 시작해서 요약이 끝나면 `N주차 — 주제`가 된다.
- `quizCount`는 지금까지 만든 문제 수다. 문제는 퀴즈를 누를 때 생기므로 처음에는 0이다.
- `cardCount`는 큐카드 수다 (개념 수가 아니다).

**Concept**: `resources`(공부 자료 링크 `[{kind, source, title, url, snippet}]`)가 더 붙는다.

**큐카드**: `{ id, lectureId, conceptId, icon, front, answer, explanation, example, box, dueAt }`.
`example`은 AI가 덧붙인 비유·예시라 강의 내용과 구분해서("AI 예시") 보여준다. `box`는 라이트너 상자 1~5 (아직 안 본 카드는 null).
세트는 다시 볼 때가 된 카드와 몰라요 카드가 앞에 온다. 제출 응답 `{ finished, cardCount, known, unknown }`.

**Quiz**: 모양은 같고 `meta`(재출제·생성 통계)가 더 붙는다. 문제 id는 `q_…`, 퀴즈 id는 `quiz_…`.
문제마다 `retry`(전에 틀려서 다시 낸 문제)와 `resources`(그 개념의 공부 자료 링크)가 붙는다. **틀렸을 때 `resources`를 "이 개념 다시 공부하기"로 보여준다.**

## 퀴즈 생성 방식

- `POST /api/quiz` 할 때마다 LLM이 새 문제를 만든다. **15~45초** 걸리니 로딩 화면이 필요하다.
- 전에 틀린 문제는 연속으로 틀린 횟수만큼 가중치를 높여 다시 낸다 (문제 수의 최대 절반). 새 문제도 많이 틀린 개념, 아직 못 익힌 개념에서 더 나온다.
- 문제마다 근거가 된 전사본 문장을 확인하고, 근거가 없거나 전에 낸 문제와 겹치면 버린 뒤 모자란 만큼 한 번 더 만든다. 그래도 모자라면 있는 만큼만 준다.
- 낼 문제가 없으면 (`개념이 없는 강의 등`) `null`.

## Express 쪽 수정 (server/index.ts)

```ts
import { Readable } from 'node:stream'

const AI = process.env.AI_SERVER ?? 'http://localhost:8000'

// 요청을 AI 서버로 그대로 넘긴다. multipart 업로드와 오디오 스트리밍도 된다.
async function forward(req: express.Request, res: express.Response, body?: unknown) {
  try {
    const isJson = body !== undefined || req.is('application/json')
    const r = await fetch(AI + req.originalUrl, {
      method: req.method,
      headers: isJson ? { 'Content-Type': 'application/json' } : { 'Content-Type': req.headers['content-type'] ?? '' },
      body: req.method === 'GET' ? undefined : isJson ? JSON.stringify(body ?? req.body) : (req as any),
      // @ts-expect-error Node fetch에서 스트림 본문을 보낼 때 필요
      duplex: 'half',
    })
    res.status(r.status)
    r.headers.forEach((v, k) => k !== 'content-encoding' && k !== 'transfer-encoding' && res.setHeader(k, v))
    if (r.body) Readable.fromWeb(r.body as any).pipe(res)
    else res.end()
  } catch {
    res.status(503).json({ error: 'AI 서버에 연결할 수 없어요' })
  }
}

app.post('/api/lectures', (req, res) => forward(req, res))
app.get('/api/lectures', (req, res) => forward(req, res))
app.get('/api/lectures/:id', (req, res) => forward(req, res))
app.get('/api/lectures/:id/audio-file', (req, res) => forward(req, res))
app.get('/api/concepts', (req, res) => forward(req, res))
app.get('/api/lectures/:id/cards', (req, res) => forward(req, res))
app.post('/api/lectures/:id/card-sessions', (req, res) => forward(req, res))
// 큐카드 제출: AI 서버 응답의 finished가 true면 cards_done XP를 준다
app.post('/api/card-sessions/:id/submit', async (req, res) => {
  const r = await fetch(`${AI}${req.originalUrl}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.body),
  })
  const result = await r.json()
  if (r.ok && result.finished) {
    // TODO(하늘): XP 지급 규칙 (POST /api/xp 의 cards_done)
  }
  res.status(r.status).json(result)
})

app.post('/api/quiz', (req, res) => {
  const { source } = req.body ?? {}
  if (source?.kind === 'folder') {
    const folder = folders.find((f) => f.id === source.id)
    if (!folder) return res.status(404).json({ error: 'not found' })
    return forward(req, res, { ...req.body, source: { ...source, title: folder.name }, conceptIds: folder.conceptIds })
  }
  forward(req, res)
})

app.post('/api/reviews/:id/quiz', (req, res) => {
  const review = todayReviews.find((r) => r.id === req.params.id)
  if (!review) return res.json(null)
  forward(req, res, { lectureId: review.lectureId, reason: review.reason, count: review.questionCount })
})
```

`express.json()`은 JSON만 파싱하므로 multipart 업로드 본문은 손대지 않고 그대로 넘어간다.

### 제출: shared/quiz.ts

지금 `submitQuiz`는 `quizBank`에 있는 문제만 채점에 넣는다(`lectureOf.has(questionId)`). 생성된 문제는 여기 없으니 XP가 0이 된다.
AI 서버 응답의 `graded`(문제 → 강의·개념)를 넘겨받아 쓰도록 바꾼다.

```ts
// server/index.ts
app.post('/api/quiz/:id/submit', async (req, res) => {
  const r = await fetch(`${AI}/api/quiz/${req.params.id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results: req.body.results }),
  })
  if (!r.ok) return res.status(r.status).json(await r.json())
  const { graded } = await r.json() // [{ questionId, lectureId, conceptId, correct }]
  res.json(submitQuiz({ ...req.body, quizId: req.params.id }, graded))
})

// shared/quiz.ts — submitQuiz(sub, graded?) 에서
//   lectureOf.get(r.questionId)  →  graded에서 찾은 lectureId
//   개념 숙련도(mastery) 갱신    →  AI 서버가 하므로 생략 (GET /api/concepts 에 반영됨)
```

## 화면 쪽 수정 (src/)

- **QuizPage**: `availableCount`가 `quizBank` 기준이라 생성된 강의에서는 0이 되어 유형 선택이 막힌다. 개념이 하나라도 있으면 모든 유형을 열고, 문제 수는 5·10·15·20 중에서 고르게 한다.
- **로딩**: 퀴즈 생성 15~45초 동안 "문제를 만드는 중이에요"를 보여준다.
- **api/client.ts**: 업로드는 JSON이 아니라 `FormData`로 보내는 함수가 따로 필요하다. 그리고 실패하면 목 데이터로 대체하는 동작 때문에 AI 서버 오류가 조용히 묻힌다. 업로드·퀴즈 생성은 대체하지 말고 `{ error }`를 그대로 보여준다.
- **Lecture 상태**: `failed`일 때 `error`를 보여주고 다시 올리게 한다.

## 실행

AI 서버는 NVIDIA GPU, [Ollama](https://ollama.com/download) + `qwen3:8b`가 있는 PC에서 돈다 (해커톤 데모는 JongGeol PC).
설치와 실행은 [README.md](README.md) 참고.

```
ai-server  : .venv\Scripts\python -m uvicorn app.main:app --port 8000
studyapp   : npm run server   (3001)
             npm run dev      (5173)
```

## 추가된 것 (feature/listen-tts)

이 브랜치에서 화면(studyapp)까지 같이 연결해 두었다.

| 기능 | API | 화면 |
| --- | --- | --- |
| 요약 듣기(TTS) | 없음 (브라우저 Web Speech API) | 강의 › 듣기 › 요약 듣기 |
| 녹음 다시 듣기 | `GET /api/lectures/:id/audio-file` (Range 지원), `GET /api/lectures/:id/transcript` | 강의 › 듣기 › 녹음 다시 듣기 |
| 근거 듣기 | `Concept.evidence` `[{start, end, text}]` | 강의 › 전체 요약의 개념 아래 시간 버튼 → 녹음 그 위치 |
| 다음 시간 예고 | `Lecture.preview` | 강의 › 전체 요약 |
| 플래시카드 = 큐카드 | `GET /api/cards?concepts=id1,id2`, `POST /api/cards/review` | 플래시카드 화면 (질문 → 정답·설명·AI 예시). 큐카드가 없으면 개념 카드로 대신 |
| 심화 문제 | `QuizQuestion.level` (`basic`·`advanced`), `aspect` | 퀴즈에 '심화' 태그 |
| 문제 수 부족 안내 | `Quiz.notice` | 퀴즈 첫 문제 위 |

- 큐카드 결과는 라이트너 상자(다시 볼 간격 0·1·3·7·14일)로 저장되고, 다음에 몰라요 카드가 먼저 나온다.
- TODO(하늘): 요약 듣기 5분마다 XP, 플래시카드 한 바퀴 XP(`cards_done`), 오답에 `resources` 링크 표시, 목 데이터 복습 항목 정리.
