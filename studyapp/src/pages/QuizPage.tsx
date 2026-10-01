import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Check, CircleDot, Folder as FolderIcon, Loader, PenLine, ToggleLeft } from 'lucide-react'
import type {
  Concept,
  Folder,
  Lecture,
  Quiz,
  QuizSource,
  QuizSubmitResult,
  QuizType,
  ReviewItem,
} from '../../shared/types'
import { api, ApiError } from '../api/client'
import { QuizPlayer, type Answer } from '../components/quiz/QuizPlayer'
import { QuizResult } from '../components/quiz/QuizResult'
import {
  Button,
  ButtonLink,
  Card,
  ListSkeleton,
  PageTitle,
  Row,
  Section,
  Segmented,
} from '../components/ui'
import { cn } from '../lib/cn'
import { useNotify } from '../lib/notify'

// 퀴즈: 설정 → 풀이 → 결과. 문제는 항상 "개념 묶음" 안에서만 나온다.
//  /quiz?folder=ID   내가 만든 폴더의 개념으로
//  /quiz?lecture=ID  강의 하나의 개념 전체로
//  /quiz?review=ID   홈의 오늘 복습

type Phase =
  | { name: 'setup' }
  | { name: 'play'; quiz: Quiz }
  | { name: 'result'; quiz: Quiz; answers: Answer[]; result: QuizSubmitResult | null }

export function QuizPage() {
  const [phase, setPhase] = useState<Phase>({ name: 'setup' })
  const notify = useNotify()

  // 화면이 바뀌면 맨 위부터 보이게
  useEffect(() => {
    document.querySelector('main')?.scrollTo(0, 0)
  }, [phase.name])

  function start(quiz: Quiz) {
    setPhase({ name: 'play', quiz })
  }

  function finish(quiz: Quiz, answers: Answer[]) {
    setPhase({ name: 'result', quiz, answers, result: null })
    api
      .submitQuiz({
        quizId: quiz.id,
        source: quiz.source,
        results: answers.map(({ questionId, correct }) => ({ questionId, correct })),
      })
      .then((result) => {
        setPhase((p) => (p.name === 'result' ? { ...p, result } : p))
        result.notices.forEach(notify) // 목표 달성, 새로 참여 가능한 스터디 등
      })
  }

  if (phase.name === 'play') {
    return (
      <QuizPlayer
        key={phase.quiz.id}
        quiz={phase.quiz}
        onFinish={(answers) => finish(phase.quiz, answers)}
        onQuit={() => setPhase({ name: 'setup' })}
      />
    )
  }

  if (phase.name === 'result') {
    const { quiz, answers } = phase
    return (
      <QuizResult
        quiz={quiz}
        answers={answers}
        result={phase.result}
        onRetryWrong={() => {
          const wrongIds = new Set(answers.filter((a) => a.correct === false).map((a) => a.questionId))
          start({
            ...quiz,
            id: `${quiz.id}_retry${Date.now().toString(36)}`,
            questions: quiz.questions.filter((q) => wrongIds.has(q.id)),
          })
        }}
      />
    )
  }

  return <Setup onStart={start} />
}

// ---- 설정 ----

const types: { key: QuizType; label: string; note: string; icon: typeof CircleDot }[] = [
  { key: 'multiple', label: '객관식', note: '자동 채점 · 맞힌 문제마다 XP', icon: CircleDot },
  { key: 'ox', label: 'O/X', note: '자동 채점 · 맞힌 문제마다 XP', icon: ToggleLeft },
  { key: 'essay', label: '서술형', note: '핵심어 비교 · XP 미반영', icon: PenLine },
]

