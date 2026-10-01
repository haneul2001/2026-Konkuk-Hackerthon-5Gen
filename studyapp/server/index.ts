import { existsSync } from 'node:fs'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import express from 'express'
import { setStudyRecord } from '../shared/admin'
import {
  addComment,
  blockCommentAuthor,
  blockPostAuthor,
  blockedCount,
  createPost,
  deletePost,
  getPost,
  joinPost,
  listPosts,
  listReports,
  reportComment,
  reportPost,
  toggleCommentLike,
  toggleLike,
  unblockAll,
  updatePost,
} from '../shared/board'
import { updateProfile } from '../shared/profile'
import { flushSave, isLoaded, loadState, scheduleSave } from './persist'
import { createFolder, deleteFolder, swapFolders, updateFolder } from '../shared/folders'
import {
  createRecordingFolder,
  deleteRecordingFolder,
  swapRecordingFolders,
  updateRecordingFolder,
} from '../shared/recordingFolders'
import { addTag, removeTag, setLectureTags, tagState } from '../shared/recordingTags'
import { currentNotices } from '../shared/notices'
import { current, refreshLeague, setLeagueOpponents } from '../shared/session'
import { submitQuiz, type GradedResult } from '../shared/quiz'
import { finishCardSet } from '../shared/cards'
import { DEMO_OPPONENTS, seedDemoPosts } from '../shared/demo'
import { guestAllowed, guestLogin, login, requireAuth, signup } from './auth'

// 백엔드. 강의·개념·문제는 AI 서버(ai-server/, 포트 8000)로 넘기고,
// XP·리그·연속 학습일·오늘 복습·폴더·게시판은 여기서 목 데이터로 처리한다.
// 연결 방식은 ai-server/INTEGRATION.md 참고.
// 실행: npm run server  (포트 3001)

const AI = process.env.AI_SERVER ?? 'http://localhost:8000'

const app = express()
app.use(cors())
app.use(express.json())

// 상태 저장: GET이 아닌 요청이 성공하면 잠깐 뒤 공용 상태와 그 사용자 상태를 저장한다.
// 어떤 요청이 무엇을 바꿨는지 따지지 않아도 되게 단순하게 둔다. 저장은 300ms 모아서 한 번.
app.use((req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      if (res.statusCode < 400) scheduleSave(req.user?.me.id)
    })
  }
  next()
})

// 요청을 AI 서버로 그대로 넘긴다. multipart 업로드와 오디오 스트리밍도 된다.
// body를 주면 그걸 JSON으로 보낸다(폴더·복습 정보를 붙일 때).
// express.json()은 JSON만 파싱하므로 multipart 업로드 본문은 손대지 않고 스트림으로 넘어간다.
async function forward(req: express.Request, res: express.Response, body?: unknown) {
  try {
    const isJson = body !== undefined || !!req.is('application/json')
    const headers: Record<string, string> = isJson
      ? { 'Content-Type': 'application/json' }
      : { 'Content-Type': req.headers['content-type'] ?? '' }
    // 녹음 다시 듣기에서 중간으로 넘길 수 있게 구간 요청을 그대로 넘긴다 (206 Partial Content)
    if (req.headers.range) headers.Range = req.headers.range
    const init: RequestInit & { duplex: 'half' } = {
      method: req.method,
      headers,
      body:
        req.method === 'GET'
          ? undefined
          : isJson
            ? JSON.stringify(body ?? req.body)
            : (Readable.toWeb(req) as ReadableStream),
      duplex: 'half', // Node fetch에서 스트림 본문을 보낼 때 필요
    }
    const r = await fetch(AI + req.originalUrl, init)
    res.status(r.status)
    r.headers.forEach((v, k) => {
      if (k !== 'content-encoding' && k !== 'transfer-encoding') res.setHeader(k, v)
    })
    if (r.body) Readable.fromWeb(r.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res)
    else res.end()
  } catch {
    if (!res.headersSent) res.status(503).json({ error: 'AI 서버에 연결할 수 없어요' })
  }
}

