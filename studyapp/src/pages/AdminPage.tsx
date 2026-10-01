import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, Plus, RefreshCw, Send } from 'lucide-react'
import type { Mood, Notice, Report, UserSummary } from '../../shared/types'
import { presetFor, type StudyRecordInput } from '../../shared/admin'
import { currentStreak, daysSinceStudy, MOODS, moodInfo, moodOf, solvedToday } from '../../shared/mood'
import { absenceNotice, sampleNotice } from '../../shared/notices'
import { api } from '../api/client'
import { Mascot } from '../components/Mascot'
import { Button, Card, ListSkeleton, PageTitle, Section, Segmented, Tag } from '../components/ui'
import { cn } from '../lib/cn'
import { useNotify } from '../lib/notify'
import { timeAgo } from '../lib/time'

// 관리자(개발용). 학습 기록을 바꿔서 마스코트 기분이 제대로 바뀌는지, 알림 배너가 어떻게 보이는지 확인한다.
// TODO: 출시 전에 관리자 인증을 붙이거나 화면을 뺀다.

const dayOptions = [
  ['0', '오늘'],
  ['1', '어제'],
  ['2', '2일'],
  ['4', '4일'],
  ['8', '8일'],
  ['31', '31일'],
] as const

const noticeKinds: { kind: Notice['kind'] | 'furious' | 'gaunt'; label: string }[] = [
  { kind: 'review', label: '복습 알림' },
  { kind: 'streak', label: '연속 기록 위험' },
  { kind: 'angry', label: '3일 쉼' },
  { kind: 'furious', label: '7일 쉼' },
  { kind: 'gaunt', label: '30일 쉼' },
  { kind: 'goal', label: '목표 달성' },
  { kind: 'summary', label: '요약 완료' },
  { kind: 'study', label: '스터디 참여 가능' },
]

export function AdminPage() {
  const [me, setMe] = useState<UserSummary | null>(null)
  const notify = useNotify()

  useEffect(() => {
    api.me().then((m) => setMe({ ...m }))
  }, [])

  async function apply(input: StudyRecordInput) {
    const updated = await api.setStudyRecord(input)
    setMe({ ...updated })
  }

  if (!me) return <ListSkeleton rows={3} />

  const mood = moodOf(me)
  const days = daysSinceStudy(me)
  const solved = solvedToday(me)

  return (
    <div className="space-y-7">
      <PageTitle
        title="관리자"
        sub={
          <span className="inline-flex items-center gap-2">
            <Tag tone="accent">개발용</Tag>
            출시 전에 막아야 하는 화면이에요.
          </span>
        }
      />

      {/* 지금 상태 */}
      <Card className="flex items-center gap-4 p-4">
        <Mascot mood={mood} className="w-24 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-muted">지금 기분</p>
          <p className="text-[20px] font-bold">{moodInfo[mood].label}</p>
          <p className="mt-1 text-[13px] text-muted tabular-nums">
            마지막 공부 {days === 0 ? '오늘' : `${days}일 전`} · 오늘 {solved}/{me.dailyGoal}문제 · 연속{' '}
            {currentStreak(me)}일
          </p>
        </div>
      </Card>

      {/* 기분 바로 바꾸기 */}
      <Section title="기분 바로 바꾸기">
        <div className="grid grid-cols-3 gap-2.5">
          {MOODS.map((m) => (
            <MoodTile
              key={m}
              mood={m}
              active={m === mood}
              onClick={() => apply(presetFor(m))}
            />
          ))}
        </div>
        <p className="text-[13px] text-pretty text-muted">
          누르면 그 기분이 나오도록 학습 기록을 바꿔요. 홈에 가면 바뀐 소가 보여요.
        </p>
      </Section>

      {/* 학습 기록 직접 조정 */}
      <Section title="학습 기록 직접 조정">
        <Card className="space-y-5 p-4">
          <div>
            <p className="mb-2 text-sm font-semibold">마지막으로 공부한 날 (며칠 전)</p>
            <Segmented
              label="마지막으로 공부한 날"
              value={String(
                dayOptions.some(([v]) => Number(v) === days)
                  ? days
                  : days >= 30 ? 31 : days >= 7 ? 8 : days >= 3 ? 4 : days,
              )}
              options={dayOptions}
              onChange={(v) => apply({ daysAgo: Number(v), todaySolved: Number(v) === 0 ? Math.max(1, solved) : 0 })}
            />
          </div>
          <Stepper
            label="연속 학습일"
            value={me.streakDays}
            min={0}
            max={60}
            disabled={days >= 2}
            hint={
              days >= 2
                ? '하루 이상 빠지면 연속 기록이 끊겨서 0일로 보여요.'
                : '0~6일 평범 · 7일 조금 기쁨 · 8~29일 매우 기쁨 · 30일 이상 매우매우 기쁨'
            }
            onChange={(n) => apply({ daysAgo: days, todaySolved: solved, streakDays: n })}
          />
          <Stepper
            label="오늘 푼 문제"
            value={solved}
            min={0}
            max={me.dailyGoal + 10}
            disabled={days !== 0}
            hint={days !== 0 ? '마지막 공부가 "오늘"일 때만 바꿀 수 있어요.' : undefined}
            onChange={(n) => apply({ daysAgo: 0, todaySolved: n })}
          />
          <Stepper
            label="하루 목표"
            value={me.dailyGoal}
            min={1}
            max={50}
            onChange={(n) => apply({ daysAgo: days, todaySolved: solved, dailyGoal: n })}
          />
        </Card>
      </Section>

      {/* 알림 */}
      <Section title="알림 배너 시험 발송">
        <div className="grid grid-cols-2 gap-2.5">
          {noticeKinds.map(({ kind, label }) => (
            <Button
              key={kind}
              className="px-3 text-[14px]"
              onClick={() =>
                notify(
                  kind === 'furious' || kind === 'gaunt'
                    ? { ...absenceNotice(kind === 'gaunt' ? 31 : 8), id: `sample_${kind}_${Date.now()}` }
                    : sampleNotice(kind),
                )
              }
            >
              {label}
            </Button>
          ))}
        </div>
        <Button
          variant="primary"
          className="w-full"
          onClick={() =>
            api.notifications().then((list) => {
              const stamp = Date.now()
              if (list.length === 0) {
                notify({ id: `none_${stamp}`, kind: 'goal', title: '지금은 보낼 알림이 없어요', body: '복습도 끝났고 기록도 괜찮아요.' })
              }
              list.forEach((n) => notify({ ...n, id: `${n.id}_${stamp}` }))
            })
          }
        >
          <Send className="size-5" aria-hidden />
          지금 상태로 알림 확인
        </Button>
        <p className="text-[13px] text-pretty text-muted">
          앱을 열 때 이 규칙으로 알림을 만들어 배너로 띄워요. 여러 개면 하나씩 차례로 보여요.
        </p>
      </Section>

      <Reports />
    </div>
  )
}

