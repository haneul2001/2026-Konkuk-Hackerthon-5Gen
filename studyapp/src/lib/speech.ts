import { useSyncExternalStore } from 'react'
import type { Concept, Lecture } from '../../shared/types'

// 브라우저 내장 음성(Web Speech API)으로 요약을 읽는다. 요약 듣기 탭과 전체 요약 탭이 같이 쓴다.

export const speechSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

// 크롬은 긴 문장을 읽다 멈추는 일이 있어 문장 단위로 끊어 이어 읽는다
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.?!。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function koreanVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('ko'))
  // 온라인 음성(구글)이 더 자연스러워서 먼저 고른다
  return voices.find((v) => /google/i.test(v.name)) ?? voices[0] ?? null
}

// 화면 글을 소리 내 읽기 좋게: 기호를 말로 바꾸고, '(이)라고' 같은 조사 괄호를 푼다
export function forSpeech(text: string): string {
  return text
    .replace(/\((이|가|을|를|은|는|과|와|으로|로)\)/g, '$1')
    .replace(/\s*(→|->|⇒)\s*/g, ', 그다음 ')
    .replace(/\s*(↔|<->)\s*/g, '와 ')
    .replace(/[·•]/g, ', ')
    .replace(/[“”"'‘’`*#_[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export type SpeechSection = { key: string; label: string; text: string }

const ORDINALS = ['첫', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열']

// 요약 듣기 대본: 인사 → 개요 → 개념 목록 예고 → 개념 하나씩 → 공지 → 다음 시간 예고 → 마무리
export function summaryScript(lecture: Lecture, concepts: Concept[]): SpeechSection[] {
  const list: SpeechSection[] = []
  const terms = concepts.map((c) => c.term)
  list.push({
    key: 'intro',
    label: '시작',
    text:
      `${lecture.title} 요약을 들려드릴게요.` +
      (terms.length ? ` 이번 강의의 핵심 개념은 ${terms.length}개예요. ${terms.join(', ')}.` : ''),
  })
  if (lecture.overview) list.push({ key: 'overview', label: '강의 개요', text: lecture.overview })
  concepts.forEach((c, i) =>
    list.push({
      key: c.id,
      label: c.term,
      text: `${ORDINALS[i] ?? `${i + 1}`} 번째 개념, ${c.term}. ${c.summary}`,
    }),
  )
  if (lecture.announcements?.length) {
    list.push({ key: 'notice', label: '시험·과제 공지', text: `시험과 과제 공지예요. ${lecture.announcements.join(' ')}` })
  }
  if (lecture.preview?.length) {
    list.push({ key: 'preview', label: '다음 시간 예고', text: `다음 시간 예고예요. ${lecture.preview.join(' ')}` })
  }
  if (list.length > 1) {
    list.push({ key: 'outro', label: '마무리', text: '요약은 여기까지예요. 퀴즈로 얼마나 기억하는지 확인해 보세요.' })
  }
  return list
}

// ---------- 한 번에 하나만 읽는 공용 재생기 (전체 요약 탭의 듣기 버튼용) ----------

let speakingKey: string | null = null
let turn = 0
const listeners = new Set<() => void>()

function setKey(key: string | null) {
  speakingKey = key
  listeners.forEach((l) => l())
}

export function stopSpeech() {
  turn++
  if (speechSupported) window.speechSynthesis.cancel()
  setKey(null)
}

// key: 지금 무엇을 읽는지 표시용. 같은 key를 다시 누르면 멈춘다
export function toggleSpeech(key: string, texts: string[], rate = 1) {
  if (!speechSupported) return
  if (speakingKey === key) return stopSpeech()
  stopSpeech()
  const lines = texts.flatMap((t) => sentences(forSpeech(t)))
  const myTurn = turn
  let i = 0
  setKey(key)
  const next = () => {
    if (turn !== myTurn) return
    if (i >= lines.length) return setKey(null)
    const u = new SpeechSynthesisUtterance(lines[i++])
    u.lang = 'ko-KR'
    u.rate = rate
    const voice = koreanVoice()
    if (voice) u.voice = voice
    u.onend = next
    u.onerror = () => {
      if (turn === myTurn) setKey(null)
    }
    window.speechSynthesis.speak(u)
  }
  next()
}

export function useSpeakingKey(): string | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => speakingKey,
    () => null,
  )
}
