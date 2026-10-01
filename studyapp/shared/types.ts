// 프론트와 서버가 함께 쓰는 타입. 기획서의 데이터 모델을 그대로 옮겼다.

export type Lecture = {
  id: string
  title: string
  course: string
  recordedAt: string // ISO date
  durationMin: number
  status: 'processing' | 'ready' | 'failed'
  cardCount: number
  quizCount: number // 지금까지 만든 문제 수. 문제는 퀴즈를 누를 때 생기므로 처음엔 0
  // 아래는 AI 서버가 붙여 준다 (ai-server/INTEGRATION.md). 목 데이터에는 없다.
  stage?: 'queued' | 'preprocessing' | 'transcribing' | 'summarizing' | 'done' | 'failed'
  progress?: number | null // STT 진행률 0~1
  error?: string | null // status가 failed일 때 이유
  overview?: string | null // 강의 개요 2~3문장
  announcements?: string[] // 시험·과제 공지 (전사본에 근거가 있는 것만)
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

// ---- 게시판 ----
// 에브리타임처럼 게시판 여러 개 + 익명 선택. 스터디 모집 글만 참여 조건(XP)이 붙는다.

export type BoardKind = 'free' | 'question' | 'study' // 자유 | 질문 | 그룹 스터디 모집

export type StudyRecruit = {
  course: string
  minXp: number // 참여에 필요한 누적 XP
  capacity: number
  joined: number // 글쓴이 포함
  joinedByMe?: boolean
  contact?: string // 글쓴이이거나 참여한 사람에게만 온다
}

export type BoardPost = {
  id: string
  board: BoardKind
  title: string
  body: string
  tags: string[] // '#' 없이 저장
  anonymous: boolean
  author: string // 화면에 띄울 이름. 익명이면 '익명'
  authorId: string // 내 글인지, 댓글 '글쓴이' 표시에 쓴다
  likes: number
  liked: boolean // 내가 공감했는지
  commentCount: number
  createdAt: string // ISO 시각
  editedAt?: string
  mine?: boolean // 내가 쓴 글(수정·삭제 가능)
  blocked?: boolean // 내가 차단한 사람의 글. 주소로 바로 들어왔을 때만 오고, 제목·본문은 비어 있다
  study?: StudyRecruit // board가 study일 때만
}

export type BoardComment = {
  id: string
  postId: string
  body: string
  author: string // 익명이면 '익명1', '익명2'… 글쓴이면 '익명(글쓴이)'
  authorId: string
  isWriter: boolean
  createdAt: string
  parentId?: string // 대댓글이면 원댓글 id. 에타처럼 한 단계만 들어간다
  likes?: number // 공감 수 (없으면 0)
  liked?: boolean // 내가 공감했는지
  mine?: boolean // 내가 쓴 댓글 (차단·신고 메뉴를 안 보인다)
  blocked?: boolean // 내가 차단한 사람의 댓글. 이때 body는 비어서 온다
}

export const REPORT_REASONS = [
  '욕설·비하',
  '음란물·불건전한 만남',
  '상업적 광고·판매',
  '정당·정치인 비하 및 선거운동',
  '게시판 성격에 부적절함',
  '낚시·놀람·도배',
  '사칭·사기',
] as const

export type ReportReason = (typeof REPORT_REASONS)[number]

// 게시글·댓글 신고. 관리자 화면에서 본다.
export type Report = {
  id: string
  kind: 'post' | 'comment'
  targetId: string // 신고한 글 또는 댓글 id
  postId: string // 글이면 자기 자신, 댓글이면 달린 글
  postTitle: string
  author: string // 신고 당시 보이던 이름(익명1 등)
  body: string // 신고 당시 내용
  reason: ReportReason
  createdAt: string
}

export type NewPost = {
  board: BoardKind
  title: string
  body: string
  tags: string[]
  anonymous: boolean
  study?: { course: string; minXp: number; capacity: number; contact: string }
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
  // 근거 자막 (AI 서버). 눌러서 녹음의 그 부분을 듣는다. 빈 배열이면 녹음에서 같은 표현을 못 찾음
  evidence?: TranscriptSegment[]
}

// 녹음 다시 듣기 자막 한 줄. start·end는 녹음 시작부터의 초
export type TranscriptSegment = {
  start: number
  end: number
  text: string
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
// 문제는 AI 서버가 강의 전사본으로 만든다. 서버가 꺼져 있으면 shared/quizBank.ts의 목 문제를 쓴다.

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
  notice?: string | null // 요청보다 적게 냈을 때 이유 (개념이 적어서 등). 첫 문제 위에 띄운다
  meta?: Record<string, unknown> // AI 서버의 재출제·생성 통계
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
