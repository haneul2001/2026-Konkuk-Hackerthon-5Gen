import type {
  BoardComment,
  BoardKind,
  BoardPost,
  Concept,
  Folder,
  LeagueEntry,
  Lecture,
  NewPost,
  Notice,
  Quiz,
  Report,
  ReportReason,
  QuizSource,
  QuizSubmission,
  QuizSubmitResult,
  QuizType,
  ReviewItem,
  StudyCard,
  TranscriptSegment,
  UserSummary,
} from '../../shared/types'
import * as mock from '../../shared/mock'
import * as admin from '../../shared/admin'
import * as board from '../../shared/board'
import * as folderStore from '../../shared/folders'
import * as notices from '../../shared/notices'
import * as quiz from '../../shared/quiz'

// API 클라이언트. 서버가 꺼져 있으면 목 데이터로 대체해서 화면이 항상 뜨게 한다.
// 단, 업로드·퀴즈 생성은 AI 서버 오류가 묻히지 않도록 서버가 준 { error }를 ApiError로 던진다.

export class ApiError extends Error {}

// 서버가 { error }를 돌려줬으면 그 문구, 아니면 null (프록시 오류 등 서버가 아예 없는 경우)
async function errorOf(res: Response): Promise<string | null> {
  try {
    const body = await res.json()
    return typeof body?.error === 'string' ? body.error : null
  } catch {
    return null
  }
}

async function get<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(path)
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as T
  } catch {
    return fallback
  }
}

// 쓰기 요청. 서버가 없으면 같은 shared 로직을 브라우저에서 돌린다(새로고침하면 초기화).
async function send<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body: unknown,
  fallback: () => T,
  { strict = false } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return fallback()
  }
  if (!res.ok) {
    // strict면 서버가 준 이유를 보여준다. 서버가 아예 없으면(이유 없음) 목으로 대체.
    const reason = strict ? await errorOf(res) : null
    if (reason) throw new ApiError(reason)
    return fallback()
  }
  return (await res.json()) as T
}

// 녹음 업로드. 목으로 대체하지 않는다. 성공하면 처리 중(processing)인 강의가 온다.
async function upload(form: FormData): Promise<Lecture> {
  let res: Response
  try {
    res = await fetch('/api/lectures', { method: 'POST', body: form })
  } catch {
    throw new ApiError('서버에 연결할 수 없어요')
  }
  if (!res.ok) throw new ApiError((await errorOf(res)) ?? '서버에 연결할 수 없어요')
  return (await res.json()) as Lecture
}

