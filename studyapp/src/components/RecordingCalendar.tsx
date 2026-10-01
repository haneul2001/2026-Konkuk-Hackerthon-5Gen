import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, MoveRight, Plus, Upload } from 'lucide-react'
import type { Lecture } from '../../shared/types'
import { localDate } from '../../shared/mock'
import { api, ApiError } from '../api/client'
import { cn } from '../lib/cn'
import { HOLIDAYS } from '../lib/holidays'
import { courseTone } from '../lib/courseTone'
import { Button, Card, Row, Sheet, Tag } from './ui'

// 학습 탭 캘린더: 휴대폰 달력처럼 칸 안에 그날 녹음 제목을 과목 색 띠로 보여준다.
// 제목이 길면 줄을 넘기고, 그 주(한 줄) 칸이 알아서 커진다. 공휴일은 빨간 날짜와 띠로.
// 날짜를 누르면 테두리로 고르고, 달력 아래에 그날 녹음 목록과 '녹음 넣기'가 나온다.

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function RecordingCalendar({
  lectures,
  onMoved,
}: {
  lectures: Lecture[]
  onMoved: (updated: Lecture) => void
}) {
  const today = localDate()
  const [month, setMonth] = useState(today.slice(0, 7)) // YYYY-MM
  const [selected, setSelected] = useState<string>(today)
  const [adding, setAdding] = useState<string | null>(null) // '녹음 넣기'를 누른 날

  const byDate = new Map<string, Lecture[]>()
  for (const l of lectures) byDate.set(l.recordedAt, [...(byDate.get(l.recordedAt) ?? []), l])

  const [y, m] = month.split('-').map(Number)
  // 첫 주의 일요일부터 마지막 주의 토요일까지 (앞뒤 달 날짜는 흐리게)
  const first = new Date(y, m - 1, 1)
  const last = new Date(y, m, 0)
  const days: string[] = []
  for (let d = new Date(y, m - 1, 1 - first.getDay()); days.length < 42; d.setDate(d.getDate() + 1)) {
    days.push(ymd(d))
    if (days.length % 7 === 0 && d >= last) break
  }
  const weeks = Array.from({ length: days.length / 7 }, (_, w) => days.slice(w * 7, w * 7 + 7))

  function shift(delta: number) {
    setMonth(ymd(new Date(y, m - 1 + delta, 1)).slice(0, 7))
  }
  function pick(date: string) {
    setSelected(date)
    if (!date.startsWith(month)) setMonth(date.slice(0, 7)) // 앞뒤 달 날짜를 누르면 그 달로
  }

  const dayLectures = byDate.get(selected) ?? []
  const sameYear = y === Number(today.slice(0, 4))

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden pb-1">
        {/* 머리: 이전 달 · 10월 · 다음 달 · 오늘 */}
        <div className="flex items-center gap-1 px-2 pt-2 pb-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => shift(-1)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
          <p className="min-w-16 text-center text-[18px] font-bold tabular-nums">
            {!sameYear && `${y}년 `}
            {m}월
          </p>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => shift(1)}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
          >
            <ChevronRight className="size-6" aria-hidden />
          </button>
          {/* 오늘로: 오늘 날짜가 적힌 네모 */}
          <button
            type="button"
            aria-label="오늘로 가기"
            onClick={() => pick(today)}
            className="mr-1 ml-auto flex size-8 cursor-pointer items-center justify-center rounded-lg border-2 border-ink text-[13px] font-bold tabular-nums active:bg-line/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {Number(today.slice(8))}
          </button>
        </div>

        {/* 요일 */}
        <div className="grid grid-cols-7 border-b-2 border-line text-center text-[13px] font-semibold">
          {WEEK.map((w, i) => (
            <span key={w} className={cn('py-1.5', i === 0 ? 'text-danger' : i === 6 ? 'text-saturday' : 'text-muted')}>
              {w}
            </span>
          ))}
        </div>

        {/* 주마다 한 줄. 칸 높이는 그 주에서 가장 긴 칸에 맞춰진다 */}
        {weeks.map((week) => (
          <div key={week[0]} className="grid grid-cols-7 border-b-2 border-line last:border-b-0">
            {week.map((date, i) => {
              const inMonth = date.startsWith(month)
              const holiday = HOLIDAYS[date]
              const isToday = date === today
              const isSelected = date === selected
              const list = byDate.get(date) ?? []
              const day = Number(date.slice(8))
              return (
                <button
                  key={date}
                  type="button"
                  aria-label={`${Number(date.slice(5, 7))}월 ${day}일${holiday ? ` ${holiday}` : ''}, 녹음 ${list.length}개`}
                  aria-pressed={isSelected}
                  onClick={() => pick(date)}
                  className={cn(
                    'flex min-h-20 min-w-0 cursor-pointer flex-col items-stretch gap-0.5 rounded-xl border-2 px-0.5 pt-1 pb-1.5 text-left',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                    isSelected ? 'border-muted/50' : 'border-transparent',
                    !inMonth && 'opacity-40',
                  )}
                >
                  <span
                    className={cn(
                      'mx-auto flex size-6 shrink-0 items-center justify-center rounded-md text-[14px] font-semibold tabular-nums',
                      isToday
                        ? 'bg-ink text-white'
                        : i === 0 || holiday
                          ? 'text-danger'
                          : i === 6
                            ? 'text-saturday'
                            : 'text-ink',
                    )}
                  >
                    {day}
                  </span>
                  {holiday && (
                    <span className="rounded bg-danger-soft px-1 py-0.5 text-[11px] leading-tight font-semibold break-all text-danger">
                      {holiday}
                    </span>
                  )}
                  {list.map((l) => (
                    <span
                      key={l.id}
                      className={cn(
                        'rounded px-1 py-0.5 text-[11px] leading-tight font-semibold break-all',
                        courseTone(l.course),
                      )}
                    >
                      {l.title}
                    </span>
                  ))}
                </button>
              )
            })}
          </div>
        ))}
      </Card>

      {/* 고른 날의 녹음 */}
      <section className="space-y-2.5" aria-live="polite">
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold">
            {Number(selected.slice(5, 7))}월 {Number(selected.slice(8))}일
            {HOLIDAYS[selected] && (
              <span className="ml-1.5 text-[13px] font-semibold text-danger">{HOLIDAYS[selected]}</span>
            )}
          </h3>
          {selected <= today && (
            <button
              type="button"
              onClick={() => setAdding(selected)}
              className="-mr-2 flex h-10 cursor-pointer items-center gap-1 rounded-lg px-2 text-[14px] font-bold text-muted active:bg-line/60"
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

// '녹음 넣기' 창: 새로 올리기 / 이미 올린 녹음을 이 날로 옮기기
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
              picked === l.id ? 'border-highlight-deep bg-highlight-soft' : 'border-line bg-surface',
            )}
          >
            <input
              type="radio"
              name="move-lecture"
              checked={picked === l.id}
              onChange={() => setPicked(l.id)}
              className="size-4 cursor-pointer accent-highlight-deep"
            />
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
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-highlight-soft text-primary-deep">
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
