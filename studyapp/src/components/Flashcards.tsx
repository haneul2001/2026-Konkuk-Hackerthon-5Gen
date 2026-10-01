import { useCallback, useEffect, useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import type { Concept } from '../../shared/types'
import { quoteCycle, type Quote } from '../lib/quotes'
import { useImmersive } from '../lib/immersive'
import { cn } from '../lib/cn'
import { Button, ButtonLink, CourseBadge, Sheet } from './ui'

// 큐카드(플래시카드). 한 장씩: 앞면(설명) 탭 → 뒤집혀 개념 이름 → 몰라요/알아요 → 다음 장.
// 앞면 위 1/3은 공부 명언 그림. 글이 길면 카드 면 안에서 스크롤한다.

const SWAP_MS = 300

export function Flashcards({
  title,
  concepts,
  quizTo,
  onQuit,
}: {
  title: string
  concepts: Concept[]
  quizTo: string | null
  onQuit: () => void
}) {
  useImmersive(true)
  // 덱 순서는 시작할 때마다 섞는다. "몰라요만 다시"는 그 카드들로 새 덱을 만든다.
  const [deck, setDeck] = useState(() => shuffle(concepts))
  const [round, setRound] = useState(0)
  const [quotes, setQuotes] = useState(() => quoteCycle(concepts.length))
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const [unknown, setUnknown] = useState<Concept[]>([])
  const [confirmQuit, setConfirmQuit] = useState(false)

  const total = deck.length
  const done = index >= total
  const card = deck[index]

  const answer = useCallback(
    (known: boolean) => {
      if (phase !== 'idle' || done) return
      navigator.vibrate?.(30)
      if (!known) setUnknown((u) => [...u, card])
      setPhase('out')
      setTimeout(() => {
        setIndex((i) => i + 1)
        setFlipped(false)
        setPhase('in')
        setTimeout(() => setPhase('idle'), SWAP_MS)
      }, SWAP_MS)
    },
    [card, done, phase],
  )

  function restart(next: Concept[]) {
    setDeck(shuffle(next))
    setQuotes(quoteCycle(next.length))
    setRound((r) => r + 1)
    setIndex(0)
    setFlipped(false)
    setUnknown([])
    setPhase('in')
    setTimeout(() => setPhase('idle'), SWAP_MS)
  }

  // 키보드: Space 뒤집기, ← 몰라요, → 알아요
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (confirmQuit || done) return
      if (e.key === ' ') {
        e.preventDefault()
        setFlipped((f) => !f)
      } else if (e.key === 'ArrowLeft') answer(false)
      else if (e.key === 'ArrowRight') answer(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [answer, confirmQuit, done])

  const seen = Math.min(index, total)

  return (
    <div className="flex min-h-0 flex-1 flex-col pb-[max(env(safe-area-inset-bottom),16px)]">
      {/* 상단: 닫기 + 진행 막대 */}
      <div className="flex h-14 shrink-0 items-center gap-2">
        <button
          type="button"
          aria-label="그만 보기"
          onClick={() => (done ? onQuit() : setConfirmQuit(true))}
          className="-ml-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X className="size-6" aria-hidden />
        </button>
        <div
          role="progressbar"
          aria-label="진행"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={seen}
          className="h-3.5 flex-1 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-bright transition-[width] duration-300 ease-out"
            style={{ width: `${(seen / total) * 100}%` }}
          />
        </div>
        <span className="w-12 text-right text-sm font-bold tabular-nums text-muted">
          {Math.min(index + 1, total)}/{total}
        </span>
      </div>
      <p className="truncate text-[13px] font-semibold text-muted">{title}</p>

      {done ? (
        <Finished
          total={total}
          unknown={unknown}
          quizTo={quizTo}
          onRetryUnknown={() => restart(unknown)}
          onRestart={() => restart(concepts)}
          onQuit={onQuit}
        />
      ) : (
        <>
          <div className="min-h-0 flex-1 py-4 perspective-[1200px]">
            <div
              key={`${round}-${index}`}
              className={cn(
                phase === 'out' && 'animate-[card-out_300ms_ease-in_forwards]',
                phase === 'in' && 'animate-[card-in_300ms_ease-out]',
                'size-full',
              )}
            >
              <FlipCard
                concept={card}
                quote={quotes[index]}
                flipped={flipped}
                onFlip={() => phase === 'idle' && setFlipped((f) => !f)}
              />
            </div>
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-3">
            <Button className="h-16 text-[16px]" onClick={() => answer(false)}>
              <X className="size-6" strokeWidth={2.5} aria-hidden />
              몰라요
            </Button>
            <Button variant="primary" className="h-16 text-[16px]" onClick={() => answer(true)}>
              <Check className="size-6" strokeWidth={2.5} aria-hidden />
              알아요
            </Button>
          </div>
        </>
      )}

      {confirmQuit && (
        <Sheet title="그만 볼까요?" onClose={() => setConfirmQuit(false)}>
          <p className="text-[15px] text-muted">지금까지 넘긴 카드는 저장되지 않아요.</p>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Button onClick={() => setConfirmQuit(false)}>계속 보기</Button>
            <Button variant="danger" onClick={onQuit}>
              그만 보기
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

function FlipCard({
  concept,
  quote,
  flipped,
  onFlip,
}: {
  concept: Concept
  quote: Quote
  flipped: boolean
  onFlip: () => void
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? '설명 다시 보기' : '카드 뒤집어 정답 보기'}
      onClick={onFlip}
      onKeyDown={(e) => e.key === 'Enter' && onFlip()}
      className={cn(
        'relative size-full cursor-pointer transition-transform duration-500 ease-out transform-3d',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
        flipped && 'rotate-y-180',
      )}
    >
      {/* 앞면: 명언 그림 1/3 + 설명(문제) */}
      <section
        aria-hidden={flipped}
        className="absolute inset-0 grid grid-rows-[1fr_2fr] overflow-hidden rounded-3xl border-2 border-line bg-surface shadow-[0_4px_0_var(--color-line)] backface-hidden"
      >
        <QuoteArt quote={quote} />
        <div className="flex min-h-0 flex-col px-5 pt-4 pb-3">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary-soft px-3 py-1 text-[13px] font-bold text-primary">
              Q. 이 설명에 맞는 개념은?
            </span>
            <CourseBadge course={concept.course} className="ml-auto size-7" />
          </div>
          {/* 글이 길면 이 안에서만 스크롤 */}
          <div className="no-scrollbar mt-3 min-h-0 flex-1 overflow-y-auto">
            <p className="text-[18px] leading-relaxed font-semibold text-pretty">{concept.summary}</p>
          </div>
          <p className="pt-2 text-center text-[13px] text-muted">카드를 눌러 정답 보기</p>
        </div>
      </section>

      {/* 뒷면: 개념 이름 */}
      <section
        aria-hidden={!flipped}
        className="absolute inset-0 flex rotate-y-180 flex-col overflow-hidden rounded-3xl bg-primary px-6 py-6 text-white shadow-[0_4px_0_var(--color-primary-deep)] backface-hidden"
      >
        <span className="self-start rounded-full bg-white/20 px-3 py-1 text-[13px] font-bold">A. 정답</span>
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto text-center">
          <h2 className="text-[30px] leading-tight font-extrabold text-balance">{concept.term}</h2>
          <div className="my-5 h-1 w-12 rounded bg-highlight" />
          <p className="text-[15px] text-white/85">{concept.lectureTitle} 강의</p>
        </div>
        <p className="text-center text-[13px] text-white/75">알았으면 '알아요', 헷갈리면 '몰라요'</p>
      </section>
    </div>
  )
}

function QuoteArt({ quote }: { quote: Quote }) {
  const [failed, setFailed] = useState(false)
  return (
    <figure className="relative min-h-0 overflow-hidden bg-primary">
      {!failed && (
        <img
          src={quote.image}
          alt=""
          className="absolute inset-0 size-full object-cover"
          onError={() => setFailed(true)}
        />
      )}
      <figcaption className="absolute inset-x-0 bottom-0 bg-ink/60 px-4 py-2.5 text-white">
        <p className="text-[15px] leading-snug font-bold text-balance">“{quote.text}”</p>
        <p className="mt-0.5 text-[12px] font-semibold text-white/80">— {quote.author}</p>
      </figcaption>
    </figure>
  )
}

function Finished({
  total,
  unknown,
  quizTo,
  onRetryUnknown,
  onRestart,
  onQuit,
}: {
  total: number
  unknown: Concept[]
  quizTo: string | null
  onRetryUnknown: () => void
  onRestart: () => void
  onQuit: () => void
}) {
  const known = total - unknown.length
  return (
    <div className="flex flex-1 animate-[card-in_300ms_ease-out] flex-col justify-center gap-6 py-6 text-center">
      <div>
        <p className="text-[24px] font-bold">카드 {total}장을 다 봤어요</p>
        <p className="mt-2 text-[15px] text-muted">
          {unknown.length === 0 ? '전부 알고 있어요. 문제로 확인해 볼까요?' : '헷갈린 카드만 한 번 더 보면 좋아요.'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border-2 border-line bg-surface py-4">
          <p className="text-[13px] font-semibold text-muted">알아요</p>
          <p className="mt-1 text-[26px] font-extrabold text-success tabular-nums">{known}</p>
        </div>
        <div className="rounded-2xl border-2 border-line bg-surface py-4">
          <p className="text-[13px] font-semibold text-muted">몰라요</p>
          <p className="mt-1 text-[26px] font-extrabold text-accent-ink tabular-nums">{unknown.length}</p>
        </div>
      </div>
      <div className="space-y-2.5">
        {unknown.length > 0 && (
          <Button variant="primary" className="w-full" onClick={onRetryUnknown}>
            <RotateCcw className="size-5" aria-hidden />
            몰라요 {unknown.length}장만 다시
          </Button>
        )}
        {quizTo && (
          <ButtonLink to={quizTo} variant={unknown.length ? 'secondary' : 'primary'} className="w-full">
            퀴즈 풀기
          </ButtonLink>
        )}
        <Button className="w-full" onClick={onRestart}>
          처음부터 다시
        </Button>
        <button
          type="button"
          onClick={onQuit}
          className="h-11 w-full cursor-pointer text-[15px] font-semibold text-muted"
        >
          나가기
        </button>
      </div>
    </div>
  )
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
