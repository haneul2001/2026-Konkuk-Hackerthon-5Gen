import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, ChevronRight, Flame, LogOut, Minus, Pencil, Plus, ShieldBan, Trophy, Zap } from 'lucide-react'
import type { BoardPost, UserSummary } from '../../shared/types'
import { GOAL_MAX, GOAL_MIN } from '../../shared/profile'
import { currentStreak, moodInfo, moodOf, solvedToday } from '../../shared/mood'
import { api } from '../api/client'
import { Mascot } from '../components/Mascot'
import { Button, Card, Field, ListSkeleton, Row, Section, Sheet, Tag } from '../components/ui'
import { cn } from '../lib/cn'
import { timeAgo } from '../lib/time'
import { clearToken } from '../lib/auth'

// 프로필: 내 학습 기록 한눈에 보기, 이름·하루 목표 바꾸기, 내 활동(글·스터디), 차단 관리.
// 오른쪽 위 동그란 이름 버튼으로 들어온다.

const GOAL_STEP = 5

export function ProfilePage() {
  const [me, setMe] = useState<UserSummary | null>(null)
  const [posts, setPosts] = useState<BoardPost[] | null>(null)
  const [blocked, setBlocked] = useState<number | null>(null)
  const [renaming, setRenaming] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.me().then((m) => setMe({ ...m }))
    api.posts().then(setPosts)
    api.blocks().then((b) => setBlocked(b.count))
  }, [])

  async function save(patch: { name?: string; dailyGoal?: number }) {
    const r = await api.updateProfile(patch)
    if ('error' in r) return r.error
    setMe({ ...r })
    return null
  }

  if (!me) return <ListSkeleton rows={4} />

  const mood = moodOf(me)
  const streak = currentStreak(me)
  const solved = solvedToday(me)
  const goalRate = Math.min(1, solved / me.dailyGoal)
  const myPosts = (posts ?? []).filter((p) => p.mine)
  const joined = (posts ?? []).filter((p) => p.study?.joinedByMe)

  return (
    <div className="space-y-7">
      {/* 머리: 소 + 이름 */}
      <div className="flex items-center gap-4">
        <Mascot mood={mood} className="w-24 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h1 className="truncate text-[24px] leading-tight font-bold">{me.name}</h1>
            <button
              type="button"
              aria-label="이름 바꾸기"
              onClick={() => setRenaming(true)}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          </div>
          <p className="mt-1 text-[14px] text-muted">소 기분: {moodInfo[mood].label}</p>
          {streak > 0 && (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[13px] font-bold text-accent-ink">
              <Flame className="size-4" aria-hidden />
              {streak}일 연속 학습
            </p>
          )}
        </div>
      </div>

      {/* 숫자 네 칸 */}
      <div className="grid grid-cols-2 gap-2.5">
        <Stat icon={Zap} label="누적 XP" value={me.xpTotal.toLocaleString()} />
        <Stat icon={Zap} label="이번 주 XP" value={me.xpThisWeek.toLocaleString()} />
        <Stat icon={Trophy} label="리그 순위" value={`${me.leagueRank}위`} note={`${me.leagueSize}명 중`} />
        <Stat icon={Flame} label="연속 학습" value={`${streak}일`} />
      </div>

      {/* 하루 목표 */}
      <Section title="하루 목표">
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <p className="text-[15px] font-semibold">하루에 풀 문제 수</p>
            <div className="flex items-center gap-2">
              <StepButton
                label="목표 줄이기"
                icon={Minus}
                disabled={me.dailyGoal <= GOAL_MIN}
                onClick={() => save({ dailyGoal: Math.max(GOAL_MIN, me.dailyGoal - GOAL_STEP) })}
              />
              <span className="w-14 text-center text-[18px] font-bold tabular-nums">{me.dailyGoal}문제</span>
              <StepButton
                label="목표 늘리기"
                icon={Plus}
                disabled={me.dailyGoal >= GOAL_MAX}
                onClick={() => save({ dailyGoal: Math.min(GOAL_MAX, me.dailyGoal + GOAL_STEP) })}
              />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="font-semibold">오늘</span>
              <span className="text-muted tabular-nums">
                {solved} / {me.dailyGoal}문제
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="오늘 목표 달성률"
              aria-valuemin={0}
              aria-valuemax={me.dailyGoal}
              aria-valuenow={solved}
              className="mt-1.5 h-3 overflow-hidden rounded-full bg-line"
            >
              <div
                className={cn('h-full rounded-full', goalRate >= 1 ? 'bg-success' : 'bg-bright')}
                style={{ width: `${goalRate * 100}%` }}
              />
            </div>
          </div>
        </Card>
      </Section>

      {/* 내 활동 */}
      <Section title="내가 쓴 글">
        {posts === null ? (
          <ListSkeleton rows={1} />
        ) : myPosts.length === 0 ? (
          <p className="rounded-2xl border-2 border-line bg-surface px-4 py-6 text-center text-[14px] text-muted">
            아직 쓴 글이 없어요.
          </p>
        ) : (
          <Card>
            <ul className="divide-y-2 divide-line">
              {myPosts.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Row
                    to={`/board?post=${p.id}`}
                    title={p.title}
                    meta={`${timeAgo(p.createdAt)} · 공감 ${p.likes} · 댓글 ${p.commentCount}`}
                    trailing={<ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      {joined.length > 0 && (
        <Section title="참여한 스터디">
          <Card>
            <ul className="divide-y-2 divide-line">
              {joined.map((p) => (
                <li key={p.id}>
                  <Row
                    to={`/board?post=${p.id}`}
                    title={p.title}
                    meta={`${p.study!.course} · ${p.study!.joined}/${p.study!.capacity}명`}
                    trailing={<Tag tone="primary">참여 중</Tag>}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      )}

      {/* 설정 */}
      <Section title="설정">
        <Card>
          <ul className="divide-y-2 divide-line">
            <li className="flex min-h-16 items-center gap-3 px-4 py-3">
              <ShieldBan className="size-5 shrink-0 text-muted" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold">차단한 사용자</p>
                <p className="text-[13px] text-muted tabular-nums">{blocked ?? 0}명 · 글과 댓글이 안 보여요</p>
              </div>
              <Button
                className="h-9 px-3 text-[13px]"
                disabled={!blocked}
                onClick={async () => setBlocked((await api.unblockAll()).count)}
              >
                모두 해제
              </Button>
            </li>
            <li className="flex min-h-16 items-center gap-3 px-4 py-3 text-muted">
              <Bell className="size-5 shrink-0" aria-hidden />
              <p className="flex-1 text-[15px] font-semibold">알림 설정</p>
              <Tag>준비 중</Tag>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  clearToken()
                  navigate('/login', { replace: true })
                }}
                className="flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left active:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
              >
                <LogOut className="size-5 shrink-0 text-muted" aria-hidden />
                <span className="flex-1">
                  <span className="block text-[15px] font-semibold">로그아웃</span>
                  <span className="block text-[13px] text-muted">@{me.login}</span>
                </span>
              </button>
            </li>
          </ul>
        </Card>
      </Section>

      {renaming && (
        <RenameSheet current={me.name} onClose={() => setRenaming(false)} onSave={(name) => save({ name })} />
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value, note }: { icon: typeof Zap; label: string; value: string; note?: string }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
        <Icon className="size-4" aria-hidden />
        {label}
      </p>
      <p className="mt-1 text-[22px] font-extrabold tabular-nums">
        {value}
        {note && <span className="ml-1.5 text-[13px] font-semibold text-muted">{note}</span>}
      </p>
    </Card>
  )
}

function StepButton({
  label,
  icon: Icon,
  disabled,
  onClick,
}: {
  label: string
  icon: typeof Plus
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-10 cursor-pointer items-center justify-center rounded-xl border-2 border-line-strong bg-surface active:bg-bg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-primary"
    >
      <Icon className="size-5" strokeWidth={2.5} aria-hidden />
    </button>
  )
}

function RenameSheet({
  current,
  onClose,
  onSave,
}: {
  current: string
  onClose: () => void
  onSave: (name: string) => Promise<string | null> // 실패하면 이유
}) {
  const [name, setName] = useState(current)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const changed = name.trim() && name.trim() !== current
  return (
    <Sheet title="이름 바꾸기" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!changed || busy) return
          setBusy(true)
          const err = await onSave(name)
          setBusy(false)
          if (err) setError(err)
          else onClose()
        }}
        className="space-y-4"
      >
        <Field
          label="이름"
          id="profile-name"
          value={name}
          maxLength={10}
          autoFocus
          hint="게시판에서 익명을 끄면 이 이름이 보여요. 랭킹에도 나와요."
          onChange={(e) => setName(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-[14px] font-semibold text-danger">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" disabled={!changed || busy}>
            저장
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
