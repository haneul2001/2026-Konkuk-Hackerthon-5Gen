import { concepts, lectures, localDate } from './mock'
import { current, refreshLeague } from './session'
import { daysSinceStudy, solvedToday } from './mood'
import { noticesAfterSubmit } from './notices'
import { quizBank } from './quizBank'
import type {
  EssayQuestion,
  Quiz,
  QuizQuestion,
  QuizSource,
  QuizSubmission,
  QuizSubmitResult,
  QuizType,
} from './types'

// 퀴즈 만들기·채점·결과 반영. 서버와 (서버가 꺼져 있을 때) 프론트가 같은 코드를 쓴다.
// 출제 기준은 "개념 묶음": 강의의 개념 전체, 또는 사용자가 만든 폴더의 개념.
// 내 기록·오답·복습은 로그인한 사용자의 상태(current())를 고친다. 서버가 AI 서버 DB에 저장한다.

export const XP_PER_CORRECT = 10
export const XP_PER_CARD = 1 // 플래시카드 한 세트를 끝까지 넘기면 카드 수만큼

export function cardSetXp(cardCount: number) {
  return Math.max(0, Math.min(100, Math.floor(cardCount))) * XP_PER_CARD
}

// XP를 더하고 리그 순위를 다시 매긴다.
export function addXp(xp: number) {
  const { me } = current()
  me.xpTotal += xp
  me.xpThisWeek += xp
  refreshLeague()
}

// 문제 은행을 평평하게 펴고, 문제 → 강의 연결을 기억해 둔다(오답·복습은 강의 단위라서).
const allQuestions: QuizQuestion[] = Object.values(quizBank).flat()
const lectureOf = new Map<string, string>(
  Object.entries(quizBank).flatMap(([lectureId, qs]) => qs.map((q) => [q.id, lectureId] as const)),
)

// 오답 기록(사용자별): 강의 id → 틀린 문제 id. 홈의 "오늘 복습(틀린 문제)"이 여기서 나온다.
const wrongByLecture = () => current().wrongAnswers

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 객관식 보기 순서도 섞는다. 정답 위치를 외우지 못하게.
function shuffleChoices(q: QuizQuestion): QuizQuestion {
  if (q.type !== 'multiple') return q
  const order = shuffle(q.choices.map((_, i) => i))
  return {
    ...q,
    choices: order.map((i) => q.choices[i]),
    answerIndex: order.indexOf(q.answerIndex),
  }
}

