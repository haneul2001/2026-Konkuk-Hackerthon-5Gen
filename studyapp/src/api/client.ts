import type {
  BoardPost,
  Concept,
  Folder,
  LeagueEntry,
  Lecture,
  Notice,
  Quiz,
  QuizSource,
  QuizSubmission,
  QuizSubmitResult,
  QuizType,
  ReviewItem,
  UserSummary,
} from '../../shared/types'
import * as mock from '../../shared/mock'
import * as admin from '../../shared/admin'
import * as folderStore from '../../shared/folders'
import * as notices from '../../shared/notices'
import * as quiz from '../../shared/quiz'

// API 클라이언트. 서버가 꺼져 있으면 목 데이터로 대체해서 화면이 항상 뜨게 한다.

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
): Promise<T> {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(String(res.status))
    return (await res.json()) as T
  } catch {
    return fallback()
  }
}

export const api = {
  me: () => get<UserSummary>('/api/me', mock.me),
  todayReviews: () => get<ReviewItem[]>('/api/reviews/today', mock.todayReviews),
  lectures: () => get<Lecture[]>('/api/lectures', mock.lectures),
  league: () => get<LeagueEntry[]>('/api/league', mock.league),
  posts: () => get<BoardPost[]>('/api/posts', mock.posts),
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

  // 강의 또는 폴더의 개념으로 문제를 만든다.
  createQuiz: (source: Exclude<QuizSource, { kind: 'review' }>, type: QuizType, count: number) =>
    send<Quiz | null>('POST', '/api/quiz', { source, type, count }, () =>
      quiz.buildQuiz(source, type, count),
    ),
  createReviewQuiz: (reviewId: string) =>
    send<Quiz | null>('POST', `/api/reviews/${reviewId}/quiz`, {}, () =>
      quiz.buildReviewQuiz(reviewId),
    ),
  submitQuiz: (sub: QuizSubmission) =>
    send<QuizSubmitResult>('POST', `/api/quiz/${sub.quizId}/submit`, sub, () =>
      quiz.submitQuiz(sub),
    ),

  // 알림: 앱을 열 때 한 번 가져와서 배너로 띄운다.
  notifications: () => get<Notice[]>('/api/notifications', notices.currentNotices()),

  // 관리자(개발용)
  setStudyRecord: (input: admin.StudyRecordInput) =>
    send<UserSummary>('PATCH', '/api/admin/study-record', input, () => admin.setStudyRecord(input)),
}
