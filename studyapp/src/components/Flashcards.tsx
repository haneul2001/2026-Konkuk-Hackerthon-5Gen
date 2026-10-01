import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, RotateCcw, Sparkles, X, Zap } from 'lucide-react'
import type { FlashCard } from '../../shared/types'
import { randomQuote, type Quote } from '../lib/quotes'
import { useImmersive } from '../lib/immersive'
import { cn } from '../lib/cn'
import { Button, ButtonLink, Sheet } from './ui'

// 플래시카드. 한 장씩: 앞면(질문) 탭 → 뒤집혀 답·설명 → 몰라요/알아요 → 다음 장.
// 카드는 두 가지다.
//  - AI 카드(녹음 하나): 질문 → 정답 + 강의 설명 + AI 예시(강의 내용과 구분해서 표시)
//  - 개념 카드(개념 폴더·과목): 개념 설명 → 개념 이름. 볼 때마다 순서를 섞는다.
// 첫 세트를 끝까지 넘기면 onFirstPass로 결과를 넘기고 받은 XP를 보여준다(몰라요만 다시·처음부터 다시는 XP 없음).
// 글이 길면 카드 면 안에서 스크롤한다. 공부 명언은 다 넘긴 뒤 결과 화면에서만 나온다.

const SWAP_MS = 300

export type CardResult = { cardId: string; known: boolean }

export function Flashcards({
  title,
  cards,
  shuffled = false,
  quizTo,
  onFirstPass,
  onQuit,
}: {
  title: string
  cards: FlashCard[]
  shuffled?: boolean // true면 볼 때마다 섞는다. AI 세트는 서버가 정한 순서(다시 볼 카드 먼저)를 지킨다
  quizTo: string | null
  onFirstPass: (results: CardResult[]) => Promise<number> // 받은 XP
  onQuit: () => void
}) {
  useImmersive(true)
  const order = useCallback((list: FlashCard[]) => (shuffled ? shuffle(list) : list), [shuffled])
  const [deck, setDeck] = useState(() => order(cards))
  const [round, setRound] = useState(0)
  const [quote, setQuote] = useState(() => randomQuote())
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle')
  const [results, setResults] = useState<CardResult[]>([])
  const [xp, setXp] = useState<number | null>(null) // 첫 세트로 받은 XP
  const [confirmQuit, setConfirmQuit] = useState(false)
  const reported = useRef(false)

  const total = deck.length
  const done = index >= total
  const card = deck[index]
  const unknown = deck.filter((c) => results.some((r) => r.cardId === c.id && !r.known))

  // 첫 세트를 끝까지 넘겼으면 한 번만 결과를 보낸다
  useEffect(() => {
    if (!done || round !== 0 || reported.current) return
    reported.current = true
    onFirstPass(results).then(setXp)
  }, [done, round, results, onFirstPass])

  const answer = useCallback(
    (known: boolean) => {
      if (phase !== 'idle' || done) return
      navigator.vibrate?.(30)
      setResults((r) => [...r, { cardId: card.id, known }])
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

  function restart(next: FlashCard[]) {
    setDeck(order(next))
    setQuote((q) => randomQuote(q))
    setRound((r) => r + 1)
    setIndex(0)
    setFlipped(false)
    setResults([])
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
          xp={round === 0 ? xp : null}
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
              <FlipCard card={card} flipped={flipped} onFlip={() => phase === 'idle' && setFlipped((f) => !f)} />
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
          <p className="text-[15px] text-muted">끝까지 넘겨야 XP를 받아요. 지금까지 넘긴 카드는 저장되지 않아요.</p>
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

function FlipCard({ card, flipped, onFlip }: { card: FlashCard; flipped: boolean; onFlip: () => void }) {
  const isConcept = card.kind === 'concept'
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={flipped ? '질문 다시 보기' : '카드 뒤집어 정답 보기'}
      onClick={onFlip}
      onKeyDown={(e) => e.key === 'Enter' && onFlip()}
      className={cn(
        'relative size-full cursor-pointer transition-transform duration-500 ease-out transform-3d',
        'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
        flipped && 'rotate-y-180',
      )}
    >
      {/* 앞면: 질문 */}
      <section
        aria-hidden={flipped}
        className="absolute inset-0 flex flex-col overflow-hidden rounded-3xl border-2 border-line bg-surface px-6 pt-5 pb-4 shadow-[0_4px_0_var(--color-line)] backface-hidden"
      >
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary-soft px-3 py-1 text-[13px] font-bold text-primary">
            {isConcept ? 'Q. 이 설명에 맞는 개념은?' : 'Q.'}
          </span>
          {card.icon && (
            <span className="ml-auto text-[28px] leading-none" aria-hidden>
              {card.icon}
            </span>
          )}
        </div>
        {/* 짧으면 가운데, 길면 이 안에서만 스크롤 */}
        <div className="no-scrollbar my-4 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <p className="my-auto text-center text-[20px] leading-relaxed font-semibold whitespace-pre-line text-pretty">
            {card.front}
          </p>
        </div>
        <p className="text-center text-[13px] text-muted">카드를 눌러 정답 보기</p>
      </section>

      {/* 뒷면: 정답 · 설명 · AI 예시 */}
      <section
        aria-hidden={!flipped}
        className="absolute inset-0 flex rotate-y-180 flex-col overflow-hidden rounded-3xl bg-primary px-6 py-5 text-white shadow-[0_4px_0_var(--color-primary-deep)] backface-hidden"
      >
        <span className="self-start rounded-full bg-white/20 px-3 py-1 text-[13px] font-bold">A. 정답</span>
        <div className="no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto py-3 text-center">
          <div className="my-auto">
            <h2 className="text-[28px] leading-tight font-extrabold text-balance">{card.answer}</h2>
            <div className="mx-auto my-4 h-1 w-12 rounded bg-highlight" />
            {card.explanation && (
              <p className="text-[15px] leading-relaxed text-pretty text-white/90">{card.explanation}</p>
            )}
            {card.example && (
              <div className="mt-4 rounded-2xl bg-white/12 px-4 py-3 text-left">
                <p className="flex items-center gap-1 text-[12px] font-bold text-highlight">
                  <Sparkles className="size-3.5" aria-hidden />
                  AI 예시 · 강의 내용이 아니에요
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-pretty text-white/90">{card.example}</p>
              </div>
            )}
            {card.from && <p className="mt-3 text-[13px] text-white/75">{card.from}</p>}
          </div>
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
  xp,
  quizTo,
  onRetryUnknown,
  onRestart,
  onQuit,
}: {
  quote: Quote
  total: number
  unknown: FlashCard[]
  xp: number | null // 첫 세트일 때만. null이면 아직 받는 중이거나 다시 본 세트
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
        {xp !== null && xp > 0 && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-highlight/40 px-3 py-1 text-[14px] font-extrabold text-primary-deep">
            <Zap className="size-4" aria-hidden />+{xp} XP
          </p>
        )}
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
