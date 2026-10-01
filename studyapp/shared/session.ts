import { avatarFor, isAvatar } from './avatars'
import type { Folder, LeagueEntry, RecordingFolder, ReviewItem, UserSummary } from './types'

// 사용자별 상태. 로그인한 사람마다 하나씩 있고, shared/*.ts 로직은 전역 변수 대신 current()를 본다.
//  - 서버: 요청마다 토큰의 사용자 상태를 current()로 잡아 준다 (server/auth.ts, AsyncLocalStorage)
//  - 브라우저(서버가 꺼졌을 때 대체 동작): 게스트 상태 하나를 쓴다
// 글·댓글·신고처럼 모두가 함께 보는 것은 여기 없고 mock.ts(posts, comments …)에 있다.

export type UserState = {
  me: UserSummary
  folders: Folder[] // 개념 폴더
  recordingFolders: RecordingFolder[]
  recordingTagList: string[] // 내가 만든 녹음 태그
  lectureTags: Record<string, string[]> // 녹음 id → 달린 태그
  todayReviews: ReviewItem[]
  wrongAnswers: Map<string, Set<string>> // 강의 id → 틀린 문제 id
  joinedByMe: Set<string> // 참여한 스터디 글 id
  blockedUsers: Set<string> // 차단한 사람(authorId)
  boardKeywords: string[] | null // 게시판 키워드 줄. null이면 아직 안 고침(많이 쓰인 태그를 보여 준다)
}

export function newUserState(id: string, login: string, name: string): UserState {
  return {
    me: {
      id,
      login,
      name,
      xpTotal: 0,
      xpThisWeek: 0,
      streakDays: 0,
      leagueRank: 1,
      leagueSize: 1,
      lastStudyDate: '',
      todaySolved: 0,
      dailyGoal: 10,
    },
    folders: [],
    recordingFolders: [],
    recordingTagList: [],
    lectureTags: {},
    todayReviews: [],
    wrongAnswers: new Map(),
    joinedByMe: new Set(),
    blockedUsers: new Set(),
    boardKeywords: null,
  }
}

// ---- 현재 사용자 ----

const guest = newUserState('guest', 'guest', '게스트')
let provider: () => UserState = () => guest

export function current(): UserState {
  return provider()
}

// 서버가 요청마다 사용자 상태를 돌려주는 함수를 꽂는다. 브라우저는 기본(게스트) 그대로.
export function setCurrentProvider(fn: () => UserState) {
  provider = fn
}

// ---- 모든 사용자 (서버) ----
// 리그 순위를 매기려면 전체가 필요해서 서버는 켜질 때 전부 불러온다.

export const users = new Map<string, UserState>()

// 리그에만 나오는 가상 상대 (시연용 더미). 로그인은 못 한다.
let opponents: { name: string; xpThisWeek: number }[] = []

// 사용자의 프로필 사진. 고른 게 없거나 계정을 못 찾으면 아이디로 정한다.
export function avatarOf(userId: string): string {
  const me = users.get(userId)?.me ?? (current().me.id === userId ? current().me : undefined)
  return me?.avatar && isAvatar(me.avatar) ? me.avatar : avatarFor(userId)
}
export function setLeagueOpponents(list: { name: string; xpThisWeek: number }[]) {
  opponents = list
}

// 주간 리그: 모든 사용자 + 가상 상대를 이번 주 XP 순으로. 사용자들의 leagueRank·leagueSize도 갱신한다.
export function refreshLeague(viewerId?: string): LeagueEntry[] {
  const pool = [...users.values()].map((u) => u.me)
  if (pool.length === 0) pool.push(current().me) // 브라우저 게스트
  const entries: (LeagueEntry & { id?: string })[] = [
    ...pool.map((m) => ({ rank: 0, name: m.name, avatar: avatarOf(m.id), xpThisWeek: m.xpThisWeek, id: m.id })),
    ...opponents.map((o) => ({ rank: 0, name: o.name, avatar: avatarFor(o.name), xpThisWeek: o.xpThisWeek })),
  ]
  entries.sort((a, b) => b.xpThisWeek - a.xpThisWeek)
  entries.forEach((e, i) => (e.rank = i + 1))
  for (const m of pool) {
    const mine = entries.find((e) => e.id === m.id)
    if (mine) m.leagueRank = mine.rank
    m.leagueSize = entries.length
  }
  return entries.map(({ id, ...e }) => ({ ...e, isMe: id === (viewerId ?? current().me.id) || undefined }))
}

// ---- 저장용 직렬화 (Set·Map은 JSON이 안 돼서) ----

export type UserStateJson = Omit<UserState, 'wrongAnswers' | 'joinedByMe' | 'blockedUsers'> & {
  wrongAnswers: Record<string, string[]>
  joinedByMe: string[]
  blockedUsers: string[]
}

export function serializeUser(s: UserState): UserStateJson {
  return {
    ...s,
    wrongAnswers: Object.fromEntries([...s.wrongAnswers].map(([k, v]) => [k, [...v]])),
    joinedByMe: [...s.joinedByMe],
    blockedUsers: [...s.blockedUsers],
  }
}

export function deserializeUser(data: unknown): UserState | null {
  const d = data as Partial<UserStateJson> | undefined
  if (!d?.me?.id || !d.me.login) return null
  const base = newUserState(d.me.id, d.me.login, d.me.name ?? '')
  Object.assign(base.me, d.me)
  if (Array.isArray(d.folders)) base.folders = d.folders
  if (Array.isArray(d.recordingFolders)) base.recordingFolders = d.recordingFolders
  if (Array.isArray(d.recordingTagList)) base.recordingTagList = d.recordingTagList.map(String)
  if (d.lectureTags && typeof d.lectureTags === 'object') base.lectureTags = d.lectureTags
  if (Array.isArray(d.todayReviews)) base.todayReviews = d.todayReviews
  if (d.wrongAnswers && typeof d.wrongAnswers === 'object') {
    for (const [k, v] of Object.entries(d.wrongAnswers)) {
      if (Array.isArray(v)) base.wrongAnswers.set(k, new Set(v.map(String)))
    }
  }
  if (Array.isArray(d.joinedByMe)) base.joinedByMe = new Set(d.joinedByMe.map(String))
  if (Array.isArray(d.blockedUsers)) base.blockedUsers = new Set(d.blockedUsers.map(String))
  if (Array.isArray(d.boardKeywords)) base.boardKeywords = d.boardKeywords.map(String)
  return base
}
