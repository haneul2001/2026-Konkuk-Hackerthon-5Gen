import type {
  BoardPost,
  Concept,
  Folder,
  LeagueEntry,
  Lecture,
  ReviewItem,
  UserSummary,
} from './types'

// 홈 화면을 채우기 위한 목 데이터. 실제 DB가 붙으면 server/ 에서 교체한다.

export const me: UserSummary = {
  name: '하늘',
  xpTotal: 1840,
  xpThisWeek: 260,
  streakDays: 6,
  leagueRank: 4,
  leagueSize: 30,
  // 데모가 언제 열려도 "어제까지 6일 연속, 오늘은 아직"으로 시작하게 어제 날짜로 둔다.
  lastStudyDate: localDate(-1),
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

export const lectures: Lecture[] = [
  {
    id: 'lec_1',
    title: '7주차 — 이진 탐색 트리',
    course: '자료구조',
    recordedAt: '2026-09-30',
    durationMin: 74,
    status: 'ready',
    cardCount: 12,
    quizCount: 10,
  },
  {
    id: 'lec_2',
    title: '6주차 — 프로세스와 스레드',
    course: '운영체제',
    recordedAt: '2026-09-29',
    durationMin: 68,
    status: 'ready',
    cardCount: 9,
    quizCount: 8,
  },
  {
    id: 'lec_3',
    title: '7주차 — 정규화',
    course: '데이터베이스',
    recordedAt: '2026-10-01',
    durationMin: 52,
    status: 'processing',
    cardCount: 0,
    quizCount: 0,
  },
  {
    id: 'lec_0',
    title: '4주차 — 연결 리스트',
    course: '자료구조',
    recordedAt: '2026-09-16',
    durationMin: 71,
    status: 'ready',
    cardCount: 8,
    quizCount: 10,
  },
]

export const concepts: Concept[] = [
  {
    id: 'con_1',
    term: '이진 탐색 트리',
    summary: '왼쪽 서브트리 < 노드 < 오른쪽 서브트리를 항상 지키는 트리. 균형이 맞으면 탐색이 O(log n).',
    lectureId: 'lec_1',
    lectureTitle: '7주차 — 이진 탐색 트리',
    course: '자료구조',
    mastery: 'new',
  },
  {
    id: 'con_2',
    term: '중위 순회',
    summary: '왼쪽 → 노드 → 오른쪽 순서로 방문. BST에서 하면 오름차순으로 나온다.',
    lectureId: 'lec_1',
    lectureTitle: '7주차 — 이진 탐색 트리',
    course: '자료구조',
    mastery: 'learning',
  },
  {
    id: 'con_3',
    term: '노드 삭제와 후계자',
    summary: '자식이 둘인 노드를 지울 땐 오른쪽 서브트리의 최솟값(중위 후계자)으로 바꿔 넣는다.',
    lectureId: 'lec_1',
    lectureTitle: '7주차 — 이진 탐색 트리',
    course: '자료구조',
    mastery: 'new',
  },
  {
    id: 'con_4',
    term: '프로세스와 스레드',
    summary: '프로세스는 독립된 메모리 공간을 갖고, 스레드는 같은 프로세스 안에서 코드·데이터·힙을 공유한다.',
    lectureId: 'lec_2',
    lectureTitle: '6주차 — 프로세스와 스레드',
    course: '운영체제',
    mastery: 'learning',
  },
  {
    id: 'con_5',
    term: '컨텍스트 스위칭',
    summary: 'CPU가 실행 중인 작업을 바꿀 때 레지스터 등 상태를 PCB에 저장하고 다음 작업 상태를 불러오는 과정.',
    lectureId: 'lec_2',
    lectureTitle: '6주차 — 프로세스와 스레드',
    course: '운영체제',
    mastery: 'new',
  },
  {
    id: 'con_6',
    term: '연결 리스트',
    summary: '각 노드가 다음 노드의 주소를 가리키는 구조. 중간 삽입·삭제는 O(1), 임의 접근은 O(n).',
    lectureId: 'lec_0',
    lectureTitle: '4주차 — 연결 리스트',
    course: '자료구조',
    mastery: 'mastered',
  },
]

export const todayReviews: ReviewItem[] = [
  {
    id: 'rev_1',
    lectureId: 'lec_2',
    lectureTitle: '6주차 — 프로세스와 스레드',
    course: '운영체제',
    reason: 'wrong',
    questionCount: 3,
  },
  {
    id: 'rev_2',
    lectureId: 'lec_0',
    lectureTitle: '4주차 — 연결 리스트',
    course: '자료구조',
    reason: 'interval',
    questionCount: 5,
  },
]

export const league: LeagueEntry[] = [
  { rank: 1, name: '민준', xpThisWeek: 410 },
  { rank: 2, name: '서연', xpThisWeek: 380 },
  { rank: 3, name: '지호', xpThisWeek: 295 },
  { rank: 4, name: '하늘', xpThisWeek: 260, isMe: true },
  { rank: 5, name: '유진', xpThisWeek: 240 },
]

export const posts: BoardPost[] = [
  {
    id: 'post_1',
    title: '자료구조 중간고사 대비 스터디',
    course: '자료구조',
    minXp: 1000,
    capacity: 4,
    joined: 2,
    createdAt: '2026-10-01',
  },
  {
    id: 'post_2',
    title: '운영체제 과제 같이 풀어요',
    course: '운영체제',
    minXp: 500,
    capacity: 3,
    joined: 3,
    createdAt: '2026-09-30',
  },
  {
    id: 'post_3',
    title: '데이터베이스 기말 벼락치기 방',
    course: '데이터베이스',
    minXp: 2000,
    capacity: 5,
    joined: 1,
    createdAt: '2026-09-29',
  },
]

// 사용자가 만든 개념 폴더(목). 새로 녹음해서 생긴 개념은 어느 폴더에도 안 들어간 상태로 시작한다.
export const folders: Folder[] = [
  {
    id: 'fld_1',
    name: '중간고사 범위',
    conceptIds: ['con_1', 'con_2', 'con_3', 'con_4', 'con_5'],
    createdAt: '2026-09-28',
  },
  {
    id: 'fld_2',
    name: '자주 틀리는 것',
    conceptIds: ['con_4', 'con_2'],
    createdAt: '2026-09-30',
  },
]