function newQuizId() {
  return `quiz_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// 출제 범위(개념 id 목록)와 화면에 띄울 제목
export function scopeOf(source: QuizSource): { title: string; conceptIds: string[] } | null {
  if (source.kind === 'lecture') {
    const lecture = lectures.find((l) => l.id === source.id)
    if (!lecture) return null
    return {
      title: lecture.title,
      conceptIds: concepts.filter((c) => c.lectureId === source.id).map((c) => c.id),
    }
  }
  if (source.kind === 'folder') {
    const folder = current().folders.find((f) => f.id === source.id)
    if (!folder) return null
    return { title: folder.name, conceptIds: folder.conceptIds }
  }
  return null
}

export function questionsFor(conceptIds: string[], type?: QuizType) {
  const ids = new Set(conceptIds)
  return allQuestions.filter((q) => ids.has(q.conceptId) && (!type || q.type === type))
}

export function availableCount(conceptIds: string[], type: QuizType) {
  return questionsFor(conceptIds, type).length
}

export function buildQuiz(
  source: Exclude<QuizSource, { kind: 'review' }>,
  type: QuizType,
  count: number,
): Quiz | null {
  const scope = scopeOf(source)
  if (!scope) return null
  const pool = questionsFor(scope.conceptIds, type)
  if (pool.length === 0) return null
  return {
    id: newQuizId(),
    title: scope.title,
    source,
    questions: shuffle(pool).slice(0, count).map(shuffleChoices),
  }
}

// 복습 퀴즈: 틀린 문제 복습이면 오답 기록에서, 간격 복습이면 자동 채점되는 문제 중에서 고른다.
export function buildReviewQuiz(reviewId: string): Quiz | null {
  const review = current().todayReviews.find((r) => r.id === reviewId)
  if (!review) return null
  const bank = quizBank[review.lectureId] ?? []
  let questions: QuizQuestion[]
  if (review.reason === 'wrong') {
    const wrong = wrongByLecture().get(review.lectureId) ?? new Set()
    questions = bank.filter((q) => wrong.has(q.id))
  } else {
    questions = shuffle(bank.filter((q) => q.type !== 'essay')).slice(0, review.questionCount)
  }
  if (questions.length === 0) return null
  return {
    id: newQuizId(),
    title: review.lectureTitle,
    source: { kind: 'review', id: reviewId },
    questions: shuffle(questions).map(shuffleChoices),
  }
}

// 서술형 임시 채점: 핵심어 묶음 포함 여부만 본다. AI 피드백이 붙으면 대체.
export function gradeEssay(q: EssayQuestion, text: string) {
  const normalized = text.replace(/\s+/g, '').toLowerCase()
  const hit = (group: string[]) =>
    group.some((w) => normalized.includes(w.replace(/\s+/g, '').toLowerCase()))
  return {
    matched: q.keywords.filter(hit).map((g) => g[0]),
    missing: q.keywords.filter((g) => !hit(g)).map((g) => g[0]),
  }
}

// AI 서버가 채점 결과에 붙여 주는 문제 → 강의·개념 연결
export type GradedResult = {
  questionId: string
  lectureId: string
  conceptId: string
  correct: boolean | null
}

type LectureInfo = Map<string, { title: string; course: string }>

// fromAi가 있으면 AI 서버가 만든 문제다: 강의는 거기서 찾고, 개념 숙련도는 AI 서버가 이미 갱신했다.
// 없으면 목 문제 은행(quizBank)의 문제로 보고 여기서 다 처리한다.
export function submitQuiz(
  sub: QuizSubmission,
  fromAi?: GradedResult[],
  lectureInfo?: LectureInfo,
): QuizSubmitResult {
  const { me } = current()
  const lectureOfQuestion = fromAi
    ? new Map(fromAi.map((g) => [g.questionId, g.lectureId] as const))
    : lectureOf
  const graded = sub.results.filter(
    (r) => r.correct !== null && lectureOfQuestion.has(r.questionId),
  )
  const correctCount = graded.filter((r) => r.correct).length
  const xpGained = correctCount * XP_PER_CORRECT
  const today = localDate()
  const before = { solved: solvedToday(me, today), xpTotal: me.xpTotal }

  // 학습 기록: 오늘 처음 푸는 거면 연속 기록을 잇거나(어제 했음) 새로 시작한다.
  if (sub.results.length > 0) {
    if (me.lastStudyDate !== today) {
      me.streakDays = daysSinceStudy(me, today) === 1 ? me.streakDays + 1 : 1
      me.todaySolved = 0
      me.lastStudyDate = today
    }
    me.todaySolved += sub.results.length
  }

  addXp(xpGained)

  // 끝낸 간격 복습은 목록에서 뺀다.
  if (sub.source.kind === 'review') {
    const i = current().todayReviews.findIndex((r) => r.id === sub.source.id && r.reason === 'interval')
    if (i >= 0) current().todayReviews.splice(i, 1)
  }

  // 오답 기록은 강의 단위. 폴더 퀴즈는 여러 강의에 걸칠 수 있어서 문제마다 강의를 찾아 나눈다.
  const touched = new Set<string>()
  for (const r of graded) {
    const lectureId = lectureOfQuestion.get(r.questionId)!
    const wrong = wrongByLecture().get(lectureId) ?? new Set<string>()
    if (r.correct) wrong.delete(r.questionId)
    else wrong.add(r.questionId)
    wrongByLecture().set(lectureId, wrong)
    touched.add(lectureId)
  }
  for (const lectureId of touched) syncWrongReview(lectureId, lectureInfo?.get(lectureId))

  // 개념 숙련도: 이번에 하나라도 틀리면 익히는 중, 다 맞으면 한 단계 올린다. (AI 서버 문제는 서버가 갱신)
  const byConcept = new Map<string, boolean>()
  for (const r of fromAi ? [] : graded) {
    const q = allQuestions.find((x) => x.id === r.questionId)
    if (!q) continue
    byConcept.set(q.conceptId, (byConcept.get(q.conceptId) ?? true) && !!r.correct)
  }
  for (const [conceptId, allRight] of byConcept) {
    const c = concepts.find((x) => x.id === conceptId)
    if (!c) continue
    if (!allRight) c.mastery = 'learning'
    else c.mastery = c.mastery === 'new' ? 'learning' : 'mastered'
  }

  return {
    xpGained,
    xpTotal: me.xpTotal,
    leagueRank: me.leagueRank,
    notices: noticesAfterSubmit(before),
  }
}

// "틀린 문제 다시 풀기" 복습 항목을 남은 오답 수에 맞춘다.
function syncWrongReview(lectureId: string, info?: { title: string; course: string }) {
  const wrong = wrongByLecture().get(lectureId) ?? new Set()
  const i = current().todayReviews.findIndex((r) => r.lectureId === lectureId && r.reason === 'wrong')
  if (wrong.size === 0) {
    if (i >= 0) current().todayReviews.splice(i, 1)
    return
  }
  if (i >= 0) {
    current().todayReviews[i].questionCount = wrong.size
    return
  }
  const lecture = info ?? lectures.find((l) => l.id === lectureId)
  current().todayReviews.unshift({
    id: `rev_wrong_${lectureId}`,
    lectureId,
    lectureTitle: lecture?.title ?? '',
    course: lecture?.course ?? '',
    reason: 'wrong',
    questionCount: wrong.size,
  })
}
