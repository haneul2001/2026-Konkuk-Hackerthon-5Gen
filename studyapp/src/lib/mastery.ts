import type { Concept } from '../../shared/types'

// 개념 숙련도 표시. 퀴즈 결과로 새 개념 → 익히는 중 → 외움으로 바뀐다.
export const masteryLabel: Record<
  Concept['mastery'],
  { text: string; tone: 'accent' | 'primary' | 'success' }
> = {
  new: { text: '새 개념', tone: 'accent' },
  learning: { text: '익히는 중', tone: 'primary' },
  mastered: { text: '외움', tone: 'success' },
}