export const api = {
  me: () => get<UserSummary>('/api/me', mock.me),
  todayReviews: () => get<ReviewItem[]>('/api/reviews/today', mock.todayReviews),
  lectures: () => get<Lecture[]>('/api/lectures', mock.lectures),
  lecture: (id: string) =>
    get<Lecture | null>(`/api/lectures/${id}`, mock.lectures.find((l) => l.id === id) ?? null),
  // form: audio(파일), course, title?, recordedAt?(YYYY-MM-DD)
  uploadLecture: upload,
  // 플래시카드: 개념 묶음의 큐카드 (다시 볼 카드가 앞). 서버가 없으면 빈 배열 → 개념 카드로 대신 보여준다
  cards: (conceptIds: string[]) =>
    get<StudyCard[]>(`/api/cards?concepts=${encodeURIComponent(conceptIds.join(','))}`, []),
  reviewCards: (results: { cardId: string; known: boolean }[]) =>
    send<{ reviewed: number }>('POST', '/api/cards/review', { results }, () => ({ reviewed: 0 })),
  // 녹음 다시 듣기: 원본 오디오 주소와 시간이 붙은 자막. 목 데이터에는 녹음이 없다.
  audioUrl: (id: string) => `/api/lectures/${id}/audio-file`,
  transcript: (id: string) =>
    get<{ text: string | null; segments: TranscriptSegment[] } | null>(`/api/lectures/${id}/transcript`, null),
  league: () => get<LeagueEntry[]>('/api/league', mock.league),

  // 게시판
  posts: (kind?: BoardKind) =>
    get<BoardPost[]>(kind ? `/api/posts?board=${kind}` : '/api/posts', board.listPosts(kind)),
  post: (id: string) =>
    get<{ post: BoardPost; comments: BoardComment[] } | null>(`/api/posts/${id}`, board.getPost(id)),
  createPost: (input: NewPost) =>
    send<BoardPost | { error: string }>('POST', '/api/posts', input, () => board.createPost(input)),
  updatePost: (id: string, input: Omit<NewPost, 'board'>) =>
    send<BoardPost | { error: string }>('PATCH', `/api/posts/${id}`, input, () => board.updatePost(id, input)),
  deletePost: (id: string) =>
    send<{ ok: true } | { error: string }>('DELETE', `/api/posts/${id}`, {}, () => board.deletePost(id)),
  // 스터디 참여. 성공하면 study.contact에 연락처가 온다.
  joinPost: (id: string) =>
    send<BoardPost | { error: string }>('POST', `/api/posts/${id}/join`, {}, () => board.joinPost(id)),
  likeComment: (id: string) =>
    send<BoardComment | { error: string }>('POST', `/api/comments/${id}/like`, {}, () =>
      board.toggleCommentLike(id),
    ),
  blockCommentAuthor: (id: string) =>
    send<{ ok: true } | { error: string }>('POST', `/api/comments/${id}/block`, {}, () =>
      board.blockCommentAuthor(id),
    ),
  reportComment: (id: string, reason: ReportReason) =>
    send<{ ok: true } | { error: string }>('POST', `/api/comments/${id}/report`, { reason }, () =>
      board.reportComment(id, reason),
    ),
  blockPostAuthor: (id: string) =>
    send<{ ok: true } | { error: string }>('POST', `/api/posts/${id}/block`, {}, () => board.blockPostAuthor(id)),
  reportPost: (id: string, reason: ReportReason) =>
    send<{ ok: true } | { error: string }>('POST', `/api/posts/${id}/report`, { reason }, () =>
      board.reportPost(id, reason),
    ),
  likePost: (id: string) =>
    send<BoardPost | null>('POST', `/api/posts/${id}/like`, {}, () => board.toggleLike(id)),
  // parentId를 주면 대댓글
  addComment: (id: string, body: string, anonymous: boolean, parentId?: string) =>
    send<BoardComment | { error: string }>(
      'POST',
      `/api/posts/${id}/comments`,
      { body, anonymous, parentId },
      () => board.addComment(id, body, anonymous, parentId),
    ),
  concepts: () => get<Concept[]>('/api/concepts', mock.concepts),

  folders: () => get<Folder[]>('/api/folders', mock.folders),
  createFolder: (name: string, conceptIds: string[] = []) =>
    send<Folder>('POST', '/api/folders', { name, conceptIds }, () =>
      folderStore.createFolder(name, conceptIds),
    ),
  updateFolder: (id: string, patch: { name?: string; conceptIds?: string[] }) =>
    send<Folder | null>('PATCH', `/api/folders/${id}`, patch, () =>
      folderStore.updateFolder(id, patch),
    ),
  deleteFolder: (id: string) =>
    send<boolean>('DELETE', `/api/folders/${id}`, {}, () => folderStore.deleteFolder(id)),

  // 강의 또는 폴더의 개념으로 문제를 만든다. AI 서버가 새로 만들어서 15~45초 걸린다.
  createQuiz: (source: Exclude<QuizSource, { kind: 'review' }>, type: QuizType, count: number) =>
    send<Quiz | null>(
      'POST',
      '/api/quiz',
      { source, type, count },
      () => quiz.buildQuiz(source, type, count),
      { strict: true },
    ),
  createReviewQuiz: (reviewId: string) =>
    send<Quiz | null>(
      'POST',
      `/api/reviews/${reviewId}/quiz`,
      {},
      () => quiz.buildReviewQuiz(reviewId),
      { strict: true },
    ),
  submitQuiz: (sub: QuizSubmission) =>
    send<QuizSubmitResult>('POST', `/api/quiz/${sub.quizId}/submit`, sub, () =>
      quiz.submitQuiz(sub),
    ),

  // 알림: 앱을 열 때 한 번 가져와서 배너로 띄운다.
  notifications: () => get<Notice[]>('/api/notifications', notices.currentNotices()),

  // 관리자(개발용)
  reports: () => get<Report[]>('/api/admin/reports', board.listReports()),
  setStudyRecord: (input: admin.StudyRecordInput) =>
    send<UserSummary>('PATCH', '/api/admin/study-record', input, () => admin.setStudyRecord(input)),
}
