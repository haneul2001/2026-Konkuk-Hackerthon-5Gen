import { comments, posts, studyContacts } from './mock'
import { avatarFor } from './avatars'
import { avatarOf, current } from './session'
import { REPORT_REASONS } from './types'
import type { BoardComment, BoardKind, BoardPost, NewPost, Report, ReportReason } from './types'

// 게시판 글·댓글·공감·스터디 참여. 서버와 (서버가 꺼져 있을 때) 프론트가 같은 코드를 쓴다.
// 참여·차단은 로그인한 사용자의 상태(current())에, 공감은 글에 적는다(TODO: 사용자별 공감).
// 저장된 글을 그대로 내보내지 않고 view()로 복사해서, 연락처는 볼 수 있는 사람에게만 붙인다.
// 차단: 그 사람의 글은 목록에서 빠지고 댓글은 내용이 가려진다. 랭킹(리그)에는 그대로 나온다.

export const BOARDS: { key: BoardKind; label: string }[] = [
  { key: 'free', label: '자유게시판' },
  { key: 'question', label: '질문 게시판' },
  { key: 'study', label: '그룹 스터디 모집' },
]

type Fail = { error: string }

// 신고는 모두의 것(관리자가 본다). 저장소(server/persist.ts)가 내보내고 들여온다.
const reports: Report[] = []

export function exportReports(): Report[] {
  return reports
}

export function importReports(data: unknown) {
  if (!Array.isArray(data)) return
  reports.length = 0
  reports.push(...(data as Report[]))
}

const newest = (a: { createdAt: string }, b: { createdAt: string }) => b.createdAt.localeCompare(a.createdAt)

function view(p: BoardPost): BoardPost {
  const mine = p.authorId === current().me.id
  const joined = current().joinedByMe.has(p.id)
  return {
    ...p,
    mine,
    avatar: p.anonymous ? avatarFor(p.id) : avatarOf(p.authorId),
    study: p.study && {
      ...p.study,
      joinedByMe: joined,
      contact: mine || joined ? studyContacts[p.id] : undefined,
    },
  }
}

// q가 있으면 제목·본문·태그에서 찾는다(띄어쓰기·대소문자 무시).
export function matches(p: BoardPost, q: string) {
  const needle = q.replace(/\s+/g, '').toLowerCase()
  return !needle || `${p.title}${p.body}${p.tags.join('')}`.replace(/\s+/g, '').toLowerCase().includes(needle)
}

export function listPosts(board?: BoardKind, q = ''): BoardPost[] {
  return posts
    .filter((p) => (!board || p.board === board) && !current().blockedUsers.has(p.authorId) && matches(p, q))
    .sort(newest)
    .map(view)
}

export function getPost(id: string): { post: BoardPost; comments: BoardComment[] } | null {
  const post = posts.find((p) => p.id === id)
  if (!post) return null
  // 차단한 사람 글에 주소로 들어오면 내용 없이 표시만
  if (current().blockedUsers.has(post.authorId)) {
    return { post: { ...view(post), title: '', body: '', tags: [], study: undefined, blocked: true }, comments: [] }
  }
  return {
    post: view(post),
    comments: comments
      .filter((c) => c.postId === id)
      .sort((a, b) => -newest(a, b))
      .map(viewComment),
  }
}

// 댓글도 복사해서 내보낸다. 차단한 사람 댓글은 내용을 비운다.
function viewComment(c: BoardComment): BoardComment {
  const blocked = current().blockedUsers.has(c.authorId)
  return {
    ...c,
    body: blocked ? '' : c.body,
    likes: c.likes ?? 0,
    liked: !!c.liked,
    mine: c.authorId === current().me.id,
    blocked,
    avatar: /^익명/.test(c.author) ? avatarFor(`${c.postId}:${c.author}`) : avatarOf(c.authorId),
  }
}

export function toggleCommentLike(id: string): BoardComment | Fail {
  const c = comments.find((x) => x.id === id)
  if (!c) return { error: '댓글을 찾을 수 없어요' }
  if (c.authorId === current().me.id) return { error: '내 댓글에는 공감할 수 없어요' }
  c.liked = !c.liked
  c.likes = (c.likes ?? 0) + (c.liked ? 1 : -1)
  return viewComment(c)
}

// 그 댓글을 쓴 사람을 차단한다. 이후 그 사람의 글은 목록에서 빠지고 댓글은 모든 글에서 가려진다.
export function blockCommentAuthor(id: string): { ok: true } | Fail {
  const c = comments.find((x) => x.id === id)
  if (!c) return { error: '댓글을 찾을 수 없어요' }
  if (c.authorId === current().me.id) return { error: '나는 차단할 수 없어요' }
  current().blockedUsers.add(c.authorId)
  return { ok: true }
}

