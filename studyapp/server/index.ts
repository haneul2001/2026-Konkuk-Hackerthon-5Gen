import cors from 'cors'
import express from 'express'
import { setStudyRecord } from '../shared/admin'
import { createFolder, deleteFolder, updateFolder } from '../shared/folders'
import { currentNotices } from '../shared/notices'
import { concepts, folders, league, lectures, me, posts, todayReviews } from '../shared/mock'
import { buildQuiz, buildReviewQuiz, submitQuiz } from '../shared/quiz'

// 백엔드 스텁. 지금은 목 데이터를 돌려주고, 기능이 완성되면 라우트별로 구현을 채운다.
// 실행: npm run server  (포트 3001)

const app = express()
app.use(cors())
app.use(express.json())

// ---- 홈 ----
app.get('/api/me', (_req, res) => res.json(me))
app.get('/api/reviews/today', (_req, res) => res.json(todayReviews))
app.get('/api/lectures', (_req, res) => res.json(lectures))
app.get('/api/league', (_req, res) => res.json(league))
app.get('/api/posts', (_req, res) => res.json(posts))

// ---- 녹음·요약 (팀원 담당) ----
// 오디오 업로드 → STT → 요약 → 큐카드 생성. 인터페이스만 정의.
app.post('/api/lectures', (_req, res) => {
  res.status(501).json({ error: 'not implemented', todo: '녹음 업로드 및 요약 파이프라인' })
})
app.get('/api/lectures/:id', (req, res) => {
  const lecture = lectures.find((l) => l.id === req.params.id)
  if (!lecture) return res.status(404).json({ error: 'not found' })
  res.json(lecture)
})

// ---- 서재 ----
// 녹음 원본은 /api/lectures, 개념 카드는 여기. ?lecture=ID 로 강의별 필터.
app.get('/api/concepts', (req, res) => {
  const { lecture } = req.query
  res.json(lecture ? concepts.filter((c) => c.lectureId === lecture) : concepts)
})
// 개념 폴더: 사용자가 만들고 개념을 담는다. 폴더 단위로 퀴즈가 나온다.
app.get('/api/folders', (_req, res) => res.json(folders))
app.post('/api/folders', (req, res) => {
  // body: { name, conceptIds? }
  res.json(createFolder(String(req.body?.name ?? ''), req.body?.conceptIds ?? []))
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
app.get('/api/lectures/:id/audio-file', (_req, res) => {
  res.status(501).json({ error: 'not implemented', todo: '녹음 원본 파일 저장소(스토리지) 연결' })
})

// ---- 퀴즈·복습 ----
// 지금은 shared/quizBank.ts의 목 문제에서 뽑는다. TODO: 요약 기반 문제 생성으로 교체
app.post('/api/quiz', (req, res) => {
  // body: { source: { kind: 'lecture' | 'folder', id }, type, count }
  // 그 강의·폴더에 담긴 개념의 문제만 나온다.
  const { source, type, count } = req.body ?? {}
  if (!['lecture', 'folder'].includes(source?.kind)) return res.status(400).json({ error: 'source' })
  if (!['multiple', 'ox', 'essay'].includes(type)) return res.status(400).json({ error: 'type' })
  res.json(buildQuiz(source, type, Math.max(1, Math.min(20, Number(count) || 10))))
})
app.post('/api/reviews/:id/quiz', (req, res) => {
  res.json(buildReviewQuiz(req.params.id))
})
app.post('/api/quiz/:id/submit', (req, res) => {
  // body: QuizSubmission → XP 지급, 오답 기록, 오늘 복습·개념 숙련도 갱신
  res.json(submitQuiz({ ...req.body, quizId: req.params.id }))
})

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
app.patch('/api/admin/study-record', (req, res) => {
  // body: { daysAgo, todaySolved, dailyGoal? }
  res.json(setStudyRecord(req.body ?? { daysAgo: 1, todaySolved: 0 }))
})

// ---- 게시판 ----
app.post('/api/posts', (_req, res) => {
  // body: { title, course, minXp, capacity, contact }
  res.status(501).json({ error: 'not implemented', todo: '모집글 작성' })
})
app.post('/api/posts/:id/join', (_req, res) => {
  // 누적 XP가 minXp 이상인지 확인 후 연락처 공개
  res.status(501).json({ error: 'not implemented', todo: 'XP 조건 확인 후 참여' })
})

const PORT = 3001
app.listen(PORT, () => {
  console.log(`API server on http://localhost:${PORT}`)
})
