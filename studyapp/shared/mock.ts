import type {
  BoardComment,
  BoardPost,
  Concept,
  Folder,
  LeagueEntry,
  Lecture,
  RecordingFolder,
  ReviewItem,
  UserSummary,
} from './types'

// 서버 메모리에 두는 앱 상태. 처음엔 모두 비어 있다(목업 데이터 없음).
// 강의·개념·문제는 AI 서버(DB)가 기준이고, 아래 lectures·concepts는 서버가 꺼졌을 때 화면이 비어 보이도록 두는 자리다.
// 내 기록·리그·게시판·폴더·태그는 Express가 메모리에 들고 있어서 서버를 다시 켜면 초기화된다. TODO: DB로 옮기기

export const me: UserSummary = {
  name: '하늘',
  xpTotal: 0,
  xpThisWeek: 0,
  streakDays: 0,
  leagueRank: 1,
  leagueSize: 1,
  lastStudyDate: '', // 아직 푼 적 없음
  todaySolved: 0,
  dailyGoal: 10,
}

// 로컬 기준 날짜 문자열. offset: 오늘에서 며칠 더하거나 뺄지
export function localDate(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const lectures: Lecture[] = []
export const concepts: Concept[] = []

// 오늘 복습. 퀴즈에서 틀린 문제가 생기면 채워진다.
export const todayReviews: ReviewItem[] = []

// 주간 리그. 지금은 나 혼자. TODO: 다른 사용자와 리그 묶기
export const league: LeagueEntry[] = [{ rank: 1, name: me.name, xpThisWeek: 0, isMe: true }]

// 게시판
export const ME_ID = 'me'
export const posts: BoardPost[] = []
export const comments: BoardComment[] = []
// 스터디 모집 글의 연락처. 조건을 채워 참여한 사람에게만 보여준다.
export const studyContacts: Record<string, string> = {}

// 사용자가 만든 녹음 폴더와 녹음 태그
export const recordingFolders: RecordingFolder[] = []
export const recordingTagList: string[] = []
export const lectureTags: Record<string, string[]> = {}

// 사용자가 만든 개념 폴더
export const folders: Folder[] = []
