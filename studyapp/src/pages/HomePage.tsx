import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Mic, Trophy, Upload, Zap } from 'lucide-react'
import type {
  BoardPost,
  Mood,
  LeagueEntry,
  Lecture,
  ReviewItem,
  UserSummary,
} from '../../shared/types'
import { api } from '../api/client'
import {
  ButtonLink,
  Card,
  EmptyState,
  ListSkeleton,
  Row,
  Section,
  Tag,
} from '../components/ui'
import { LIBRARY_NAME } from '../lib/names'
import { Mascot } from '../components/Mascot'
import { Avatar } from '../components/Avatar'
import { currentStreak, daysSinceStudy, moodOf, solvedToday } from '../../shared/mood'
import { mascotLine, pickLineIndex } from '../lib/mascotLines'
import { cn } from '../lib/cn'

export function HomePage() {
  const [me, setMe] = useState<UserSummary | null>(null)
  const [reviews, setReviews] = useState<ReviewItem[] | null>(null)
  const [lectures, setLectures] = useState<Lecture[] | null>(null)
  const [league, setLeague] = useState<LeagueEntry[] | null>(null)
  const [posts, setPosts] = useState<BoardPost[] | null>(null)
  // 홈에 들어올 때마다 말풍선 문장을 새로 뽑는다
  const [lineIndex] = useState(pickLineIndex)

  useEffect(() => {
    api.me().then(setMe)
    api.todayReviews().then(setReviews)
    api.lectures().then(setLectures)
    api.league().then(setLeague)
    api.posts('study').then(setPosts)
  }, [])

  const questionTotal = reviews?.reduce((n, r) => n + r.questionCount, 0) ?? 0

  return (
    <div className="space-y-7">
      {/* 인사 */}
      <div>
        <p className="text-sm font-medium text-muted">{formatToday()}</p>
        <h1 className="mt-1 text-[26px] leading-tight font-bold text-balance">
          {me ? `${me.name}님, 오늘도 조금만 해봐요` : '불러오는 중'}
        </h1>
      </div>

      {/* 마스코트: 연속 기록·쉰 날에 따라 표정과 말이 바뀐다 */}
      <MascotSpeech
        mood={me ? moodOf(me) : 'normal'}
        text={
          me && reviews
            ? mascotLine(moodOf(me), lineIndex, {
                days: daysSinceStudy(me),
                streak: currentStreak(me),
                goal: me.dailyGoal,
                reviewCount: questionTotal,
              })
            : '오늘 공부할 걸 챙겨오는 중이야…'
        }
        footer={me && <GoalBar me={me} />}
      />

      {/* 오늘 숫자 */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat
          icon={<Flame className="size-5 text-accent" fill="currentColor" aria-hidden />}
          label="연속 학습"
          value={me ? `${currentStreak(me)}일` : '—'}
        />
        <Stat
          icon={<Zap className="size-5 text-primary" fill="currentColor" aria-hidden />}
          label="이번 주 XP"
          value={me ? me.xpThisWeek.toLocaleString() : '—'}
        />
        <Stat
          icon={<Trophy className="size-5 text-amber-500" fill="currentColor" aria-hidden />}
          label="리그 순위"
          value={me ? `${me.leagueRank}위` : '—'}
        />
      </div>

      {/* 오늘 복습: 화면에서 가장 큰 행동 하나 */}
      {reviews === null ? (
        <ListSkeleton rows={2} />
      ) : reviews.length === 0 ? (
        <EmptyState
          message="오늘 복습할 문제가 없어요. 새 강의를 녹음하면 내일부터 복습이 시작돼요."
          action={{ label: '강의 녹음하기', to: '/record' }}
        />
      ) : (
        <section
          aria-labelledby="today-review"
          className="rounded-3xl bg-primary p-5 text-white shadow-[0_5px_0_var(--color-primary-deep)]"
        >
          <p className="text-sm font-bold text-highlight">오늘 복습</p>
          <h2 id="today-review" className="mt-1 text-[22px] font-bold">
            {reviews.length}개 강의 · {questionTotal}문제
          </h2>
          <ul className="mt-4 space-y-2">
            {reviews.map((r) => (
              <li key={r.id}>
                <Link
                  to={`/quiz?review=${r.id}`}
                  className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl bg-white/12 px-3.5 py-2.5 active:bg-white/20 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{r.lectureTitle}</p>
                    <p className="mt-0.5 text-[13px] text-primary-soft">
                      {r.reason === 'wrong' ? '틀린 문제 다시 풀기' : '잊기 전에 다시 보기'}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {r.questionCount}문제
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <ButtonLink
            to={`/quiz?review=${reviews[0].id}`}
            variant="inverse"
            className="mt-4 w-full"
          >
            복습 시작
          </ButtonLink>
        </section>
      )}

      {/* 새로 시작 */}
      <div className="grid grid-cols-2 gap-2.5">
        <QuickTile
          to="/record"
          icon={<Mic className="size-5" aria-hidden />}
          title="강의 녹음"
          note="지금 바로"
        />
        <QuickTile
          to="/record?mode=upload"
          icon={<Upload className="size-5" aria-hidden />}
          title="파일 올리기"
          note="긴 강의는 이쪽"
        />
      </div>

      {/* 최근 강의 */}
      <Section title="최근 강의" action={{ label: LIBRARY_NAME, to: '/library?tab=recordings' }}>
        {lectures === null ? (
          <ListSkeleton rows={3} />
        ) : lectures.length === 0 ? (
          <EmptyState
            message="아직 녹음한 강의가 없어요."
            action={{ label: '첫 강의 녹음하기', to: '/record' }}
          />
        ) : (
          <Card>
            <ul className="divide-y-2 divide-line">
              {lectures.slice(0, 3).map((l) => (
                <li key={l.id}>
                  <Row
                    to={`/lectures/${l.id}`}
                    title={l.title}
                    meta={`${l.durationMin}분 녹음`}
                    trailing={
                      l.status === 'processing' ? (
                        <Tag tone="accent">요약 중</Tag>
                      ) : l.status === 'failed' ? (
                        <Tag tone="danger">처리 실패</Tag>
                      ) : (
                        <span className="shrink-0 text-[13px] tabular-nums text-muted">
                          카드 {l.cardCount}
                        </span>
                      )
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      {/* 주간 리그 */}
      <Section title="주간 리그" action={{ label: '전체 순위', to: '/ranking' }}>
        {league === null || me === null ? (
          <ListSkeleton rows={3} />
        ) : (
          <Card>
            <p className="border-b-2 border-line px-4 py-2.5 text-[13px] text-muted">
              {me.leagueSize}명 중 <b className="text-ink">{me.leagueRank}위</b> · 월요일에 초기화
            </p>
            <ol>
              {league.map((e) => (
                <li
                  key={e.rank}
                  aria-current={e.isMe ? 'true' : undefined}
                  className={cn(
                    'flex h-12 items-center gap-3 px-4 text-[15px]',
                    e.isMe && 'bg-primary-soft',
                  )}
                >
                  <span
                    className={cn(
                      'w-6 text-center font-bold tabular-nums',
                      e.rank <= 3 ? 'text-accent-ink' : 'text-muted',
                    )}
                  >
                    {e.rank}
                  </span>
                  <span className={cn('flex-1', e.isMe && 'font-bold')}>
                    {e.name}
                    {e.isMe && <span className="ml-1.5 text-[13px] text-primary">나</span>}
                  </span>
                  <span className="font-semibold tabular-nums">{e.xpThisWeek} XP</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </Section>

      {/* 스터디 모집 */}
      <Section title="스터디 모집" action={{ label: '더 보기', to: '/board?board=study' }}>
        {posts === null || me === null ? (
          <ListSkeleton rows={2} />
        ) : posts.length === 0 ? (
          <p className="rounded-2xl border-2 border-line bg-surface px-4 py-6 text-center text-[14px] text-muted">
            아직 모집 중인 스터디가 없어요.
          </p>
        ) : (
          <Card>
            <ul className="divide-y-2 divide-line">
              {posts.slice(0, 3).map((p) => {
                const s = p.study!
                const eligible = me.xpTotal >= s.minXp
                const full = s.joined >= s.capacity
                return (
                  <li key={p.id}>
                    <Row
                      to={`/board?post=${p.id}`}
                      leading={<Avatar id={p.avatar ?? ''} className="size-11 border-2 border-line" />}
                      title={p.title}
                      meta={
                        <span className="tabular-nums">
                          {s.joined}/{s.capacity}명 · XP {s.minXp.toLocaleString()} 이상
                        </span>
                      }
                      trailing={
                        full ? (
                          <Tag>마감</Tag>
                        ) : eligible ? (
                          <Tag tone="success">참여 가능</Tag>
                        ) : (
                          <Tag>XP 부족</Tag>
                        )
                      }
                    />
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </Section>
    </div>
  )
}

// 말풍선은 글 길이만큼 늘어난다. 짧으면 소 옆에, 길면(헬쑥함 장문 등) 소 아래에 가로로 넓게.
function MascotSpeech({ mood, text, footer }: { mood: Mood; text: string; footer?: React.ReactNode }) {
  const long = text.length > 70
  return (
    <div className={cn('flex gap-2', long ? 'flex-col items-center gap-3' : 'items-center')}>
      <Mascot mood={mood} className={cn('shrink-0', long ? 'w-32' : 'w-34')} />
      <div className="relative w-full flex-1 rounded-2xl border-2 border-line bg-surface px-4 py-3.5 shadow-[0_3px_0_var(--color-line)]">
        {/* 말풍선 꼬리: 옆이면 왼쪽, 아래면 위쪽 */}
        <span
          aria-hidden
          className={cn(
            'absolute size-4 rotate-45 border-line bg-surface',
            long
              ? '-top-[9px] left-1/2 -translate-x-1/2 border-t-2 border-l-2'
              : 'top-1/2 -left-[9px] -translate-y-1/2 border-b-2 border-l-2',
          )}
        />
        <p
          className={cn(
            'relative font-semibold text-pretty whitespace-pre-line',
            long ? 'text-[15px] leading-relaxed' : 'text-[15px] leading-snug',
          )}
          aria-live="polite"
        >
          {text}
        </p>
        {footer}
      </div>
    </div>
  )
}

// 말풍선 아래 오늘 목표 진행
function GoalBar({ me }: { me: UserSummary }) {
  const solved = solvedToday(me)
  const ratio = Math.min(1, solved / Math.max(1, me.dailyGoal))
  return (
    <div className="relative mt-2.5 flex items-center gap-2">
      <div
        role="progressbar"
        aria-label="오늘 목표"
        aria-valuemin={0}
        aria-valuemax={me.dailyGoal}
        aria-valuenow={Math.min(solved, me.dailyGoal)}
        className="h-2 flex-1 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-bright" style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="text-xs font-semibold text-muted tabular-nums">
        {Math.min(solved, me.dailyGoal)}/{me.dailyGoal}
      </span>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="px-3 py-3">
      {icon}
      <p className="mt-2 text-xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium text-muted">{label}</p>
    </Card>
  )
}

function QuickTile({
  to,
  icon,
  title,
  note,
}: {
  to: string
  icon: React.ReactNode
  title: string
  note: string
}) {
  return (
    <Link
      to={to}
      className="press block cursor-pointer rounded-2xl border-2 border-line bg-surface p-4 shadow-[0_3px_0_var(--color-line)] active:shadow-[0_1px_0_var(--color-line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
        {icon}
      </span>
      <p className="mt-3 text-[15px] font-bold">{title}</p>
      <p className="mt-0.5 text-[13px] text-muted">{note}</p>
    </Link>
  )
}

function formatToday() {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())
}
