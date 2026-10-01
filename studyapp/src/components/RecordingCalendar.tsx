import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, MoveRight, Plus, Upload } from 'lucide-react'
import type { Lecture } from '../../shared/types'
import { localDate } from '../../shared/mock'
import { api, ApiError } from '../api/client'
import { cn } from '../lib/cn'
import { Button, Card, CourseBadge, Row, Sheet, Tag } from './ui'

// 학습 탭 캘린더: 녹음을 녹음한 날 칸에 보여준다.
// 칸마다 '+'를 누르면 그 날짜로 새 녹음을 올리거나, 이미 올린 녹음을 그 날로 옮긴다(녹음한 날 수정).
// 녹음이 있는 날을 누르면 아래에 그 날 녹음 목록이 나온다.

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

export function RecordingCalendar({
  lectures,
  onMoved,
}: {
  lectures: Lecture[]
  onMoved: (updated: Lecture) => void
}) {
  const today = localDate()
  const [month, setMonth] = useState(today.slice(0, 7)) // YYYY-MM
  const [selected, setSelected] = useState<string | null>(today)
  const [adding, setAdding] = useState<string | null>(null) // '+'를 누른 날

  const byDate = new Map<string, Lecture[]>()
  for (const l of lectures) byDate.set(l.recordedAt, [...(byDate.get(l.recordedAt) ?? []), l])

  const [y, m] = month.split('-').map(Number)
  const firstDay = new Date(y, m - 1, 1).getDay()
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells: (string | null)[] = [
    ...Array<null>(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ]
  while (cells.length % 7) cells.push(null)

  function shift(delta: number) {
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    setSelected(null)
  }

  const monthCount = lectures.filter((l) => l.recordedAt.startsWith(month)).length
  const dayLectures = selected ? (byDate.get(selected) ?? []) : []

  return (
    <div className="space-y-4">
      <Card className="p-3">
        {/* 달 이동 */}
        <div className="flex items-center justify-between px-1 pb-2">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => shift(-1)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
          <div className="text-center">
            <p className="text-[17px] font-bold tabular-nums">
              {y}년 {m}월
            </p>
            <p className="text-[12px] text-muted tabular-nums">녹음 {monthCount}개</p>
          </div>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => shift(1)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronRight className="size-5" aria-hidden />
          </button>
        </div>

        {/* 요일 */}
        <div className="grid grid-cols-7 text-center text-[12px] font-semibold text-muted">
          {WEEK.map((w, i) => (
            <span key={w} className={cn('py-1', i === 0 && 'text-danger', i === 6 && 'text-primary')}>
              {w}
            </span>
          ))}
        </div>

        {/* 날짜 칸 */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <span key={`e${i}`} />
            const count = byDate.get(date)?.length ?? 0
            const isToday = date === today
            const isSelected = date === selected
            const future = date > today
            const day = Number(date.slice(8))
            return (
              <div
                key={date}
                className={cn(
                  'relative flex aspect-square flex-col rounded-xl border-2',
                  isSelected ? 'border-primary bg-primary-soft' : 'border-transparent',
                  count > 0 && !isSelected && 'bg-bg',
                )}
              >
                {/* 칸 전체: 그 날 보기 */}
                <button
                  type="button"
                  aria-label={`${m}월 ${day}일, 녹음 ${count}개`}
                  aria-pressed={isSelected}
                  onClick={() => setSelected(date)}
                  className="flex flex-1 cursor-pointer flex-col items-center pt-1 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums',
                      isToday && 'bg-primary text-white',
                      !isToday && future && 'text-muted/60',
                      !isToday && i % 7 === 0 && !future && 'text-danger',
                    )}
                  >
                    {day}
                  </span>
                  {count > 0 && (
                    <span className="mt-0.5 rounded-full bg-bright px-1.5 text-[11px] leading-4 font-bold text-white tabular-nums">
                      {count}
                    </span>
                  )}
                </button>
                {/* '+': 이 날에 녹음 넣기 (미래 날짜는 없음) */}
                {!future && (
                  <button
                    type="button"
                    aria-label={`${m}월 ${day}일에 녹음 넣기`}
                    onClick={() => setAdding(date)}
                    className="absolute right-0 bottom-0 flex size-6 cursor-pointer items-center justify-center rounded-full text-primary/70 active:bg-primary/15 focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <Plus className="size-3.5" strokeWidth={3} aria-hidden />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Card>

      {/* 고른 날의 녹음 */}
      {selected && (
        <section className="space-y-2.5" aria-live="polite">
          <div className="flex items-center justify-between">
            <h3 className="text-[16px] font-bold">
              {Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일 녹음
            </h3>
            {selected <= today && (
              <button
                type="button"
                onClick={() => setAdding(selected)}
                className="-mr-2 flex h-10 cursor-pointer items-center gap-1 rounded-lg px-2 text-[14px] font-bold text-primary active:bg-line/60"
              >
                <Plus className="size-4" strokeWidth={2.5} aria-hidden />
                녹음 넣기
              </button>
            )}
          </div>
          {dayLectures.length === 0 ? (
            <p className="rounded-2xl border-2 border-line bg-surface px-4 py-6 text-center text-[14px] text-muted">
              이 날은 녹음이 없어요.
            </p>
          ) : (
            <Card>
              <ul className="divide-y-2 divide-line">
                {dayLectures.map((l) => (
                  <li key={l.id}>
                    <Row
                      to={`/lectures/${l.id}`}
                      leading={<CourseBadge course={l.course} />}
                      title={l.title}
                      meta={<span className="tabular-nums">{l.durationMin}분 녹음</span>}
                      trailing={l.status === 'processing' ? <Tag tone="accent">요약 중</Tag> : null}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {adding && (
        <AddToDateSheet
          date={adding}
          lectures={lectures}
          onClose={() => setAdding(null)}
          onMoved={(updated) => {
            onMoved(updated)
            setSelected(adding)
            setAdding(null)
          }}
        />
      )}
    </div>
  )
}

// '+' 창: 새로 올리기 / 이미 올린 녹음을 이 날로 옮기기
function AddToDateSheet({
  date,
  lectures,
  onClose,
  onMoved,
}: {
  date: string
  lectures: Lecture[]
  onClose: () => void
  onMoved: (updated: Lecture) => void
}) {
  const navigate = useNavigate()
  const [mode, setMode] = useState<'choose' | 'move'>('choose')
  const [picked, setPicked] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const label = `${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일`
  const others = lectures.filter((l) => l.recordedAt !== date).sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))

  if (mode === 'choose') {
    return (
      <Sheet title={`${label}에 녹음 넣기`} onClose={onClose}>
        <div className="space-y-2.5">
          <ChoiceButton
            icon={Upload}
            title="새로 올리기"
            note="녹음 파일을 올리면 이 날짜로 저장돼요"
            onClick={() => navigate(`/record?mode=upload&date=${date}`)}
          />
          <ChoiceButton
            icon={MoveRight}
            title="이미 올린 녹음 옮기기"
            note={others.length ? '녹음한 날을 이 날짜로 바꿔요' : '옮길 녹음이 없어요'}
            disabled={others.length === 0}
            onClick={() => setMode('move')}
          />
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={`${label}로 옮길 녹음`} onClose={onClose}>
      <div role="radiogroup" aria-label="옮길 녹음" className="max-h-[45dvh] space-y-2 overflow-y-auto">
        {others.map((l) => (
          <label
            key={l.id}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-3',
              picked === l.id ? 'border-primary bg-primary-soft' : 'border-line bg-surface',
            )}
          >
            <input
              type="radio"
              name="move-lecture"
              checked={picked === l.id}
              onChange={() => setPicked(l.id)}
              className="size-4 cursor-pointer accent-primary"
            />
            <CourseBadge course={l.course} className="size-8" />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-bold">{l.title}</span>
              <span className="block text-[12px] text-muted tabular-nums">지금 날짜 {l.recordedAt}</span>
            </span>
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[14px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Button onClick={() => setMode('choose')}>뒤로</Button>
        <Button
          variant="primary"
          disabled={!picked || busy}
          onClick={async () => {
            if (!picked) return
            setBusy(true)
            setError('')
            try {
              const updated = await api.updateLecture(picked, { recordedAt: date })
              if (updated) onMoved(updated)
              else setError('옮기지 못했어요. 서버가 켜져 있는지 확인해 주세요.')
            } catch (e) {
              setError(e instanceof ApiError ? e.message : '옮기지 못했어요.')
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? '옮기는 중…' : '이 날로 옮기기'}
        </Button>
      </div>
    </Sheet>
  )
}

function ChoiceButton({
  icon: Icon,
  title,
  note,
  disabled,
  onClick,
}: {
  icon: typeof Upload
  title: string
  note: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="press flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-line bg-surface px-4 py-3.5 text-left shadow-[0_3px_0_var(--color-line)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold">{title}</span>
        <span className="block text-[13px] text-muted">{note}</span>
      </span>
      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
    </button>
  )
}
