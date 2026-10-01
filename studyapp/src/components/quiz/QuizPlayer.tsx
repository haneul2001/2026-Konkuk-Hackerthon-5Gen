import { useCallback, useEffect, useState } from 'react'
import { Check, Circle, X } from 'lucide-react'
import type { EssayQuestion, Quiz, QuizQuestion } from '../../../shared/types'
import { gradeEssay, XP_PER_CORRECT } from '../../../shared/quiz'
import { useImmersive } from '../../lib/immersive'
import { cn } from '../../lib/cn'
import { Button, Sheet, Tag } from '../ui'

// 문제 풀이 화면. 한 문제씩: 고르기 → 확인 → 정답/오답 피드백 → 다음.
// 상단 바·하단 탭은 숨기고(몰입), 닫기는 확인 시트를 거친다.

export type Answer = {
  questionId: string
  correct: boolean | null // 서술형은 null
  given: string
}

type Selection = number | boolean | string | null

const typeLabel = { multiple: '객관식', ox: 'O/X', essay: '서술형' } as const

export function QuizPlayer({
  quiz,
  onFinish,
  onQuit,
}: {
  quiz: Quiz
  onFinish: (answers: Answer[]) => void
  onQuit: () => void
}) {
  useImmersive(true)
  const [index, setIndex] = useState(0)
  const [selection, setSelection] = useState<Selection>(null)
  const [checked, setChecked] = useState(false)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [confirmQuit, setConfirmQuit] = useState(false)

  const q = quiz.questions[index]
  const total = quiz.questions.length
  const last = index === total - 1
  const answer = answers[index]

  const canCheck =
    selection !== null && (q.type !== 'essay' || (selection as string).trim().length > 0)

  const check = useCallback(() => {
    if (!canCheck || checked) return
    setAnswers((prev) => [...prev, grade(q, selection)])
    setChecked(true)
  }, [canCheck, checked, q, selection])

  const next = useCallback(() => {
    if (!checked) return
    if (last) {
      onFinish(answers)
      return
    }
    setIndex((i) => i + 1)
    setSelection(null)
    setChecked(false)
  }, [answers, checked, last, onFinish])

  // 키보드: 1~4 보기, O/X, Enter 확인·다음
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (confirmQuit) return
      const inText = (e.target as HTMLElement).tagName === 'TEXTAREA'
      if (e.key === 'Enter' && (!inText || e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        if (checked) next()
        else check()
        return
      }
      if (inText || checked) return
      if (q.type === 'multiple') {
        const n = Number(e.key)
        if (n >= 1 && n <= q.choices.length) setSelection(n - 1)
      } else if (q.type === 'ox') {
        if (e.key.toLowerCase() === 'o') setSelection(true)
        if (e.key.toLowerCase() === 'x') setSelection(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [check, checked, confirmQuit, next, q])

  const progress = (index + (checked ? 1 : 0)) / total

  return (
    <div className="flex flex-1 flex-col">
      {/* 상단: 닫기 + 진행 막대 */}
      <div className="flex h-14 shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="그만 풀기"
          onClick={() => setConfirmQuit(true)}
          className="-ml-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X className="size-6" aria-hidden />
        </button>
        <div
          role="progressbar"
          aria-label="진행"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={index + (checked ? 1 : 0)}
          className="h-3.5 flex-1 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-bright transition-[width] duration-300 ease-out"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="w-12 text-right text-sm font-bold tabular-nums text-muted">
          {index + 1}/{total}
        </span>
      </div>

      {/* 문제 */}
      <div className="pt-4 pb-6">
        <Tag tone="primary">{typeLabel[q.type]}</Tag>
        <h1 className="mt-3 text-[21px] leading-snug font-bold text-pretty">{q.prompt}</h1>

        <div className="mt-6">
          {q.type === 'multiple' && (
            <div role="radiogroup" aria-label="보기" className="space-y-2.5">
              {q.choices.map((c, i) => (
                <ChoiceButton
                  key={i}
                  label={c}
                  marker={String(i + 1)}
                  selected={selection === i}
                  state={!checked ? 'idle' : i === q.answerIndex ? 'right' : selection === i ? 'wrong' : 'dim'}
                  onClick={() => !checked && setSelection(i)}
                />
              ))}
            </div>
          )}

          {q.type === 'ox' && (
            <div role="radiogroup" aria-label="O 또는 X" className="grid grid-cols-2 gap-3">
              {[true, false].map((v) => (
                <OxButton
                  key={String(v)}
                  value={v}
                  selected={selection === v}
                  state={!checked ? 'idle' : v === q.answer ? 'right' : selection === v ? 'wrong' : 'dim'}
                  onClick={() => !checked && setSelection(v)}
                />
              ))}
            </div>
          )}

          {q.type === 'essay' && (
            <div>
              <label htmlFor="essay" className="sr-only">
                답안
              </label>
              <textarea
                id="essay"
                value={(selection as string) ?? ''}
                onChange={(e) => setSelection(e.target.value)}
                readOnly={checked}
                placeholder="핵심 개념을 넣어 2~3문장으로 써 보세요."
                className="min-h-44 w-full resize-none rounded-2xl border-2 border-line bg-surface p-4 text-base leading-relaxed placeholder:text-muted/70 focus:border-primary focus:outline-none read-only:bg-bg"
              />
              <p className="mt-1.5 text-right text-xs text-muted tabular-nums">
                {((selection as string) ?? '').length}자
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 하단: 확인 버튼 또는 피드백 */}
      <div className="sticky bottom-0 -mx-5 mt-auto">
        {!checked ? (
          <div className="bg-bg px-5 pt-3 pb-[max(env(safe-area-inset-bottom),20px)]">
            <Button variant="primary" className="w-full" disabled={!canCheck} onClick={check}>
              {q.type === 'essay' ? '제출' : '확인'}
            </Button>
          </div>
        ) : (
          <Feedback q={q} answer={answer} last={last} onNext={next} />
        )}
      </div>

      {confirmQuit && (
        <QuitSheet onStay={() => setConfirmQuit(false)} onQuit={onQuit} solved={answers.length} />
      )}
    </div>
  )
}

function grade(q: QuizQuestion, selection: Selection): Answer {
  if (q.type === 'multiple')
    return { questionId: q.id, correct: selection === q.answerIndex, given: q.choices[selection as number] }
  if (q.type === 'ox')
    return { questionId: q.id, correct: selection === q.answer, given: selection ? 'O' : 'X' }
  return { questionId: q.id, correct: null, given: selection as string }
}

type ChoiceState = 'idle' | 'right' | 'wrong' | 'dim'

const choiceStyles: Record<ChoiceState, { on: string; off: string }> = {
  idle: {
    on: 'border-primary bg-primary-soft shadow-[0_3px_0_var(--color-primary)]',
    off: 'border-line bg-surface shadow-[0_3px_0_var(--color-line)]',
  },
  right: {
    on: 'border-success bg-success-soft shadow-[0_3px_0_var(--color-success)]',
    off: 'border-success bg-success-soft shadow-[0_3px_0_var(--color-success)]',
  },
  wrong: {
    on: 'border-danger bg-danger-soft shadow-[0_3px_0_var(--color-danger)]',
    off: 'border-danger bg-danger-soft shadow-[0_3px_0_var(--color-danger)]',
  },
  dim: {
    on: 'border-line bg-surface opacity-60',
    off: 'border-line bg-surface opacity-60',
  },
}

function ChoiceButton({
  label,
  marker,
  selected,
  state,
  onClick,
}: {
  label: string
  marker: string
  selected: boolean
  state: ChoiceState
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      disabled={state !== 'idle'}
      className={cn(
        'press flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-semibold',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:active:translate-y-0',
        selected ? choiceStyles[state].on : choiceStyles[state].off,
      )}
    >
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-bold',
          state === 'right'
            ? 'border-success bg-success text-white'
            : state === 'wrong'
              ? 'border-danger bg-danger text-white'
              : selected
                ? 'border-primary bg-primary text-white'
                : 'border-line-strong text-muted',
        )}
        aria-hidden
      >
        {state === 'right' ? <Check className="size-4" strokeWidth={3} /> : state === 'wrong' ? <X className="size-4" strokeWidth={3} /> : marker}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  )
}

function OxButton({
  value,
  selected,
  state,
  onClick,
}: {
  value: boolean
  selected: boolean
  state: ChoiceState
  onClick: () => void
}) {
  const Icon = value ? Circle : X
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={value ? 'O, 맞다' : 'X, 틀리다'}
      onClick={onClick}
      disabled={state !== 'idle'}
      className={cn(
        'press flex h-36 cursor-pointer items-center justify-center rounded-3xl border-2',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-default disabled:active:translate-y-0',
        selected ? choiceStyles[state].on : choiceStyles[state].off,
      )}
    >
      <Icon
        className={cn(
          'size-16',
          state === 'right' ? 'text-success' : state === 'wrong' ? 'text-danger' : value ? 'text-primary' : 'text-accent',
        )}
        strokeWidth={3}
        aria-hidden
      />
    </button>
  )
}

