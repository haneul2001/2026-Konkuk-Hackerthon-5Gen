import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { Concept, Lecture, TranscriptSegment } from '../../shared/types'
import { api } from '../api/client'
import { cn } from '../lib/cn'
import { forSpeech, koreanVoice, sentences, speechSupported, summaryScript } from '../lib/speech'
import { clock } from '../lib/time'
import { Button, Card } from './ui'

// 강의 듣기: AI 요약을 읽어주는 TTS와, 녹음 원본을 자막과 함께 다시 듣기.

// ---------- 요약 듣기 (브라우저 내장 음성, Web Speech API) ----------

const RATES = [0.8, 1, 1.25, 1.5] as const

export function SummaryPlayer({ lecture, concepts }: { lecture: Lecture; concepts: Concept[] }) {
  const supported = speechSupported

  const sections = useMemo(() => summaryScript(lecture, concepts), [lecture, concepts])

  // 문장 줄: [섹션 번호, 화면에 보일 문장, 읽을 문장]
  const lines = useMemo(
    () => sections.flatMap((s, si) => sentences(s.text).map((t) => [si, t, forSpeech(t)] as const)),
    [sections],
  )

  const [playing, setPlaying] = useState(false)
  const [line, setLine] = useState(0)
  const [rate, setRate] = useState<(typeof RATES)[number]>(1)
  // cancel()도 onend를 부르므로, 지금 읽는 차례인지 표시로 구분한다
  const turn = useRef(0)

  const stop = useCallback(() => {
    turn.current++
    if (supported) window.speechSynthesis.cancel()
    setPlaying(false)
  }, [supported])

  // 문장이 끝나면 다음 문장을 읽는다. 최신 상태(속도 등)로 이어 읽도록 ref를 거쳐 부른다
  const next = useRef<(start: number) => void>(() => {})

  const speakFrom = useCallback(
    (start: number) => {
      if (!supported || start >= lines.length) {
        stop()
        setLine(0)
        return
      }
      const myTurn = ++turn.current
      window.speechSynthesis.cancel()
      setLine(start)
      setPlaying(true)
      const u = new SpeechSynthesisUtterance(lines[start][2])
      u.lang = 'ko-KR'
      u.rate = rate
      const voice = koreanVoice()
      if (voice) u.voice = voice
      u.onend = () => {
        if (turn.current === myTurn) next.current(start + 1)
      }
      u.onerror = () => {
        if (turn.current === myTurn) stop()
      }
      window.speechSynthesis.speak(u)
    },
    [lines, rate, stop, supported],
  )

  useEffect(() => {
    next.current = speakFrom
  }, [speakFrom])

  // 화면을 떠나면 멈춘다. 음성 목록은 늦게 오기도 해서 한 번 불러 둔다
  useEffect(() => {
    if (!supported) return
    const counter = turn
    window.speechSynthesis.getVoices()
    return () => {
      counter.current++
      window.speechSynthesis.cancel()
    }
  }, [supported])

  // 속도를 바꾸면 지금 문장부터 다시 읽는다
  const changeRate = (r: (typeof RATES)[number]) => {
    setRate(r)
    if (playing) setTimeout(() => speakFrom(line), 0)
  }

  if (!supported) {
    return (
      <Card className="p-4 text-[15px] text-muted">이 브라우저는 음성 읽기를 지원하지 않아요. 크롬에서 열어 주세요.</Card>
    )
  }

  const currentSection = lines[line]?.[0] ?? 0
  const firstLineOf = (si: number) => lines.findIndex(([s]) => s === si)

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="text-[17px] font-bold">요약 듣기</p>
        <p className="mt-1 text-[14px] text-muted">AI가 정리한 요약을 읽어줘요. 항목을 누르면 거기서부터 들어요.</p>
      </div>

      <div className="flex items-center gap-2">
        <Button
          aria-label="이전 항목"
          className="w-12 px-0"
          onClick={() => speakFrom(Math.max(0, firstLineOf(Math.max(0, currentSection - 1))))}
        >
          <SkipBack className="size-5" aria-hidden />
        </Button>
        <Button variant="primary" className="flex-1" onClick={() => (playing ? stop() : speakFrom(line))}>
          {playing ? <Pause className="size-5" aria-hidden /> : <Play className="size-5" aria-hidden />}
          {playing ? '멈춤' : line > 0 ? '이어서 재생' : '재생'}
        </Button>
        <Button
          aria-label="다음 항목"
          className="w-12 px-0"
          onClick={() => {
            const next = firstLineOf(currentSection + 1)
            if (next >= 0) speakFrom(next)
          }}
        >
          <SkipForward className="size-5" aria-hidden />
        </Button>
      </div>

      <div role="radiogroup" aria-label="읽는 속도" className="flex gap-1.5">
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={rate === r}
            onClick={() => changeRate(r)}
            className={cn(
              'h-8 flex-1 cursor-pointer rounded-lg text-[13px] font-semibold',
              rate === r ? 'bg-highlight-soft text-primary-deep' : 'bg-bg text-muted',
            )}
          >
            {r}배
          </button>
        ))}
      </div>

      <ol className="space-y-1.5">
        {sections.map((s, si) => {
          const active = si === currentSection && (playing || line > 0)
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => speakFrom(firstLineOf(si))}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'w-full cursor-pointer rounded-xl px-3 py-2.5 text-left',
                  active ? 'bg-highlight-soft' : 'active:bg-bg',
                )}
              >
                <p className="text-[15px] font-semibold">{s.label}</p>
                {/* 읽는 내용을 그대로 보여 주고, 지금 읽는 문장은 진하게 */}
                <p className="mt-1 text-[14px] leading-relaxed text-pretty text-muted">
                  {lines.map(([lsi, text], li) =>
                    lsi === si ? (
                      <span key={li} className={cn(active && li === line && 'font-semibold text-ink')}>
                        {text}{' '}
                      </span>
                    ) : null,
                  )}
                </p>
              </button>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