export function reportComment(id: string, reason: ReportReason): { ok: true } | Fail {
  const c = comments.find((x) => x.id === id)
  if (!c) return { error: '댓글을 찾을 수 없어요' }
  if (c.authorId === current().me.id) return { error: '내 댓글은 신고할 수 없어요' }
  if (!REPORT_REASONS.includes(reason)) return { error: '신고 사유를 골라 주세요' }
  if (reports.some((r) => r.kind === 'comment' && r.targetId === id)) return { error: '이미 신고한 댓글이에요' }
  reports.push({
    id: newId('rpt'),
    kind: 'comment',
    targetId: id,
    postId: c.postId,
    postTitle: posts.find((p) => p.id === c.postId)?.title ?? '(지워진 글)',
    author: c.author,
    body: c.body,
    reason,
    createdAt: new Date().toISOString(),
  })
  return { ok: true }
}

// 게시글을 쓴 사람 차단. 댓글 차단과 같은 목록을 쓴다.
export function blockPostAuthor(id: string): { ok: true } | Fail {
  const p = posts.find((x) => x.id === id)
  if (!p) return { error: '글을 찾을 수 없어요' }
  if (p.authorId === current().me.id) return { error: '나는 차단할 수 없어요' }
  current().blockedUsers.add(p.authorId)
  return { ok: true }
}

export function reportPost(id: string, reason: ReportReason): { ok: true } | Fail {
  const p = posts.find((x) => x.id === id)
  if (!p) return { error: '글을 찾을 수 없어요' }
  if (p.authorId === current().me.id) return { error: '내 글은 신고할 수 없어요' }
  if (!REPORT_REASONS.includes(reason)) return { error: '신고 사유를 골라 주세요' }
  if (reports.some((r) => r.kind === 'post' && r.targetId === id)) return { error: '이미 신고한 글이에요' }
  reports.push({
    id: newId('rpt'),
    kind: 'post',
    targetId: id,
    postId: id,
    postTitle: p.title,
    author: p.author,
    body: p.body,
    reason,
    createdAt: new Date().toISOString(),
  })
  return { ok: true }
}

// 프로필: 차단한 사람 수, 모두 해제
export function blockedCount() {
  return { count: current().blockedUsers.size }
}
export function unblockAll() {
  current().blockedUsers.clear()
  return { count: 0 }
}

// 관리자 화면용. 최근 신고부터
export function listReports(): Report[] {
  return [...reports].sort(newest)
}

