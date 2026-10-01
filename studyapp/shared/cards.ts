import { concepts } from './mock'
import { addXp, cardSetXp } from './quiz'
import type { Concept, FlashCard, StudyCard } from './types'

// 플래시카드 화면에 넘길 카드 만들기.
//  - 녹음: AI 서버 큐카드(질문 → 정답·설명·AI 예시)
//  - 개념 폴더·과목, 또는 큐카드가 없을 때: 개념 카드(앞면 개념 설명 → 뒷면 개념 이름)

export function cardFromStudyCard(s: StudyCard): FlashCard {
  return {
    id: s.id,
    lectureId: s.lectureId,
    conceptId: s.conceptId,
    icon: s.icon,
    front: s.front,
    answer: s.answer,
    explanation: s.explanation,
    example: s.example ?? undefined,
    box: s.box,
    kind: 'ai',
    from: `${s.lectureTitle} 강의`,
  }
}

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

// 한 세트를 끝까지 넘기면 카드 수만큼 XP
export function finishCardSet(cardCount: number) {
  const xpGained = cardSetXp(cardCount)
  addXp(xpGained)
  return { xpGained }
}
