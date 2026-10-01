import { comments, posts, studyContacts } from '../shared/mock'
import { exportReports, importReports } from '../shared/board'
import { deserializeUser, serializeUser, users } from '../shared/session'

// Express 상태를 AI 서버 DB(app_state 테이블)에 저장한다.
//  - 공용(모두가 보는 것): posts, comments, studyContacts, reports → 키 하나씩
//  - 사용자별: user_<사용자 id> → 그 사람의 상태 전부(내 기록·폴더·태그·복습·참여·차단)
//  - 켜질 때: GET /api/store 로 전부 불러온다. 실패하면 연결될 때까지 5초마다 다시 시도
//  - 바뀔 때: 요청이 끝나면 300ms 모았다가 공용 키 + 바뀐 사용자 키만 PUT /api/store
// 불러오기 전에는 저장하지 않는다. 연결되면 DB 내용이 메모리를 덮는다 (Express는 AI 서버 뒤에 켠다).

const AI = process.env.AI_SERVER ?? 'http://localhost:8000'
const SAVE_DELAY_MS = 300
const RETRY_MS = 5000
const USER_PREFIX = 'user_'

let loaded = false
let timer: ReturnType<typeof setTimeout> | null = null
let saving = false
let pending = false
const dirtyUsers = new Set<string>()

export function isLoaded() {
  return loaded
}

function fill<T>(target: T[], value: unknown) {
  if (!Array.isArray(value)) return
  target.length = 0
  target.push(...(value as T[]))
}

function fillRecord(target: Record<string, unknown>, value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  for (const k of Object.keys(target)) delete target[k]
  Object.assign(target, value)
}

// 불러온 것을 메모리에 그 자리에서 채운다. 모양이 이상한 키는 건너뛴다.
function restore(data: Record<string, unknown>) {
  fill(posts, data.posts)
  fill(comments, data.comments)
  fillRecord(studyContacts, data.studyContacts)
  importReports(data.reports)
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(USER_PREFIX)) continue
    const state = deserializeUser(value)
    if (state) users.set(state.me.id, state)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms).unref())

// 연결될 때까지 기다렸다가 불러온다. 성공해야 끝난다.
export async function loadState(): Promise<void> {
  let warned = false
  for (;;) {
    try {
      const r = await fetch(`${AI}/api/store`, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(String(r.status))
      const data = (await r.json()) as Record<string, unknown>
      restore(data)
      loaded = true
      console.log(`상태 불러옴: 사용자 ${users.size}명, 글 ${posts.length}개`)
      if (pending || dirtyUsers.size) scheduleSave() // 불러오기 전에 바뀐 게 있으면 지금 저장
      return
    } catch {
      if (!warned) {
        console.warn(`AI 서버(${AI})에서 상태를 못 불러옴. ${RETRY_MS / 1000}초마다 다시 시도. 그동안은 저장하지 않음`)
        warned = true
      }
      await sleep(RETRY_MS)
    }
  }
}

// 바뀐 뒤 잠깐 모아서 한 번에 저장. userId를 주면 그 사용자 상태도 같이.
export function scheduleSave(userId?: string) {
  pending = true
  if (userId) dirtyUsers.add(userId)
  if (!loaded || timer) return
  timer = setTimeout(() => {
    timer = null
    void saveNow()
  }, SAVE_DELAY_MS)
}

async function saveNow() {
  if (saving || !loaded) return
  saving = true
  pending = false
  const ids = [...dirtyUsers]
  dirtyUsers.clear()
  const body: Record<string, unknown> = { posts, comments, studyContacts, reports: exportReports() }
  for (const id of ids) {
    const s = users.get(id)
    if (s) body[USER_PREFIX + id] = serializeUser(s)
  }
  try {
    const r = await fetch(`${AI}/api/store`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    if (!r.ok) throw new Error(String(r.status))
  } catch (e) {
    console.warn('상태 저장 실패. 다음에 바뀔 때 다시 저장:', e instanceof Error ? e.message : e)
    pending = true
    for (const id of ids) dirtyUsers.add(id)
  } finally {
    saving = false
    if (pending) scheduleSave()
  }
}

// 서버가 꺼질 때(Render 재배포·잠들기, Ctrl+C): 모아 둔 변경을 바로 저장하고 끝낸다.
// 저장 중이면 끝나길 기다린다. 강제 종료(SIGKILL)는 못 막는다.
export async function flushSave(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  for (let i = 0; i < 50 && saving; i++) await sleep(100)
  if (pending || dirtyUsers.size) await saveNow()
}
