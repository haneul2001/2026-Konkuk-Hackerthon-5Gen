import { BookOpen, Check, ExternalLink, RotateCcw, X } from 'lucide-react'
import type { Quiz, QuizSubmitResult, StudyResource } from '../../../shared/types'
import { LIBRARY_NAME } from '../../lib/names'
import { cn } from '../../lib/cn'
import { Mascot } from '../Mascot'
import { Button, ButtonLink, Card } from '../ui'
import type { Answer } from './QuizPlayer'

// 결과 화면: 마스코트 한마디 + 점수·XP + 틀린 문제 다시 보기.
// 틀린 문제에는 AI 서버가 붙여 준 그 개념의 공부 자료 링크를 "이 개념 다시 공부하기"로 보여준다.

export function QuizResult({
  quiz,
  answers,
  result,
  onRetryWrong,
}: {
  quiz: Quiz
  answers: Answer[]
  result: QuizSubmitResult | null // 전송 중이면 null
  onRetryWrong: () => void
}) {
  const graded = answers.filter((a) => a.correct !== null)
  const correct = graded.filter((a) => a.correct).length
  const essayCount = answers.length - graded.length
  const rate = graded.length ? Math.round((correct / graded.length) * 100) : null
  const wrong = answers.filter((a) => a.correct === false)

  const line =
    rate === null
      ? '서술형 답안을 모범 답안과 비교해 봤어. 빠진 핵심어를 다시 짚어보자!'
      : rate === 100
        ? '전부 맞혔어! 이 강의는 거의 다 외웠네.'
        : rate >= 70
          ? '잘했어! 틀린 것만 한 번 더 보면 완벽해.'
          : '괜찮아, 틀린 문제는 내일 복습에 넣어둘게.'

  return (
    <div className="space-y-6 pb-4">
      <div className="flex flex-col items-center pt-2 text-center">
        <Mascot
          mood={rate === null ? 'glad' : rate === 100 ? 'joyful' : rate >= 70 ? 'happy' : rate >= 40 ? 'glad' : 'upset'}
          className="w-36"
        />
        <p className="mt-3 text-sm font-semibold text-muted">{quiz.title}</p>
        <h1 className="mt-1 text-[24px] leading-snug font-bold text-balance">{line}</h1>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <ResultStat label="정답" value={graded.length ? `${correct}/${graded.length}` : '—'} />
        <ResultStat label="정확도" value={rate === null ? '—' : `${rate}%`} />
        <ResultStat
          label="획득 XP"
          value={result ? `+${result.xpGained}` : '…'}
          highlight
        />
      </div>

      {result && (
        <p className="text-center text-[13px] text-muted tabular-nums">
          누적 {result.xpTotal.toLocaleString()} XP · 주간 리그 {result.leagueRank}위
          {essayCount > 0 && ` · 서술형 ${essayCount}문제는 XP 제외`}
        </p>
      )}

      {wrong.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[17px] font-bold">틀린 문제 {wrong.length}개</h2>
          <Card>
            <ul className="divide-y-2 divide-line">
              {wrong.map((a, i) => {
                const q = quiz.questions.find((x) => x.id === a.questionId)!
                // 같은 개념을 여러 문제에서 틀렸으면 자료는 처음 한 번만
                const firstOfConcept =
                  wrong.findIndex((w) => quiz.questions.find((x) => x.id === w.questionId)?.conceptId === q.conceptId) === i
                const right =
                  q.type === 'multiple' ? q.choices[q.answerIndex] : q.type === 'ox' ? (q.answer ? 'O' : 'X') : ''
                return (
                  <li key={a.questionId} className="px-4 py-3.5">
                    <p className="text-[15px] leading-snug font-semibold">{q.prompt}</p>
                    <p className="mt-2 flex items-start gap-1.5 text-[13px] text-danger">
                      <X className="mt-0.5 size-3.5 shrink-0" strokeWidth={3} aria-hidden />
                      <span>내 답: {a.given}</span>
                    </p>
                    <p className="mt-1 flex items-start gap-1.5 text-[13px] font-semibold text-success">
                      <Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={3} aria-hidden />
                      <span>정답: {right}</span>
                    </p>
                    {firstOfConcept && (q.resources?.length ?? 0) > 0 && <Resources items={q.resources!} />}
                  </li>
                )
              })}
            </ul>
          </Card>
          <p className="text-[13px] text-muted">틀린 문제는 홈의 오늘 복습에 들어가요.</p>
        </section>
      )}

      <div className="space-y-2.5">
        {wrong.length > 0 && (
          <Button variant="primary" className="w-full" onClick={onRetryWrong}>
            <RotateCcw className="size-5" aria-hidden />
            틀린 문제만 다시 풀기
          </Button>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <ButtonLink to="/library?tab=concepts" aria-label={`${LIBRARY_NAME}에서 개념 보기`}>
            개념 보기
          </ButtonLink>
          <ButtonLink to="/" variant={wrong.length ? 'secondary' : 'primary'}>
            홈으로
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}

function Resources({ items }: { items: StudyResource[] }) {
  return (
    <div className="mt-3 rounded-xl bg-bg px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-muted">
        <BookOpen className="size-4" aria-hidden />이 개념 다시 공부하기
      </p>
      <ul className="mt-1.5 space-y-1">
        {items.slice(0, 3).map((r) => (
          <li key={r.url}>
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-10 items-center gap-2 rounded-lg py-1 text-[14px] active:bg-line/60"
            >
              <span className="min-w-0 flex-1">
                <span className="line-clamp-1 font-semibold text-ink underline-offset-2 hover:underline">{r.title}</span>
                <span className="block truncate text-[12px] text-muted">
                  {r.kind === 'wikipedia' ? '위키백과' : r.source}
                </span>
              </span>
              <ExternalLink className="size-4 shrink-0 text-muted" aria-hidden />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ResultStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={cn('px-3 py-3 text-center', highlight && 'border-primary bg-primary-soft shadow-[0_3px_0_var(--color-primary)]')}>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted">{label}</p>
    </Card>
  )
}