// ---------- 녹음 다시 듣기 (원본 + 자막) ----------
// 줄 오른쪽 재생 버튼: 그 문장부터 듣는다. 원본이 있으면 녹음을, 없으면 자막을 소리 내 읽어 준다(브라우저 음성).
// 따라가기를 켜 두면 지금 나오는 문장이 자막 상자 가운데로 온다.

// startAt: 이 위치(초)부터 재생한다 (개념의 '근거 듣기'에서 넘어올 때)
export function RecordingPlayer({ lectureId, startAt }: { lectureId: string; startAt?: number }) {
  const audio = useRef<HTMLAudioElement>(null)
  const list = useRef<HTMLOListElement>(null)
  // undefined: 불러오는 중, null: 자막 없음
  const [segments, setSegments] = useState<TranscriptSegment[] | null | undefined>(undefined)
  const [missing, setMissing] = useState(false)
  const [now, setNow] = useState(0)
  const [follow, setFollow] = useState(true)
  const [playing, setPlaying] = useState(false)
  // 원본이 없을 때 읽어 주는 줄
  const [ttsLine, setTtsLine] = useState(-1)
  const ttsTurn = useRef(0)
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  useEffect(() => {
    const el = audio.current
    if (!el || startAt == null) return
    const go = () => {
      el.currentTime = startAt
      void el.play().catch(() => {}) // 자동 재생이 막히면 위치만 옮겨 둔다
    }
    if (el.readyState >= 1) go()
    else el.addEventListener('loadedmetadata', go, { once: true })
    return () => el.removeEventListener('loadedmetadata', go)
  }, [startAt])

  useEffect(() => {
    api.transcript(lectureId).then((t) => setSegments(t?.segments?.length ? t.segments : null))
  }, [lectureId])

  // 화면을 떠나면 읽기를 멈춘다
  useEffect(
    () => () => {
      ttsTurn.current++
      if (ttsSupported) window.speechSynthesis.cancel()
    },
    [ttsSupported],
  )

  const active = missing ? ttsLine : (segments?.findIndex((s) => now >= s.start && now < s.end) ?? -1)

  // 따라가기: 지금 문장을 자막 상자 가운데로. 상자 안에서만 스크롤해서 화면 전체는 움직이지 않는다
  useEffect(() => {
    const box = list.current
    if (!follow || active < 0 || !box) return
    const el = box.children[active] as HTMLElement | undefined
    if (!el) return
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' })
  }, [active, follow])

  // 원본이 없을 때: i번째 줄부터 차례로 읽는다
  function speakFrom(i: number) {
    if (!segments || !ttsSupported) return
    const myTurn = ++ttsTurn.current
    window.speechSynthesis.cancel()
    if (i >= segments.length) {
      setPlaying(false)
      setTtsLine(-1)
      return
    }
    setTtsLine(i)
    setPlaying(true)
    const u = new SpeechSynthesisUtterance(segments[i].text)
    u.lang = 'ko-KR'
    const voice = koreanVoice()
    if (voice) u.voice = voice
    u.onend = () => {
      if (ttsTurn.current === myTurn) speakFrom(i + 1)
    }
    window.speechSynthesis.speak(u)
  }

  const pause = () => {
    if (missing) {
      ttsTurn.current++
      if (ttsSupported) window.speechSynthesis.cancel()
      setPlaying(false)
    } else audio.current?.pause()
  }

  // i번째 줄부터 듣기
  const playFrom = (i: number) => {
    if (!segments) return
    if (missing) return speakFrom(i)
    if (!audio.current) return
    audio.current.currentTime = segments[i].start
    void audio.current.play().catch(() => {})
  }

  // 위쪽 큰 버튼: 멈춘 자리(없으면 처음)부터 이어 듣기
  const toggle = () => {
    if (playing) return pause()
    if (missing) return speakFrom(Math.max(0, ttsLine))
    void audio.current?.play().catch(() => {})
  }

  const canPlay = missing ? ttsSupported && !!segments : true

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="text-[17px] font-bold">녹음 다시 듣기</p>
        <p className="mt-1 text-[14px] text-muted">
          {missing
            ? '녹음 원본이 없어서 자막을 소리 내 읽어 줘요. 줄 오른쪽 재생 버튼을 누르면 그 문장부터 들어요.'
            : '줄 오른쪽 재생 버튼을 누르면 그 문장부터 들어요.'}
        </p>
      </div>

      {!missing && (
        <audio
          ref={audio}
          controls
          preload="metadata"
          src={api.audioUrl(lectureId)}
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => {
            setMissing(true)
            setPlaying(false)
          }}
          className="w-full"
        />
      )}

      {segments === undefined ? (
        <p className="text-[14px] text-muted">자막을 불러오는 중이에요.</p>
      ) : segments === null ? (
        <p className="text-[14px] text-muted">자막이 없어요.</p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggle}
              disabled={!canPlay}
              aria-label={playing ? '멈추기' : '이어 듣기'}
              className="press flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-highlight text-primary-deep shadow-[0_3px_0_var(--color-highlight-deep)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {playing ? (
                <Pause className="size-5" fill="currentColor" aria-hidden />
              ) : (
                <Play className="ml-0.5 size-5" fill="currentColor" aria-hidden />
              )}
            </button>
            <label className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 text-[14px] font-semibold text-muted">
              <input
                type="checkbox"
                checked={follow}
                onChange={(e) => setFollow(e.target.checked)}
                className="size-4 accent-highlight-deep"
              />
              재생 위치 따라가기
            </label>
          </div>
          {missing && !ttsSupported && (
            <p className="text-[14px] text-muted">이 브라우저는 소리 내 읽기를 지원하지 않아요.</p>
          )}
          <ol ref={list} className="relative max-h-96 space-y-0.5 overflow-y-auto rounded-xl bg-bg p-1.5">
            {segments.map((s, i) => {
              const current = i === active
              const nowPlaying = current && playing
              return (
                <li
                  key={`${s.start}-${i}`}
                  aria-current={current ? 'true' : undefined}
                  className={cn(
                    'flex items-start gap-1 rounded-lg',
                    current && 'bg-surface shadow-[0_2px_0_var(--color-line)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => canPlay && playFrom(i)}
                    className={cn(
                      'flex min-w-0 flex-1 cursor-pointer gap-3 rounded-lg py-2 pl-2.5 text-left text-[14px] leading-relaxed',
                      current ? 'font-semibold text-ink' : 'text-ink',
                    )}
                  >
                    <span className="w-10 shrink-0 text-[12px] text-muted tabular-nums">{clock(s.start)}</span>
                    <span className="text-pretty">{s.text}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => (nowPlaying ? pause() : playFrom(i))}
                    disabled={!canPlay}
                    aria-label={nowPlaying ? '멈추기' : `${clock(s.start)}부터 듣기`}
                    className={cn(
                      'flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40',
                      nowPlaying ? 'bg-highlight text-primary-deep' : 'text-muted active:bg-line/60',
                    )}
                  >
                    {nowPlaying ? (
                      <Pause className="size-4" fill="currentColor" aria-hidden />
                    ) : (
                      <Play className="ml-0.5 size-4" fill="currentColor" aria-hidden />
                    )}
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      )}
    </Card>
  )
}
