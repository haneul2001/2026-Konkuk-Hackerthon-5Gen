import { localDate } from './mock'
import { current } from './session'
import type { Mood, UserSummary } from './types'

// 관리자(개발용): 로그인한 사용자의 학습 기록을 바꿔서 마스코트 기분과 알림을 확인한다. 출시 전에는 막는다.

export type StudyRecordInput = {
  daysAgo: number // 마지막으로 공부한 날이 며칠 전인지 (0 = 오늘)
  todaySolved: number // daysAgo가 0일 때만 의미 있음
  dailyGoal?: number
  streakDays?: number // 연속 학습일 (끊기지 않았을 때 기준)
}

export function setStudyRecord(input: StudyRecordInput): UserSummary {
  const { me } = current()
  const daysAgo = Math.max(0, Math.min(60, Math.round(input.daysAgo)))
  if (input.dailyGoal !== undefined) me.dailyGoal = Math.max(1, Math.min(50, Math.round(input.dailyGoal)))
  me.lastStudyDate = localDate(-daysAgo)
  me.todaySolved = daysAgo === 0 ? Math.max(0, Math.round(input.todaySolved)) : 0
  if (input.streakDays !== undefined) me.streakDays = Math.max(0, Math.min(365, Math.round(input.streakDays)))
  return me
}

// 기분 하나를 고르면 그 기분이 나오는 기록으로 맞춘다.
export function presetFor(mood: Mood): StudyRecordInput {
  switch (mood) {
    case 'gaunt':
      return { daysAgo: 31, todaySolved: 0 }
    case 'furious':
      return { daysAgo: 8, todaySolved: 0 }
    case 'angry':
      return { daysAgo: 4, todaySolved: 0 }
    case 'upset':
      return { daysAgo: 2, todaySolved: 0 }
    case 'normal':
      return { daysAgo: 1, todaySolved: 0, streakDays: 3 }
    case 'glad':
      return { daysAgo: 1, todaySolved: 0, streakDays: 7 }
    case 'happy':
      return { daysAgo: 1, todaySolved: 0, streakDays: 15 }
    case 'joyful':
      return { daysAgo: 1, todaySolved: 0, streakDays: 30 }
  }
}