// ---- 상태 확인 (Render 헬스 체크, 로그인 없이) ----
// AI 서버가 꺼져 있어도 Express는 살아 있으니 200. ai 항목으로 AI 서버 연결 여부를 알려준다.
app.get('/api/health', async (_req, res) => {
  let ai = false
  try {
    ai = (await fetch(`${AI}/health`, { signal: AbortSignal.timeout(3000) })).ok
  } catch {
    // AI 서버 꺼짐
  }
  // store: AI 서버 DB에서 상태를 불러왔는지. false면 바뀐 게 저장되지 않는다
  // guest: 로그인 화면에 '둘러보기' 버튼을 보일지 (로컬만)
  res.json({ ok: true, ai, store: isLoaded(), guest: guestAllowed })
})

// ---- 로그인 (로그인 없이) ----
// 사용자는 AI 서버 DB(app_users)에, 토큰은 서명으로 확인한다. 자세한 건 server/auth.ts
app.post('/api/auth/signup', async (req, res) => {
  // body: { login, password, name } → { token, user }
  const r = await signup(req.body ?? {})
  if ('error' in r) return res.status(r.status).json({ error: r.error })
  scheduleSave(r.user.id)
  res.json(r)
})
// 둘러보기: 로컬 개발용 게스트로 들어간다 (AI 서버 없이 됨)
app.post('/api/auth/guest', (_req, res) => {
  const r = guestLogin()
  if ('error' in r) return res.status(r.status).json({ error: r.error })
  res.json(r)
})
app.post('/api/auth/login', async (req, res) => {
  // body: { login, password } → { token, user }
  const r = await login(req.body ?? {})
  if ('error' in r) return res.status(r.status).json({ error: r.error })
  res.json(r)
})

// 여기부터는 전부 로그인 필요. 토큰의 사용자 상태가 이 요청의 current()가 된다.
app.use('/api', requireAuth)

// ---- 홈 ----
app.get('/api/me', (_req, res) => {
  refreshLeague()
  res.json(current().me)
})
// 프로필: 이름·하루 목표 바꾸기, 차단 관리
app.patch('/api/me', (req, res) => {
  // body: { name?, dailyGoal? }
  const r = updateProfile(req.body ?? {})
  if ('error' in r) return res.status(400).json(r)
  res.json(r)
})
app.get('/api/blocks', (_req, res) => res.json(blockedCount()))
app.delete('/api/blocks', (_req, res) => res.json(unblockAll()))
app.get('/api/reviews/today', (_req, res) => res.json(current().todayReviews))
app.get('/api/league', (_req, res) => res.json(refreshLeague()))

// ---- 녹음·요약·개념 (AI 서버) ----
// 업로드(multipart: audio, course, title?, recordedAt?) → 전처리 → STT → 요약 → 개념.
// 2시간 녹음 기준 2~3분. 그동안 GET /api/lectures/:id 의 status·stage·progress로 진행을 본다.
app.post('/api/lectures', (req, res) => forward(req, res))
app.get('/api/lectures', (req, res) => forward(req, res))
app.get('/api/lectures/:id', (req, res) => forward(req, res))
// 제목·과목·녹음한 날 바꾸기 (body: { title?, course?, recordedAt? }). 캘린더에서 날짜 옮기기에 쓴다
app.patch('/api/lectures/:id', (req, res) => forward(req, res))
app.get('/api/lectures/:id/audio-file', (req, res) => forward(req, res))
// 녹음 다시 듣기 자막: [{ start, end, text }] (초 단위)
app.get('/api/lectures/:id/transcript', (req, res) => forward(req, res))
// 플래시카드(큐카드): ?lecture=ID 또는 ?concepts=id1,id2. 알아요/몰라요는 review로 라이트너 상자에 저장된다
app.get('/api/cards', (req, res) => forward(req, res))
app.post('/api/cards/review', (req, res) => forward(req, res))
// 학습 탭의 개념 카드. ?lecture=ID 로 강의별 필터.
app.get('/api/concepts', (req, res) => forward(req, res))