function Feedback({
  q,
  answer,
  last,
  onNext,
}: {
  q: QuizQuestion
  answer: Answer
  last: boolean
  onNext: () => void
}) {
  const nextLabel = last ? '결과 보기' : '계속'

  if (q.type === 'essay') {
    const { matched, missing } = gradeEssay(q as EssayQuestion, answer.given)
    return (
      <div role="status" className="rounded-t-3xl border-t-2 border-line bg-surface px-5 pt-5 pb-[max(env(safe-area-inset-bottom),20px)]">
        <p className="text-[17px] font-bold">
          핵심어 {matched.length}/{matched.length + missing.length}개 포함
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {matched.map((k) => (
            <Tag key={k} tone="success">
              <Check className="mr-1 size-3.5" strokeWidth={3} aria-hidden />
              {k}
            </Tag>
          ))}
          {missing.map((k) => (
            <Tag key={k}>빠짐: {k}</Tag>
          ))}
        </div>
        <p className="mt-3 text-xs font-semibold text-muted">모범 답안</p>
        <p className="mt-1 max-h-28 overflow-y-auto text-[14px] leading-relaxed">{q.modelAnswer}</p>
        <p className="mt-2 text-xs text-muted">서술형은 XP에 반영되지 않아요. AI 피드백은 준비 중이에요.</p>
        <Button variant="primary" className="mt-4 w-full" onClick={onNext}>
          {nextLabel}
        </Button>
      </div>
    )
  }

  const right = answer.correct
  const correctText = q.type === 'multiple' ? q.choices[q.answerIndex] : q.answer ? 'O' : 'X'

  return (
    <div
      role="status"
      className={cn(
        'rounded-t-3xl px-5 pt-5 pb-[max(env(safe-area-inset-bottom),20px)]',
        right ? 'bg-success-soft' : 'bg-danger-soft',
      )}
    >
      <p
        className={cn(
          'flex items-center gap-2 text-[18px] font-extrabold',
          right ? 'text-success' : 'text-danger',
        )}
      >
        <span
          className={cn(
            'flex size-7 items-center justify-center rounded-full text-white',
            right ? 'bg-success' : 'bg-danger',
          )}
          aria-hidden
        >
          {right ? <Check className="size-4" strokeWidth={3} /> : <X className="size-4" strokeWidth={3} />}
        </span>
        {right ? `정답이에요! +${XP_PER_CORRECT} XP` : '아쉬워요'}
      </p>
      {!right && (
        <p className="mt-2 text-[14px] font-semibold text-danger">정답: {correctText}</p>
      )}
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink">{q.explanation}</p>
      <Button variant={right ? 'primary' : 'danger'} className="mt-4 w-full" onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  )
}

function QuitSheet({
  onStay,
  onQuit,
  solved,
}: {
  onStay: () => void
  onQuit: () => void
  solved: number
}) {
  return (
    <Sheet title="여기서 그만할까요?" onClose={onStay}>
      <p className="-mt-2 text-[15px] text-muted">
        {solved > 0 ? `지금까지 푼 ${solved}문제는 저장되지 않아요.` : '아직 푼 문제가 없어요.'}
      </p>
      <div className="mt-5 space-y-2.5">
        <Button variant="primary" className="w-full" onClick={onStay} autoFocus>
          계속 풀기
        </Button>
        <Button className="w-full" onClick={onQuit}>
          그만하기
        </Button>
      </div>
    </Sheet>
  )
}
