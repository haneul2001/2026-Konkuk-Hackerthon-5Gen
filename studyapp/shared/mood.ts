import { localDate } from './mock'
import type { Mood, UserSummary } from './types'

// 마스코트 기분 규칙. "며칠째 안 했는지"와 "며칠 연속 했는지"로 정한다.
//
//   쉬는 중(연속 기록 끊김)     하루 빠짐 upset · 3일 이상 angry · 7일 이상 furious · 30일 이상 gaunt
//   연속 기록이 살아 있으면     0~6일 normal · 7일 glad · 8~29일 happy · 30일 이상 joyful

type StudyRecord = Pick<UserSummary, 'lastStudyDate' | 'todaySolved' | 'dailyGoal' | 'streakDays'>

export function daysSinceStudy(me: StudyRecord, today = localDate()) {
  const a = Date.parse(`${me.lastStudyDate}T00:00:00`)
  const b = Date.parse(`${today}T00:00:00`)
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

// lastStudyDate가 오늘이 아니면 오늘 푼 문제는 0
export function solvedToday(me: StudyRecord, today = localDate()) {
  return me.lastStudyDate === today ? me.todaySolved : 0
}

// 하루라도 빠지면 연속 기록은 끊긴 것으로 본다.
export function currentStreak(me: StudyRecord, today = localDate()) {
  return daysSinceStudy(me, today) <= 1 ? me.streakDays : 0
}

export function moodOf(me: StudyRecord, today = localDate()): Mood {
  const days = daysSinceStudy(me, today)
  if (days >= 30) return 'gaunt'
  if (days >= 7) return 'furious'
  if (days >= 3) return 'angry'
  if (days === 2) return 'upset'
  const streak = currentStreak(me, today)
  if (streak >= 30) return 'joyful'
  if (streak >= 8) return 'happy'
  if (streak >= 7) return 'glad'
  return 'normal'
}

export const moodInfo: Record<Mood, { label: string; rule: string }> = {
  gaunt: { label: '헬쑥함', rule: '30일 이상 안 함' },
  furious: { label: '폭발', rule: '7일 이상 안 함' },
  angry: { label: '화남', rule: '3일 이상 안 함' },
  upset: { label: '언짢음', rule: '하루 빠짐' },
  normal: { label: '평범', rule: '연속 0~6일' },
  glad: { label: '조금 기쁨', rule: '연속 7일' },
  happy: { label: '매우 기쁨', rule: '연속 8~29일' },
  joyful: { label: '매우매우 기쁨', rule: '연속 30일 이상' },
}

export const MOODS: Mood[] = ['gaunt', 'furious', 'angry', 'upset', 'normal', 'glad', 'happy', 'joyful']
