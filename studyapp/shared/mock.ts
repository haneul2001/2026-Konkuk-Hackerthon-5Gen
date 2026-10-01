import type { BoardComment, BoardPost, Concept, Lecture } from './types'

// 모두가 함께 보는 상태. 서버 메모리에 있고 AI 서버 DB(app_state)에 저장된다(server/persist.ts).
// 사용자별 상태(내 기록·폴더·태그·복습·참여·차단)는 shared/session.ts 에 있다.
// 강의·개념은 AI 서버가 기준이라 여기 배열은 서버가 꺼졌을 때 화면이 비어 보이도록 두는 자리다.

// 로컬 기준 날짜 문자열. offset: 오늘에서 며칠 더하거나 뺄지
export function localDate(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const lectures: Lecture[] = []
export const concepts: Concept[] = []

// 게시판
export const posts: BoardPost[] = []
export const comments: BoardComment[] = []
// 스터디 모집 글의 연락처. 조건을 채워 참여한 사람에게만 보여준다.
export const studyContacts: Record<string, string> = {}
