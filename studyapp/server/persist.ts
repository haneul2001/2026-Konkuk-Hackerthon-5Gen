import {
  comments,
  folders,
  league,
  lectureTags,
  me,
  posts,
  recordingFolders,
  recordingTagList,
  studyContacts,
  todayReviews,
} from '../shared/mock'
import { exportBoardState, importBoardState } from '../shared/board'
import { exportWrongAnswers, importWrongAnswers } from '../shared/quiz'

// Express 상태를 AI 서버 DB(app_state 테이블)에 저장한다.
//  - 켜질 때: GET /api/store 로 전부 불러와 메모리 배열·객체를 그 자리에서 채운다
//    (shared/*.ts가 배열을 import해서 쓰므로 새 배열로 바꾸지 않고 안을 갈아 끼운다)
//  - 바뀔 때: 서버가 GET이 아닌 요청을 처리할 때마다 잠깐 모았다가 PUT /api/store 로 통째로 저장한다
// AI 서버에 아직 연결되기 전에는 저장하지 않는다. 연결되면 DB 내용이 메모리를 덮는다.
// (그 사이 바꾼 건 잃는다. Express는 AI 서버 뒤에 켜는 게 맞다.)

const AI = process.env.AI_SERVER ?? 'http://localhost:8000'
const SAVE_DELAY_MS = 300
const RETRY_MS = 5000

type Snapshot = Record<string, unknown>

let loaded = false
let timer: ReturnType<typeof setTimeout> | null = null
let saving = false
let pending = false

export function isLoaded() {
  return loaded
}

// 저장할 모양으로 모은다
function snapshot(): Snapshot {
  return {
    me,
    league,
    todayReviews,
    posts,
    comments,
    studyContacts,
    folders,
    recordingFolders,
    recordingTagList,
    lectureTags,
    board: exportBoardState(),
    wrongAnswers: exportWrongAnswers(),
  }
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
function restore(data: Snapshot) {
  if (data.me && typeof data.me === 'object') Object.assign(me, data.me)
  fill(league, data.league)
  fill(todayReviews, data.todayReviews)
  fill(posts, data.posts)
  fill(comments, data.comments)
  fillRecord(studyContacts, data.studyContacts)
  fill(folders, data.folders)
  fill(recordingFolders, data.recordingFolders)
  fill(recordingTagList, data.recordingTagList)
  fillRecord(lectureTags, data.lectureTags)
  importBoardState(data.board)
  importWrongAnswers(data.wrongAnswers)
  // 리그에 내가 없으면(처음) 넣는다. 이름은 프로필에서 바꾼 것을 따른다
  const mine = league.find((e) => e.isMe)
  if (!mine) league.push({ rank: 1, name: me.name, xpThisWeek: me.xpThisWeek, isMe: true })
}

export async function loadState(): Promise<void> {
  try {
    const r = await fetch(`${AI}/api/store`, { signal: AbortSignal.timeout(5000) })
    if (!r.ok) throw new Error(String(r.status))
    const data = (await r.json()) as Snapshot
    restore(data)
    loaded = true
    const keys = Object.keys(data).length
    console.log(keys ? `상태 불러옴 (${keys}개 항목)` : '저장된 상태 없음. 비어 있는 채로 시작')
    if (pending) scheduleSave() // 불러오기 전에 바뀐 게 있으면 지금 상태를 저장
  } catch {
    console.warn(`AI 서버(${AI})에서 상태를 못 불러옴. ${RETRY_MS / 1000}초 뒤 다시 시도. 그동안은 저장하지 않음`)
    setTimeout(loadState, RETRY_MS).unref()
  }
}

// 바뀐 뒤 잠깐 모아서 한 번에 저장. 저장 중에 또 바뀌면 끝나고 한 번 더.
export function scheduleSave() {
  pending = true
  if (!loaded || timer) return
  timer = setTimeout(async () => {
    timer = null
    if (saving) return
    saving = true
    pending = false
    try {
      const r = await fetch(`${AI}/api/store`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot()),
        signal: AbortSignal.timeout(10000),
      })
      if (!r.ok) throw new Error(String(r.status))
    } catch (e) {
      console.warn('상태 저장 실패. 다음에 바뀔 때 다시 저장:', e instanceof Error ? e.message : e)
      pending = true
    } finally {
      saving = false
      if (pending) scheduleSave()
    }
  }, SAVE_DELAY_MS)
}
