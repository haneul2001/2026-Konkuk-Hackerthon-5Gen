import type { BoardComment, BoardPost, Concept, Lecture } from './types'

// 모두가 함께 보는 상태. 서버 메모리에 있고 AI 서버 DB(app_state)에 저장된다(server/persist.ts).
// 사용자별 상태(내 기록·폴더·태그·복습·참여·차단)는 shared/session.ts 에 있다.
// 강의·개념은 AI 서버가 기준이라 여기 배열은 서버가 꺼졌을 때 화면이 비어 보이도록 두는 자리다.

// 한국 시간 기준 날짜 문자열(YYYY-MM-DD). offset: 오늘에서 며칠 더하거나 뺄지
// 서버(Render)는 세계 표준시(UTC)로 돌아서, 기기 시간대를 쓰면 한국 아침 9시 전엔 하루가 어긋난다.
// 그래서 서버·브라우저 모두 한국 시간으로 '오늘'을 정한다(연속 학습·오늘 푼 문제·기분이 같은 날짜를 본다).
const SEOUL_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function localDate(offset = 0) {
  const [y, m, d] = SEOUL_DATE.format(new Date()).split('-').map(Number)
  const day = new Date(Date.UTC(y, m - 1, d + offset)) // 날짜 계산만 UTC로 (시간대 영향 없음)
  return day.toISOString().slice(0, 10)
}

export const lectures: Lecture[] = []
export const concepts: Concept[] = []

// 게시판
export const posts: BoardPost[] = []
export const comments: BoardComment[] = []
// 스터디 모집 글의 연락처. 조건을 채워 참여한 사람에게만 보여준다.
export const studyContacts: Record<string, string> = {}
