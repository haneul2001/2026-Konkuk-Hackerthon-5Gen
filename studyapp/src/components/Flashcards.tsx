import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, X } from 'lucide-react'
import { api } from '../api/client'
import { randomQuote, type Quote } from '../lib/quotes'
import { useImmersive } from '../lib/immersive'
import { cn } from '../lib/cn'
import { Button, ButtonLink, CourseBadge, Sheet } from './ui'

// 플래시카드. 한 장씩: 앞면(질문) 탭 → 뒤집혀 정답 → 몰라요/알아요 → 다음 장.
// 글이 길면 카드 면 안에서 스크롤한다. 공부 명언은 다 넘긴 뒤 결과 화면에서만 나온다.
// 카드는 AI 서버의 큐카드(질문 → 정답·설명)를 쓰고, 없으면 개념 카드(설명 → 개념 이름)로 대신한다.
// 큐카드는 한 바퀴를 다 넘기면 알아요/몰라요를 서버에 저장해 다음에 몰라요 카드가 먼저 나온다.

export type Flash = {
  id: string
  label: string // 앞면 꼬리표 (Q. 질문 / Q. 이 설명에 맞는 개념은?)
  icon?: string
  front: string
  answer: string
  detail?: string // 뒷면 설명
  example?: string | null // AI가 덧붙인 예시 (강의 내용과 구분해서 보여준다)
  course: string
  lectureTitle: string
  studyCardId?: string // 큐카드면 결과를 서버에 저장한다
}

const SWAP_MS = 300

export function Flashcards({
  title,
  cards,
  quizTo,
  onQuit,
}: {
  title: string
  cards: Flash[]
  quizTo: string | null
  onQuit: () => void
}) {
  useImmersive(true)
  // 첫 덱은 받은 순서(큐카드는 다시 볼 카드가 앞), 다시 볼 때는 섞는다. "몰라요만 다시"는 그 카드들로 새 덱을 만든다.
  const [deck, setDeck] = useState(cards)
  const [round, setRound] = useState(0)
  const [quote, setQuote] = useState(() => randomQuote())
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const [unknown, setUnknown] = useState<Flash[]>([])
  const results = useRef<{ cardId: string; known: boolean }[]>([])
  const [confirmQuit, setConfirmQuit] = useState(false)

  const total = deck.length
  const done = index >= total
  const card = deck[index]

  const answer = useCallback(
    (known: boolean) => {
      if (phase !== 'idle' || done) return
      navigator.vibrate?.(30)
      if (!known) setUnknown((u) => [...u, card])
      // 큐카드 결과를 모았다가, 한 바퀴의 마지막 카드에서 서버에 저장한다 (라이트너 상자)
      const next = card.studyCardId ? [...results.current, { cardId: card.studyCardId, known }] : results.current
      if (index === total - 1) {
        if (next.length > 0) void api.reviewCards(next)
        results.current = []
      } else {
        results.current = next
      }
      setPhase('out')
      setTimeout(() => {
        setIndex((i) => i + 1)
        setFlipped(false)
        setPhase('in')
        setTimeout(() => setPhase('idle'), SWAP_MS)
      }, SWAP_MS)
    },
    [card, done, index, phase, total],
  )

  function restart(next: Flash[]) {
    setDeck(shuffle(next))
    setQuote((q) => randomQuote(q))
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
          quote={quote}
          total={total}
          unknown={unknown}
          quizTo={quizTo}
          onRetryUnknown={() => restart(unknown)}
          onRestart={() => restart(cards)}
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
                card={card}
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
  card,
  flipped,
  onFlip,
}: {
  card: Flash
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
      {/* 앞면: 설명(문제) */}
      <section
        aria-hidden={flipped}
        className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl border-2 border-line bg-surface px-6 pt-5 pb-4 shadow-[0_4px_0_var(--color-line)] backface-hidden"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary-soft px-3 py-1 text-[13px] font-bold text-primary">
            {card.label}
          </span>
          <CourseBadge course={card.course} className="ml-auto size-7" />
        </div>
        {/* 짧으면 가운데, 길면 이 안에서만 스크롤 */}
        <div className="no-scrollbar my-4 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="my-auto text-center">
            {card.icon && (
              <p className="mb-4 text-[44px] leading-none" aria-hidden>
                {card.icon}
              </p>
            )}
            <p className="text-[20px] leading-relaxed font-semibold text-pretty">{card.front}</p>
          </div>
        </div>
        <p className="text-center text-[13px] text-muted">카드를 눌러 정답 보기</p>
      </section>

      {/* 뒷면: 개념 이름 */}
      <section
        aria-hidden={!flipped}
        className="absolute inset-0 flex rotate-y-180 flex-col overflow-hidden rounded-3xl bg-primary px-6 py-6 text-white shadow-[0_4px_0_var(--color-primary-deep)] backface-hidden"
      >
        <span className="self-start rounded-full bg-white/20 px-3 py-1 text-[13px] font-bold">A. 정답</span>
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto text-center">
          <h2 className="text-[28px] leading-tight font-extrabold text-balance">{card.answer}</h2>
          <div className="my-5 h-1 w-12 shrink-0 rounded bg-highlight" />
          {card.detail && <p className="text-[16px] leading-relaxed text-pretty text-white/90">{card.detail}</p>}
          {card.example && (
            <p className="mt-3 rounded-xl bg-white/15 px-3 py-2 text-[14px] leading-snug text-pretty text-white/90">
              <b className="mr-1">AI 예시</b>
              {card.example}
            </p>
          )}
          <p className="mt-4 text-[14px] text-white/75">{card.lectureTitle} 강의</p>
        </div>
        <p className="text-center text-[13px] text-white/75">알았으면 '알아요', 헷갈리면 '몰라요'</p>
      </section>
    </div>
  )
}

// 결과 화면의 명언 카드: 16:9 사진 + 아래에 문구
function QuoteCard({ quote }: { quote: Quote }) {
  const [failed, setFailed] = useState(false)
  return (
    <figure className="overflow-hidden rounded-2xl border-2 border-line bg-surface shadow-[0_3px_0_var(--color-line)]">
      <div className="aspect-video bg-primary">
        {!failed && (
          <img
            src={quote.image}
            alt=""
            width={800}
            height={450}
            className="size-full object-cover"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      <figcaption className="px-4 py-3.5 text-left">
        <p className="text-[16px] leading-snug font-bold text-balance">“{quote.text}”</p>
        <p className="mt-1 text-[13px] font-semibold text-muted">— {quote.author}</p>
      </figcaption>
    </figure>
  )
}

function Finished({
  quote,
  total,
  unknown,
  quizTo,
  onRetryUnknown,
  onRestart,
  onQuit,
}: {
  quote: Quote
  total: number
  unknown: Flash[]
  quizTo: string | null
  onRetryUnknown: () => void
  onRestart: () => void
  onQuit: () => void
}) {
  const known = total - unknown.length
  return (
    <div className="flex flex-1 animate-[card-in_300ms_ease-out] flex-col gap-5 py-4 text-center">
      <div>
        <p className="text-[22px] font-bold">카드 {total}장을 다 봤어요</p>
        <p className="mt-1.5 text-[15px] text-muted">
          알아요 <b className="text-success tabular-nums">{known}</b> · 몰라요{' '}
          <b className="text-accent-ink tabular-nums">{unknown.length}</b>
          {unknown.length === 0 ? ' · 문제로 확인해 볼까요?' : ' · 헷갈린 카드만 한 번 더!'}
        </p>
      </div>
      <QuoteCard quote={quote} />
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