// 게시판 글·댓글 신고 내역. 화면에 들어올 때와 '새로고침'을 누를 때 불러온다.
function Reports() {
  const [reports, setReports] = useState<Report[] | null>(null)
  const load = () => api.reports().then(setReports)
  useEffect(() => {
    load()
  }, [])

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold">
          신고 내역 {reports && reports.length > 0 && <span className="text-danger tabular-nums">{reports.length}</span>}
        </h2>
        <button
          type="button"
          onClick={load}
          className="-mr-2 inline-flex h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          <RefreshCw className="size-4" aria-hidden />
          새로고침
        </button>
      </div>
      {reports === null ? (
        <ListSkeleton rows={1} />
      ) : reports.length === 0 ? (
        <p className="rounded-2xl border-2 border-line bg-surface px-4 py-6 text-center text-[14px] text-muted">
          들어온 신고가 없어요. 게시판 글이나 댓글의 ⋮ → 신고로 넣어 볼 수 있어요.
        </p>
      ) : (
        <Card>
          <ul className="divide-y-2 divide-line">
            {reports.map((r) => (
              <li key={r.id} className="space-y-1.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Tag>{r.kind === 'post' ? '게시글' : '댓글'}</Tag>
                    <Tag tone="danger">{r.reason}</Tag>
                  </span>
                  <span className="text-[12px] text-muted">{timeAgo(r.createdAt)}</span>
                </div>
                <p className="line-clamp-3 text-[15px] leading-snug">
                  <b>{r.author}</b> {r.body}
                </p>
                <Link
                  to={`/board?post=${r.postId}`}
                  className="block truncate text-[13px] font-medium text-primary underline-offset-2 hover:underline"
                >
                  글: {r.postTitle}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}

function MoodTile({ mood, active, onClick }: { mood: Mood; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'press flex cursor-pointer flex-col items-center rounded-2xl border-2 bg-surface px-1.5 pt-2.5 pb-2 text-center',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        active
          ? 'border-primary bg-primary-soft shadow-[0_3px_0_var(--color-primary)]'
          : 'border-line shadow-[0_3px_0_var(--color-line)]',
      )}
    >
      <Mascot mood={mood} still className="w-16" />
      <span className="mt-1.5 text-[13px] font-bold">{moodInfo[mood].label}</span>
      <span className="text-[11px] leading-tight text-muted">{moodInfo[mood].rule}</span>
    </button>
  )
}

function Stepper({
  label,
  value,
  min,
  max,
  disabled,
  hint,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  disabled?: boolean
  hint?: string
  onChange: (n: number) => void
}) {
  const btn =
    'flex size-11 cursor-pointer items-center justify-center rounded-xl border-2 border-line-strong bg-surface disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary'
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{label}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`${label} 줄이기`}
            className={btn}
            disabled={disabled || value <= min}
            onClick={() => onChange(value - 1)}
          >
            <Minus className="size-4" strokeWidth={3} aria-hidden />
          </button>
          <span className="w-8 text-center text-lg font-bold tabular-nums" aria-live="polite">
            {value}
          </span>
          <button
            type="button"
            aria-label={`${label} 늘리기`}
            className={btn}
            disabled={disabled || value >= max}
            onClick={() => onChange(value + 1)}
          >
            <Plus className="size-4" strokeWidth={3} aria-hidden />
          </button>
        </div>
      </div>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  )
}