// ---- 학습 탭(폴더) ----
// 개념 폴더: 사용자가 만들고 개념을 담는다. 폴더 단위로 퀴즈가 나온다.
// 녹음 태그: 사용자가 만든 태그를 녹음에 단다. 응답은 항상 { tags, byLecture } 전체
app.get('/api/recording-tags', (_req, res) => res.json(tagState()))
app.post('/api/recording-tags', (req, res) => {
  // body: { name }
  const r = addTag(String(req.body?.name ?? ''))
  if ('error' in r) return res.status(400).json(r)
  res.json(r)
})
app.delete('/api/recording-tags/:name', (req, res) => res.json(removeTag(req.params.name)))
app.put('/api/recording-tags/lectures/:id', (req, res) => {
  // body: { tags: string[] }
  res.json(setLectureTags(req.params.id, Array.isArray(req.body?.tags) ? req.body.tags : []))
})

// 녹음 폴더: 개념 폴더와 같은 방식으로 녹음(강의)을 담는다.
app.get('/api/recording-folders', (_req, res) => res.json(current().recordingFolders))
app.post('/api/recording-folders', (req, res) => {
  // body: { name, lectureIds? }
  res.json(createRecordingFolder(String(req.body?.name ?? ''), req.body?.lectureIds ?? []))
})
app.post('/api/recording-folders/swap', (req, res) => {
  // body: { a, b }
  const list = swapRecordingFolders(String(req.body?.a ?? ''), String(req.body?.b ?? ''))
  if (!list) return res.status(404).json({ error: '폴더를 찾을 수 없어요' })
  res.json(list)
})
app.patch('/api/recording-folders/:id', (req, res) => {
  // body: { name?, lectureIds? }
  const folder = updateRecordingFolder(req.params.id, req.body ?? {})
  if (!folder) return res.status(404).json({ error: '폴더를 찾을 수 없어요' })
  res.json(folder)
})
app.delete('/api/recording-folders/:id', (req, res) => {
  res.json(deleteRecordingFolder(req.params.id))
})
app.get('/api/folders', (_req, res) => res.json(current().folders))
app.post('/api/folders', (req, res) => {
  // body: { name, conceptIds? }
  res.json(createFolder(String(req.body?.name ?? ''), req.body?.conceptIds ?? []))
})
app.post('/api/folders/swap', (req, res) => {
  // body: { a, b }  두 폴더 순서를 맞바꾸고 바뀐 목록을 돌려준다
  const list = swapFolders(String(req.body?.a ?? ''), String(req.body?.b ?? ''))
  if (!list) return res.status(404).json({ error: '폴더를 찾을 수 없어요' })
  res.json(list)
})
app.patch('/api/folders/:id', (req, res) => {
  // body: { name?, conceptIds? }
  const folder = updateFolder(req.params.id, req.body ?? {})
  if (!folder) return res.status(404).json({ error: 'not found' })
  res.json(folder)
})
app.delete('/api/folders/:id', (req, res) => {
  res.json(deleteFolder(req.params.id))
})

// 플래시카드 한 세트를 끝까지 넘기면 카드 수만큼 XP (녹음·개념 폴더·과목 공통)
app.post('/api/card-sets/done', (req, res) => {
  // body: { cardCount }
  res.json(finishCardSet(Number(req.body?.cardCount) || 0))
})

