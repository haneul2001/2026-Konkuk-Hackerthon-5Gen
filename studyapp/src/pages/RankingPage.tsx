import { useEffect, useState } from 'react'
import { Clock, Flame, Headphones, Layers, ListChecks, RotateCcw } from 'lucide-react'
import type { LeagueEntry, UserSummary } from '../../shared/types'
import { api } from '../api/client'
import { Card, ListSkeleton, PageTitle, Section } from '../components/ui'
import { Avatar } from '../components/Avatar'
import { cn } from '../lib/cn'

const xpWays = [
  { icon: ListChecks, label: '객관식·O/X 정답', when: '맞힌 문제마다' },
  { icon: Layers, label: '플래시카드 학습', when: '한 세트 끝까지 · 장당 1 XP' },
  { icon: Headphones, label: 'TTS 듣기', when: '5분마다' },
  { icon: Flame, label: '연속 학습일', when: '스트릭 보너스' },
  { icon: RotateCcw, label: '복습 완료', when: '알림 받은 날 끝내면' },
]

export function RankingPage() {
  const [league, setLeague] = useState<LeagueEntry[] | null>(null)
  const [me, setMe] = useState<UserSummary | null>(null)

  useEffect(() => {
    api.league().then(setLeague)
    api.me().then(setMe)
  }, [])

  const top = league?.slice(0, 3) ?? []

  return (
    <div className="space-y-7">
      <PageTitle
        title="주간 리그"
        sub={
          me && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-4" aria-hidden />
              월요일에 초기화 · {me.leagueSize}명 중 {me.leagueRank}위
            </span>
          )
        }
      />

      {/* 상위 3명 시상대. 순위는 숫자로도 표시해 색에만 의존하지 않는다. */}
      {top.length === 3 && (
        <div className="grid grid-cols-3 items-end gap-2.5">
          {[top[1], top[0], top[2]].map((e) => (
            <div key={e.rank} className="flex flex-col items-center">
              <Avatar id={e.avatar} className="size-14 border-2 border-line-strong" />
              <p className="mt-1.5 text-sm font-bold">{e.name}</p>
              <p className="text-xs text-muted tabular-nums">{e.xpThisWeek} XP</p>
              <div
                className={cn(
                  'mt-2 flex w-full items-start justify-center rounded-t-xl pt-2 text-xl font-extrabold tabular-nums',
                  e.rank === 1 && 'h-24 bg-highlight text-primary-deep',
                  e.rank === 2 && 'h-16 bg-line-strong text-ink',
                  e.rank === 3 && 'h-12 bg-accent-soft text-accent-ink',
                )}
              >
                {e.rank}
              </div>
            </div>
          ))}
        </div>
      )}

      <Section title="순위">
        {league === null ? (
          <ListSkeleton rows={5} />
        ) : (
          <Card>
            <ol className="divide-y-2 divide-line">
              {league.map((e) => (
                <li
                  key={e.rank}
                  aria-current={e.isMe ? 'true' : undefined}
                  className={cn(
                    'flex h-14 items-center gap-3 px-4 text-[15px]',
                    e.isMe && 'bg-primary-soft',
                  )}
                >
                  <span className="w-6 text-center font-bold tabular-nums text-muted">
                    {e.rank}
                  </span>
                  <Avatar id={e.avatar} className="size-9 border-2 border-line" />
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

      <Section title="XP 얻는 방법">
        <Card>
          <ul className="divide-y-2 divide-line">
            {xpWays.map(({ icon: Icon, label, when }) => (
              <li key={label} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span className="flex-1 text-[15px] font-semibold">{label}</span>
                <span className="text-[13px] text-muted">{when}</span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>
    </div>
  )
}
