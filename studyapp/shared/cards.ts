import { concepts, lectures } from './mock'
import { addXp, cardSetXp } from './quiz'
import type { CardSession, CardSubmitResult, Concept, FlashCard } from './types'

// 플래시카드 대체 동작. 진짜 카드는 AI 서버가 만들고(개념당 1~3장),
// 서버가 없거나 여러 강의를 묶어 볼 때(개념 폴더·과목)는 개념으로 카드를 만든다:
// 앞면 = 개념 설명, 뒷면 = 개념 이름.

export function cardFromConcept(c: Concept): FlashCard {
  return {
    id: `cc_${c.id}`,
    lectureId: c.lectureId,
    conceptId: c.id,
    front: c.summary,
    answer: c.term,
    kind: 'concept',
    from: `${c.lectureTitle} 강의`,
  }
}

export function cardsFromConcepts(lectureId: string): FlashCard[] {
  return concepts.filter((c) => c.lectureId === lectureId).map(cardFromConcept)
}

const sessions = new Map<string, string[]>() // 세트 id → 카드 id

export function startSession(lectureId: string): CardSession | null {
  const cards = cardsFromConcepts(lectureId)
  if (cards.length === 0) return null
  const id = `cs_${Date.now().toString(36)}`
  sessions.set(id, cards.map((c) => c.id))
  return {
    id,
    lectureId,
    title: lectures.find((l) => l.id === lectureId)?.title ?? '',
    cards,
    dueCount: cards.length,
  }
}

export function submitSession(
  sessionId: string,
  results: { cardId: string; known: boolean }[],
): CardSubmitResult | { error: string } {
  const ids = sessions.get(sessionId)
  if (!ids) return { error: '플래시카드 세트를 찾을 수 없어요' }
  const seen = new Map(results.filter((r) => ids.includes(r.cardId)).map((r) => [r.cardId, r.known]))
  const known = [...seen.values()].filter(Boolean).length
  const finished = ids.every((id) => seen.has(id))
  const xpGained = finished ? cardSetXp(ids.length) : 0
  if (finished) {
    addXp(xpGained)
    sessions.delete(sessionId)
  }
  return {
    sessionId,
    lectureId: '',
    finished,
    cardCount: ids.length,
    known,
    unknown: seen.size - known,
    xpGained,
  }
}

// 개념 폴더·과목 플래시카드: 세트를 끝까지 넘기면 카드 수만큼 XP
export function finishCardSet(cardCount: number) {
  const xpGained = cardSetXp(cardCount)
  addXp(xpGained)
  return { xpGained }
}