// ---- 퀴즈·복습 ----
// 문제는 AI 서버가 누를 때마다 새로 만든다(15~45초). 폴더는 AI 서버가 모르므로 여기서 풀어서 넘긴다.
app.post('/api/quiz', (req, res) => {
  // body: { source: { kind: 'lecture' | 'folder', id }, type, count }
  const { source } = req.body ?? {}
  if (source?.kind === 'folder') {
    const folder = current().folders.find((f) => f.id === source.id)
    if (!folder) return res.status(404).json({ error: '폴더를 찾을 수 없어요' })
    return forward(req, res, {
      ...req.body,
      source: { ...source, title: folder.name },
      conceptIds: folder.conceptIds,
    })
  }
  forward(req, res)
})
// 오늘 복습 목록은 여기서 관리하고, 문제는 AI 서버에 저장된 것에서 낸다.
app.post('/api/reviews/:id/quiz', (req, res) => {
  const review = current().todayReviews.find((r) => r.id === req.params.id)
  if (!review) return res.json(null)
  forward(req, res, { lectureId: review.lectureId, reason: review.reason, count: review.questionCount })
})
// 채점 결과는 AI 서버에 먼저 넘겨 출제 가중치·개념 숙련도를 갱신하고,
// 응답의 graded(문제 → 강의·개념)로 여기서 XP·오답 복습을 처리한다.
app.post('/api/quiz/:id/submit', async (req, res) => {
  try {
    const r = await fetch(`${AI}/api/quiz/${req.params.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: req.body?.results ?? [] }),
    })
    if (!r.ok) return res.status(r.status).json(await r.json())
    const { graded } = (await r.json()) as { graded: GradedResult[] }
    res.json(submitQuiz({ ...req.body, quizId: req.params.id }, graded, await lectureInfo()))
  } catch {
    res.status(503).json({ error: 'AI 서버에 연결할 수 없어요' })
  }
})

// 오답 복습 항목에 띄울 강의 제목·과목. 강의는 AI 서버에만 있다.
async function lectureInfo() {
  try {
    const r = await fetch(`${AI}/api/lectures`)
    const list = (await r.json()) as { id: string; title: string; course: string }[]
    return new Map(list.map((l) => [l.id, { title: l.title, course: l.course }]))
  } catch {
    return undefined
  }
}

// ---- XP·랭킹 ----
app.post('/api/xp', (_req, res) => {
  // body: { action: 'quiz_correct' | 'cards_done' | 'tts_5min' | 'review_done' }
  res.status(501).json({ error: 'not implemented', todo: 'XP 지급 규칙' })
})

// ---- 알림 ----
// 지금은 앱을 열 때 받아서 배너로만 띄운다. TODO: 푸시 알림(웹 푸시 / 앱 푸시)
app.get('/api/notifications', (_req, res) => res.json(currentNotices()))

// ---- 관리자(개발용) ----
// 학습 기록을 바꿔서 마스코트 기분·알림을 확인한다. TODO: 출시 전 인증 붙이거나 제거
app.get('/api/admin/reports', (_req, res) => res.json(listReports()))
app.patch('/api/admin/study-record', (req, res) => {
  // body: { daysAgo, todaySolved, dailyGoal? }
  res.json(setStudyRecord(req.body ?? { daysAgo: 1, todaySolved: 0 }))
})

// ---- 게시판 ----
// 자유·질문·그룹 스터디 모집. ?board=free|question|study 로 게시판별.
app.get('/api/posts', (req, res) => {
  const board = ['free', 'question', 'study'].includes(String(req.query.board)) ? req.query.board : undefined
  res.json(listPosts(board as 'free' | 'question' | 'study' | undefined, String(req.query.q ?? '')))
})
app.get('/api/posts/:id', (req, res) => {
  const found = getPost(req.params.id)
  if (!found) return res.status(404).json({ error: '글을 찾을 수 없어요' })
  res.json(found)
})
app.post('/api/posts', (req, res) => {
  // body: NewPost { board, title, body, tags, anonymous, study? }
  const post = createPost(req.body ?? {})
  if ('error' in post) return res.status(400).json(post)
  res.json(post)
})
app.post('/api/posts/:id/like', (req, res) => {
  const post = toggleLike(req.params.id)
  if (!post) return res.status(404).json({ error: '글을 찾을 수 없어요' })
  res.json(post)
})
app.post('/api/posts/:id/comments', (req, res) => {
  // body: { body, anonymous, parentId? }  parentId가 있으면 대댓글
  const comment = addComment(
    req.params.id,
    String(req.body?.body ?? ''),
    !!req.body?.anonymous,
    req.body?.parentId ? String(req.body.parentId) : undefined,
  )
  if ('error' in comment) return res.status(400).json(comment)
  res.json(comment)
})
// 댓글 정보창: 공감 · 차단 · 신고
app.post('/api/comments/:id/like', (req, res) => {
  const c = toggleCommentLike(req.params.id)
  if ('error' in c) return res.status(400).json(c)
  res.json(c)
})
app.post('/api/comments/:id/block', (req, res) => {
  // 그 댓글 쓴 사람을 차단: 글은 목록에서 빠지고 댓글은 가려진다. 랭킹은 그대로.
  const r = blockCommentAuthor(req.params.id)
  if ('error' in r) return res.status(400).json(r)
  res.json(r)
})
app.post('/api/comments/:id/report', (req, res) => {
  // body: { reason }  관리자 화면의 신고 내역에 쌓인다
  const r = reportComment(req.params.id, req.body?.reason)
  if ('error' in r) return res.status(400).json(r)
  res.json(r)
})
// 게시글 ⋮ 메뉴: 차단 · 신고
app.post('/api/posts/:id/block', (req, res) => {
  const r = blockPostAuthor(req.params.id)
  if ('error' in r) return res.status(400).json(r)
  res.json(r)
})
app.post('/api/posts/:id/report', (req, res) => {
  // body: { reason }
  const r = reportPost(req.params.id, req.body?.reason)
  if ('error' in r) return res.status(400).json(r)
  res.json(r)
})
app.patch('/api/posts/:id', (req, res) => {
  // body: { title, body, tags, anonymous, study? }  게시판은 못 바꾼다. 내 글만.
  const post = updatePost(req.params.id, req.body ?? {})
  if ('error' in post) return res.status(400).json(post)
  res.json(post)
})
app.delete('/api/posts/:id', (req, res) => {
  const r = deletePost(req.params.id)
  if ('error' in r) return res.status(400).json(r)
  res.json(r)
})
app.post('/api/posts/:id/join', (req, res) => {
  // 누적 XP가 minXp 이상이고 자리가 있으면 참여 → 응답의 study.contact로 연락처 공개
  const post = joinPost(req.params.id)
  if ('error' in post) return res.status(400).json(post)
  res.json(post)
})

// ---- 배포: 빌드된 화면(dist)도 여기서 내보낸다 ----
// Render 한 곳에서 화면과 API를 같은 주소로 띄우기 위해서다. 개발 중엔 dist가 없어도 되고 Vite(5173)를 쓴다.
const DIST = fileURLToPath(new URL('../dist', import.meta.url))
if (existsSync(DIST)) {
  app.use(express.static(DIST))
  // 화면 주소(/library, /board?post=… 등)를 새로고침해도 index.html을 준다
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(`${DIST}/index.html`)
  })
}

const PORT = Number(process.env.PORT) || 3001
app.listen(PORT, () => {
  console.log(`API server on http://localhost:${PORT} (AI 서버: ${AI})`)
  // 사용자·게시판·폴더 등을 AI 서버 DB에서 불러온다. 연결될 때까지 기다린다
  void loadState().then(() => {
    // 시연용 더미(DEMO_SEED=1): 리그 가상 상대 7명 + 글이 하나도 없으면 게시글 5개
    if (process.env.DEMO_SEED === '1') {
      setLeagueOpponents(DEMO_OPPONENTS)
      if (seedDemoPosts()) scheduleSave()
    }
  })
})

// 꺼질 때 모아 둔 변경을 저장하고 끝낸다 (Render 재배포·잠들기는 SIGTERM을 보낸다)
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    flushSave().finally(() => process.exit(0))
  })
}