function Setup({ onStart }: { onStart: (quiz: Quiz) => void }) {
  const [params, setParams] = useSearchParams()
  const lectureId = params.get('lecture')
  const folderId = params.get('folder')
  const reviewId = params.get('review')

  const [lectures, setLectures] = useState<Lecture[] | null>(null)
  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [concepts, setConcepts] = useState<Concept[] | null>(null)
  const [reviews, setReviews] = useState<ReviewItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.lectures().then(setLectures)
    api.folders().then(setFolders)
    api.concepts().then(setConcepts)
    api.todayReviews().then(setReviews)
  }, [])

  async function run(make: () => Promise<Quiz | null>) {
    setLoading(true)
    setError('')
    try {
      const quiz = await make()
      if (quiz && quiz.questions.length > 0) onStart(quiz)
      else setError('담긴 개념으로 만들 수 있는 문제가 아직 없어요.')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '문제를 만들지 못했어요. 잠시 뒤 다시 해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  // 복습으로 들어온 경우: 고를 것 없이 바로 시작
  if (reviewId) {
    const review = reviews?.find((r) => r.id === reviewId)
    return (
      <div className="space-y-6">
        <PageTitle title="오늘 복습" sub="틀렸던 문제와 잊을 때가 된 문제를 다시 풀어요." />
        {reviews === null ? (
          <ListSkeleton rows={1} />
        ) : !review ? (
          <Card className="px-5 py-8 text-center">
            <p className="text-[15px] text-muted">이미 끝낸 복습이에요.</p>
            <ButtonLink to="/" variant="primary" className="mt-4">
              홈으로
            </ButtonLink>
          </Card>
        ) : (
          <>
            <Card className="flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{review.lectureTitle}</p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {review.reason === 'wrong' ? '틀린 문제 다시 풀기' : '잊기 전에 다시 보기'} ·{' '}
                  {review.questionCount}문제
                </p>
              </div>
            </Card>
            <StartButton loading={loading} onClick={() => run(() => api.createReviewQuiz(review.id))} />
            {error && <ErrorText text={error} />}
          </>
        )}
      </div>
    )
  }

  if (lectures === null || folders === null || concepts === null) {
    return (
      <div className="space-y-6">
        <PageTitle title="퀴즈" />
        <ListSkeleton rows={3} />
      </div>
    )
  }

  // 출제 범위 정하기
  let scope: { source: Exclude<QuizSource, { kind: 'review' }>; title: string; conceptIds: string[] } | null = null
  const folder = folders.find((f) => f.id === folderId)
  const lecture = lectures.find((l) => l.id === lectureId && l.status === 'ready')
  if (folder) {
    scope = { source: { kind: 'folder', id: folder.id }, title: folder.name, conceptIds: folder.conceptIds }
  } else if (lecture) {
    scope = {
      source: { kind: 'lecture', id: lecture.id },
      title: lecture.title,
      conceptIds: concepts.filter((c) => c.lectureId === lecture.id).map((c) => c.id),
    }
  }

  // 범위를 아직 안 고른 경우: 폴더 또는 강의 고르기
  if (!scope) {
    const ready = lectures.filter((l) => l.status === 'ready')
    return (
      <div className="space-y-6">
        <PageTitle title="퀴즈" sub="어떤 개념으로 풀어볼까요?" />
        <Section title="내 폴더" action={{ label: '폴더 관리', to: '/library?tab=concepts' }}>
          {folders.length === 0 ? (
            <p className="text-[14px] text-muted">아직 만든 폴더가 없어요.</p>
          ) : (
            <Card>
              <ul className="divide-y-2 divide-line">
                {folders.map((f) => (
                  <li key={f.id}>
                    <Row
                      onClick={() => setParams({ folder: f.id }, { replace: true, state: { scrollTop: true } })}
                      leading={<FolderBadge />}
                      title={f.name}
                      meta={`개념 ${f.conceptIds.length}개`}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </Section>
        <Section title="강의별">
          <Card>
            <ul className="divide-y-2 divide-line">
              {ready.map((l) => (
                <li key={l.id}>
                  <Row
                    onClick={() => setParams({ lecture: l.id }, { replace: true, state: { scrollTop: true } })}
                    title={l.title}
                    meta={`개념 ${concepts.filter((c) => c.lectureId === l.id).length}개`}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      </div>
    )
  }

  return <Options scope={scope} loading={loading} error={error} onRun={run} />
}

function Options({
  scope,
  loading,
  error,
  onRun,
}: {
  scope: { source: Exclude<QuizSource, { kind: 'review' }>; title: string; conceptIds: string[] }
  loading: boolean
  error: string
  onRun: (make: () => Promise<Quiz | null>) => void
}) {
  const [type, setType] = useState<QuizType>('multiple')
  const [count, setCount] = useState(10)

  const isFolder = scope.source.kind === 'folder'

  if (scope.conceptIds.length === 0) {
    return (
      <div className="space-y-6">
        <PageTitle title="퀴즈" sub={scope.title} />
        <Card className="px-5 py-8 text-center">
          <p className="text-[15px] text-pretty text-muted">
            {isFolder ? '이 폴더에 담긴 개념이 없어요. 개념을 담으면 그걸로 문제가 나와요.' : '이 강의에서 정리된 개념이 아직 없어요.'}
          </p>
          {isFolder && (
            <ButtonLink to={`/library/folders/${scope.source.id}?add=1`} variant="primary" className="mt-4">
              개념 담으러 가기
            </ButtonLink>
          )}
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title="퀴즈"
        sub={
          <span className="inline-flex items-center gap-1.5">
            {isFolder && <FolderIcon className="size-4" aria-hidden />}
            {scope.title} · 개념 {scope.conceptIds.length}개에서 출제
          </span>
        }
      />

      <fieldset className="space-y-2.5">
        <legend className="mb-2.5 text-[17px] font-bold">문제 유형</legend>
        {types.map((t) => {
          const selected = type === t.key
          return (
            <label
              key={t.key}
              className={cn(
                'press flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 bg-surface px-4 py-3',
                'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
                selected
                  ? 'border-primary shadow-[0_3px_0_var(--color-primary)]'
                  : 'border-line shadow-[0_3px_0_var(--color-line)]',
                loading && 'cursor-not-allowed opacity-50',
              )}
            >
              <input
                type="radio"
                name="type"
                value={t.key}
                checked={selected}
                disabled={loading}
                onChange={() => setType(t.key)}
                className="sr-only"
              />
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-xl',
                  selected ? 'bg-highlight text-primary-deep' : 'bg-bg text-muted',
                )}
              >
                <t.icon className="size-5" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold">{t.label}</span>
                <span className="block text-[13px] text-muted">{t.note}</span>
              </span>
              {selected && <Check className="size-5 text-muted" strokeWidth={3} aria-hidden />}
            </label>
          )
        })}
      </fieldset>

      <div>
        <p className="mb-2.5 text-[17px] font-bold">문항 수</p>
        <Segmented
          label="문항 수"
          value={String(count)}
          options={COUNTS.map((n) => [String(n), `${n}문제`] as const)}
          onChange={(v) => !loading && setCount(Number(v))}
        />
      </div>

      <StartButton
        loading={loading}
        onClick={() => onRun(() => api.createQuiz(scope.source, type, count))}
      />
      {loading && <Generating />}
      {error && <ErrorText text={error} />}

      {!loading && (
        <p className="text-[13px] text-pretty text-muted">
          누를 때마다 강의 내용으로 새 문제를 만들어요. 전에 틀린 문제도 다시 섞여 나와요.
        </p>
      )}
    </div>
  )
}

const COUNTS = [5, 10, 15, 20]

// 문제 생성은 15~45초 걸린다. 멈춘 게 아니라는 걸 보여준다.
function Generating() {
  return (
    <Card role="status" className="flex items-center gap-3 p-4">
      <Loader className="size-6 shrink-0 animate-spin text-muted motion-reduce:animate-none" aria-hidden />
      <div>
        <p className="text-[15px] font-bold">문제를 만드는 중이에요</p>
        <p className="mt-0.5 text-[13px] text-muted">강의 내용을 보고 새로 만들어서 15~45초쯤 걸려요.</p>
      </div>
    </Card>
  )
}

function FolderBadge() {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-highlight-soft text-primary-deep" aria-hidden>
      <FolderIcon className="size-5" />
    </span>
  )
}

function StartButton({
  loading,
  disabled,
  onClick,
}: {
  loading: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button variant="primary" className="w-full" disabled={loading || disabled} onClick={onClick}>
      {loading ? '문제 만드는 중…' : '시작'}
    </Button>
  )
}

function ErrorText({ text }: { text: string }) {
  return (
    <p role="alert" className="text-center text-[14px] font-semibold text-danger">
      {text}
    </p>
  )
}
