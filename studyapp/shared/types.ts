// 프론트와 서버가 함께 쓰는 타입. 기획서의 데이터 모델을 그대로 옮겼다.

export type Lecture = {
  id: string
  title: string
  course: string
  recordedAt: string // ISO date
  durationMin: number
  status: 'processing' | 'ready'
  cardCount: number
  quizCount: number
}

export type ReviewItem = {
  id: string
  lectureId: string
  lectureTitle: string
  course: string
  reason: 'wrong' | 'interval' // 오답 복습 | 망각곡선 간격 복습
  questionCount: number
}

export type UserSummary = {
  name: string
  xpTotal: number
  xpThisWeek: number
  streakDays: number
  leagueRank: number
  leagueSize: number
  // 마스코트 기분과 알림에 쓰는 학습 기록
  lastStudyDate: string // 마지막으로 문제를 푼 날 (YYYY-MM-DD, 로컬 기준)
  todaySolved: number // lastStudyDate에 푼 문제 수
  dailyGoal: number // 하루 목표 문제 수
}

// 마스코트 기분. 순서대로 헬쑥함(30일+) → 매우매우 기쁨.
export type Mood = 'gaunt' | 'furious' | 'angry' | 'upset' | 'normal' | 'glad' | 'happy' | 'joyful'

// 앱 안 알림(지금은 상단 배너로만 보인다).
export type Notice = {
  id: string
  kind: 'angry' | 'streak' | 'review' | 'goal' | 'summary' | 'study'
  title: string
  body: string
  to?: string // 누르면 이동할 곳
  mood?: Mood // 배너에 띄울 소 표정. 없으면 kind로 정한다.
}

export type LeagueEntry = {
  rank: number
  name: string
  xpThisWeek: number
  isMe?: boolean
}

export type BoardPost = {
  id: string
  title: string
  course: string
  minXp: number
  capacity: number
  joined: number
  createdAt: string
}

// 서재의 개념 카드. 강의 요약에서 핵심 개념 단위로 뽑힌다.
export type Concept = {
  id: string
  term: string
  summary: string
  lectureId: string
  lectureTitle: string
  course: string
  mastery: 'new' | 'learning' | 'mastered' // 새 개념 | 익히는 중 | 외움 (퀴즈 결과로 갱신)
}

export type QuizType = 'multiple' | 'ox' | 'essay'

// 개념 폴더. 사용자가 직접 만들고 개념을 담는다. 한 개념을 여러 폴더에 담을 수 있다(재생목록 방식).
export type Folder = {
  id: string
  name: string
  conceptIds: string[]
  createdAt: string
}

// ---- 퀴즈 ----
// 지금은 shared/quizBank.ts의 목 문제를 쓰고, 나중에 요약 기반 생성기로 바꾼다.

type QuestionBase = {
  id: string
  conceptId: string
  prompt: string
  explanation: string
}

export type MultipleQuestion = QuestionBase & {
  type: 'multiple'
  choices: string[]
  answerIndex: number
}

export type OxQuestion = QuestionBase & {
  type: 'ox'
  answer: boolean
}

export type EssayQuestion = QuestionBase & {
  type: 'essay'
  modelAnswer: string
  // 채점용 핵심어. 묶음 안의 단어 중 하나만 있으면 그 묶음은 포함한 것으로 본다.
  keywords: string[][]
}

export type QuizQuestion = MultipleQuestion | OxQuestion | EssayQuestion

// 문제는 항상 "개념 묶음"에서 나온다. 묶음을 어디서 정했는지가 source.
export type QuizSource =
  | { kind: 'lecture'; id: string } // 강의의 개념 전체
  | { kind: 'folder'; id: string } // 사용자가 만든 폴더의 개념
  | { kind: 'review'; id: string } // 오늘 복습

export type Quiz = {
  id: string
  title: string
  source: QuizSource
  questions: QuizQuestion[]
}

export type QuizSubmission = {
  quizId: string
  source: QuizSource
  // 서술형은 자동 채점하지 않으므로 correct = null
  results: { questionId: string; correct: boolean | null }[]
}

export type QuizSubmitResult = {
  xpGained: number
  xpTotal: number
  leagueRank: number
  notices: Notice[] // 이번 제출로 생긴 알림 (목표 달성 등)
}