function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// 태그는 '#'과 공백을 떼고, 중복 없이 최대 5개
export function cleanTags(tags: string[]) {
  return [...new Set(tags.map((t) => t.replace(/^#+/, '').replace(/\s+/g, '').slice(0, 15)).filter(Boolean))].slice(0, 5)
}

// 글쓰기·수정 공통 검사. 통과하면 다듬은 값을 돌려준다.
// minCapacity: 수정할 때는 이미 들어온 인원보다 줄일 수 없다.
type Valid = {
  title: string
  body: string
  tags: string[]
  anonymous: boolean
  study?: { course: string; minXp: number; capacity: number; contact: string }
}

function validate(input: NewPost, minCapacity = 2): Valid | Fail {
  const title = input.title?.trim().slice(0, 60)
  const body = input.body?.trim().slice(0, 2000)
  if (!BOARDS.some((b) => b.key === input.board)) return { error: '게시판을 골라 주세요' }
  if (!title) return { error: '제목을 써 주세요' }
  if (!body) return { error: '내용을 써 주세요' }
  let study: Valid['study']
  if (input.board === 'study') {
    const s = input.study
    if (!s?.course?.trim()) return { error: '과목·주제를 써 주세요' }
    const capacity = Math.floor(Number(s.capacity))
    const minXp = Math.floor(Number(s.minXp))
    if (!(capacity >= 2 && capacity <= 20)) return { error: '모집 인원은 2~20명이에요' }
    if (capacity < minCapacity) return { error: `이미 ${minCapacity}명이 있어서 그보다 줄일 수 없어요` }
    if (!(minXp >= 0)) return { error: '최소 XP를 확인해 주세요' }
    if (!s.contact?.trim()) return { error: '연락 방법을 써 주세요' }
    study = { course: s.course.trim().slice(0, 20), minXp, capacity, contact: s.contact.trim().slice(0, 200) }
  }
  return { title, body, tags: cleanTags(input.tags ?? []), anonymous: !!input.anonymous, study }
}

export function createPost(input: NewPost): BoardPost | Fail {
  const v = validate(input)
  if ('error' in v) return v
  const post: BoardPost = {
    id: newId('post'),
    board: input.board,
    title: v.title,
    body: v.body,
    tags: v.tags,
    anonymous: v.anonymous,
    author: v.anonymous ? '익명' : current().me.name,
    authorId: current().me.id,
    likes: 0,
    liked: false,
    commentCount: 0,
    createdAt: new Date().toISOString(),
    study: v.study && { course: v.study.course, minXp: v.study.minXp, capacity: v.study.capacity, joined: 1 },
  }
  if (v.study) studyContacts[post.id] = v.study.contact
  posts.push(post)
  return view(post)
}

// 내 글만 고칠 수 있다. 게시판은 바꾸지 않는다.
export function updatePost(id: string, input: Omit<NewPost, 'board'>): BoardPost | Fail {
  const post = posts.find((p) => p.id === id)
  if (!post) return { error: '글을 찾을 수 없어요' }
  if (post.authorId !== current().me.id) return { error: '내가 쓴 글만 고칠 수 있어요' }
  const v = validate({ ...input, board: post.board }, Math.max(2, post.study?.joined ?? 0))
  if ('error' in v) return v
  post.title = v.title
  post.body = v.body
  post.tags = v.tags
  post.anonymous = v.anonymous
  post.author = v.anonymous ? '익명' : current().me.name
  post.editedAt = new Date().toISOString()
  if (post.study && v.study) {
    post.study = { ...post.study, course: v.study.course, minXp: v.study.minXp, capacity: v.study.capacity }
    studyContacts[post.id] = v.study.contact
  }
  return view(post)
}

export function deletePost(id: string): { ok: true } | Fail {
  const i = posts.findIndex((p) => p.id === id)
  if (i < 0) return { error: '글을 찾을 수 없어요' }
  if (posts[i].authorId !== current().me.id) return { error: '내가 쓴 글만 지울 수 있어요' }
  posts.splice(i, 1)
  for (let j = comments.length - 1; j >= 0; j--) if (comments[j].postId === id) comments.splice(j, 1)
  current().joinedByMe.delete(id)
  delete studyContacts[id]
  return { ok: true }
}

export function toggleLike(id: string): BoardPost | null {
  const post = posts.find((p) => p.id === id)
  if (!post) return null
  post.liked = !post.liked
  post.likes += post.liked ? 1 : -1
  return view(post)
}

// 스터디 참여: 누적 XP가 조건 이상이고 자리가 남아 있으면 인원 +1, 연락처를 보여준다.
export function joinPost(id: string): BoardPost | Fail {
  const post = posts.find((p) => p.id === id)
  if (!post?.study) return { error: '스터디 모집 글이 아니에요' }
  if (post.authorId === current().me.id || current().joinedByMe.has(id)) return view(post) // 이미 들어가 있음
  const s = post.study
  if (s.joined >= s.capacity) return { error: '모집이 끝났어요' }
  const { me } = current()
  if (me.xpTotal < s.minXp) return { error: `XP가 ${(s.minXp - me.xpTotal).toLocaleString()} 더 필요해요` }
  s.joined += 1
  current().joinedByMe.add(id)
  return view(post)
}

// 에타처럼 익명 댓글은 글마다 처음 단 순서대로 익명1, 익명2… 같은 사람은 계속 같은 번호(대댓글 포함).
// 글쓴이가 단 댓글은 '(글쓴이)'를 붙인다.
// parentId가 있으면 대댓글. 대댓글에 다시 달아도 원댓글 아래로 모은다(한 단계만).
export function addComment(
  postId: string,
  body: string,
  anonymous: boolean,
  parentId?: string,
): BoardComment | Fail {
  const post = posts.find((p) => p.id === postId)
  if (!post) return { error: '글을 찾을 수 없어요' }
  const text = body?.trim().slice(0, 500)
  if (!text) return { error: '댓글을 써 주세요' }
  let rootId: string | undefined
  if (parentId) {
    const parent = comments.find((c) => c.id === parentId && c.postId === postId)
    if (!parent) return { error: '원댓글을 찾을 수 없어요' }
    rootId = parent.parentId ?? parent.id
  }

  const isWriter = post.authorId === current().me.id
  let author: string
  if (isWriter) author = `${anonymous ? '익명' : current().me.name}(글쓴이)`
  else if (!anonymous) author = current().me.name
  else {
    const mine = comments.find((c) => c.postId === postId && c.authorId === current().me.id && /^익명\d+$/.test(c.author))
    const used = new Set(
      comments.filter((c) => c.postId === postId && /^익명\d+$/.test(c.author)).map((c) => c.authorId),
    )
    author = mine?.author ?? `익명${used.size + 1}`
  }

  const comment: BoardComment = {
    id: newId('cmt'),
    postId,
    body: text,
    author,
    authorId: current().me.id,
    isWriter,
    createdAt: new Date().toISOString(),
    parentId: rootId,
  }
  comments.push(comment)
  post.commentCount += 1
  return viewComment(comment)
}
