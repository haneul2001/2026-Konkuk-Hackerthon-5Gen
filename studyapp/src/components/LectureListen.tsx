import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { Concept, Lecture, TranscriptSegment } from '../../shared/types'
import { api } from '../api/client'
import { cn } from '../lib/cn'
import { clock } from '../lib/time'
import { Button, Card } from './ui'

// 강의 듣기: AI 요약을 읽어주는 TTS와, 녹음 원본을 자막과 함께 다시 듣기.

// ---------- 요약 듣기 (브라우저 내장 음성, Web Speech API) ----------

type Section = { key: string; label: string; text: string }

// 크롬은 긴 문장을 읽다 멈추는 일이 있어 문장 단위로 끊어 이어 읽는다
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.?!。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function koreanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ko'))
  // 온라인 음성(구글)이 더 자연스러워서 먼저 고른다
  return voices.find((v) => /google/i.test(v.name)) ?? voices[0] ?? null
}

const RATES = [0.8, 1, 1.25, 1.5] as const

export function SummaryPlayer({ lecture, concepts }: { lecture: Lecture; concepts: Concept[] }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const sections = useMemo<Section[]>(() => {
    const list: Section[] = [{ key: 'intro', label: '시작', text: `${lecture.title}. 요약을 들려드릴게요.` }]
    if (lecture.overview) list.push({ key: 'overview', label: '강의 개요', text: lecture.overview })
    concepts.forEach((c, i) => list.push({ key: c.id, label: c.term, text: `${i + 1}번째 개념, ${c.term}. ${c.summary}` }))
    if (lecture.announcements?.length) {
      list.push({ key: 'notice', label: '시험·과제 공지', text: `공지예요. ${lecture.announcements.join(' ')}` })
    }
    return list
  }, [lecture, concepts])

  // 문장 줄: [섹션 번호, 문장]
  const lines = useMemo(
    () => sections.flatMap((s, si) => sentences(s.text).map((t) => [si, t] as const)),
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
      const u = new SpeechSynthesisUtterance(lines[start][1])
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
              rate === r ? 'bg-primary-soft text-primary-deep' : 'bg-bg text-muted',
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
                  active ? 'bg-primary-soft' : 'active:bg-bg',
                )}
              >
                <p className={cn('text-[15px] font-semibold', active && 'text-primary-deep')}>{s.label}</p>
                {active && (
                  <p className="mt-1 text-[14px] leading-relaxed text-pretty text-muted">{lines[line]?.[1]}</p>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

// ---------- 녹음 다시 듣기 (원본 + 자막) ----------

// startAt: 이 위치(초)부터 재생한다 (개념의 '근거 듣기'에서 넘어올 때)
export function RecordingPlayer({ lectureId, startAt }: { lectureId: string; startAt?: number }) {
  const audio = useRef<HTMLAudioElement>(null)

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
  const list = useRef<HTMLOListElement>(null)
  // undefined: 불러오는 중, null: 자막 없음
  const [segments, setSegments] = useState<TranscriptSegment[] | null | undefined>(undefined)
  const [missing, setMissing] = useState(false)
  const [now, setNow] = useState(0)
  const [follow, setFollow] = useState(true)

  useEffect(() => {
    api.transcript(lectureId).then((t) => setSegments(t?.segments?.length ? t.segments : null))
  }, [lectureId])

  const active = segments?.findIndex((s) => now >= s.start && now < s.end) ?? -1

  // 따라가기: 지금 문장이 자막 상자 안에 보이게 한다
  useEffect(() => {
    if (!follow || active < 0 || !list.current) return
    const el = list.current.children[active] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [active, follow])

  const seek = (sec: number) => {
    if (!audio.current) return
    audio.current.currentTime = sec
    void audio.current.play()
  }

  return (
    <Card className="space-y-4 p-4">
      <div>
        <p className="text-[17px] font-bold">녹음 다시 듣기</p>
        <p className="mt-1 text-[14px] text-muted">문장을 누르면 그 부분부터 들어요.</p>
      </div>

      {missing ? (
        <p className="text-[15px] text-muted">이 강의는 녹음 원본이 없어요.</p>
      ) : (
        <audio
          ref={audio}
          controls
          preload="metadata"
          src={api.audioUrl(lectureId)}
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
          onError={() => setMissing(true)}
          className="w-full"
        />
      )}

      {segments === undefined ? (
        <p className="text-[14px] text-muted">자막을 불러오는 중이에요.</p>
      ) : segments === null ? (
        <p className="text-[14px] text-muted">자막이 없어요.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />
            재생 위치 따라가기
          </label>
          <ol ref={list} className="max-h-96 space-y-0.5 overflow-y-auto rounded-xl bg-bg p-1.5">
            {segments.map((s, i) => (
              <li key={`${s.start}-${i}`}>
                <button
                  type="button"
                  onClick={() => seek(s.start)}
                  disabled={missing}
                  aria-current={i === active ? 'true' : undefined}
                  className={cn(
                    'flex w-full cursor-pointer gap-3 rounded-lg px-2.5 py-2 text-left text-[14px] leading-relaxed',
                    i === active ? 'bg-surface font-semibold text-primary-deep shadow-[0_2px_0_var(--color-line)]' : 'text-ink',
                  )}
                >
                  <span className="w-12 shrink-0 text-[12px] text-muted tabular-nums">{clock(s.start)}</span>
                  <span className="text-pretty">{s.text}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  )
}
