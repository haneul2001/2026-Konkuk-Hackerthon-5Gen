import { league, me } from './mock'
import type { UserSummary } from './types'

// 프로필에서 바꿀 수 있는 것: 이름, 하루 목표 문제 수.
// 서버와 (서버가 꺼져 있을 때) 프론트가 같은 코드를 쓴다.

export const GOAL_MIN = 5
export const GOAL_MAX = 50

export function updateProfile(patch: { name?: string; dailyGoal?: number }): UserSummary | { error: string } {
  if (patch.name !== undefined) {
    const name = String(patch.name).trim()
    if (!name) return { error: '이름을 써 주세요' }
    if (name.length > 10) return { error: '이름은 10자까지예요' }
    me.name = name
    const mine = league.find((e) => e.isMe) // 랭킹에도 같은 이름
    if (mine) mine.name = name
  }
  if (patch.dailyGoal !== undefined) {
    const goal = Math.round(Number(patch.dailyGoal))
    if (!(goal >= GOAL_MIN && goal <= GOAL_MAX)) return { error: `하루 목표는 ${GOAL_MIN}~${GOAL_MAX}문제예요` }
    me.dailyGoal = goal
  }
  return { ...me }
}
