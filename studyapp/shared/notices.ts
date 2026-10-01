import { lectures, localDate, me, posts, todayReviews } from './mock'
import { currentStreak, daysSinceStudy, solvedToday } from './mood'
import type { Notice } from './types'

// 앱을 열었을 때 보여줄 알림. 중요한 순서대로 돌려준다.
// 지금은 앱 안 배너로만 띄우고, 나중에 푸시 알림이 붙으면 같은 규칙을 쓴다.
export function currentNotices(): Notice[] {
  const out: Notice[] = []
  const today = localDate()
  const days = daysSinceStudy(me, today)
  const streak = currentStreak(me, today)
  const solved = solvedToday(me, today)
  const firstReview = todayReviews[0]

  if (days >= 3) {
    out.push({ ...absenceNotice(days), id: `angry_${today}`, to: firstReview ? `/quiz?review=${firstReview.id}` : '/quiz' })
  } else if (solved === 0 && days === 1 && streak > 0) {
    out.push({
      id: `streak_${today}`,
      kind: 'streak',
      title: `${streak}일 연속 기록이 끊기기 직전이에요`,
      body: '오늘 한 문제만 풀어도 이어져요.',
      to: firstReview ? `/quiz?review=${firstReview.id}` : '/quiz',
    })
  }

  if (todayReviews.length > 0) {
    const total = todayReviews.reduce((n, r) => n + r.questionCount, 0)
    out.push({
      id: `review_${today}_${total}`,
      kind: 'review',
      title: `오늘 복습 ${total}문제가 기다려요`,
      body: todayReviews.map((r) => r.course).filter((c, i, a) => a.indexOf(c) === i).join(' · '),
      to: `/quiz?review=${firstReview.id}`,
    })
  }

  return out
}

// 오래 안 왔을 때 알림. 쉰 기간이 길수록 소 상태가 나빠진다.
export function absenceNotice(days: number): Notice {
  if (days >= 30)
    return {
      id: `absence_${days}`,
      kind: 'angry',
      mood: 'gaunt',
      title: '소가 헬쑥해졌어요…',
      body: `${days}일째 아무것도 안 했어요. 한 문제만 풀어서 소를 살려 주세요.`,
      to: '/',
    }
  if (days >= 7)
    return {
      id: `absence_${days}`,
      kind: 'angry',
      mood: 'furious',
      title: '소가 폭발했어요',
      body: `${days}일째 공부를 안 했어요. 지금 당장 한 문제!`,
      to: '/',
    }
  return {
    id: `absence_${days}`,
    kind: 'angry',
    mood: 'angry',
    title: '소가 화났어요',
    body: `${days}일째 공부를 안 했어요. 5분만 같이 해볼까요?`,
    to: '/',
  }
}

// 문제를 제출한 직후 생기는 알림: 오늘 목표 달성, 새로 참여할 수 있게 된 스터디.
export function noticesAfterSubmit(before: { solved: number; xpTotal: number }): Notice[] {
  const out: Notice[] = []
  const today = localDate()
  const solved = solvedToday(me, today)
  if (before.solved < me.dailyGoal && solved >= me.dailyGoal) {
    out.push({
      id: `goal_${today}`,
      kind: 'goal',
      title: '오늘 목표 달성!',
      body: `${me.dailyGoal}문제를 다 풀었어요. 연속 ${me.streakDays}일째!`,
      to: '/',
    })
  }
  for (const p of posts) {
    const s = p.study
    if (s && s.joined < s.capacity && before.xpTotal < s.minXp && me.xpTotal >= s.minXp) {
      out.push({
        id: `study_${p.id}`,
        kind: 'study',
        title: '이제 참여할 수 있는 스터디가 있어요',
        body: p.title,
        to: `/board?post=${p.id}`,
      })
    }
  }
  return out
}

// 관리자 화면의 "알림 시험 발송"용 예시. 실제 상태와 상관없이 모양만 확인한다.
export function sampleNotice(kind: Notice['kind']): Notice {
  const lecture = lectures.find((l) => l.status === 'ready')
  const post = posts.find((p) => p.study) ?? posts[0]
  const id = `sample_${kind}_${Date.now()}`
  switch (kind) {
    case 'angry':
      return { ...absenceNotice(4), id }
    case 'streak':
      return { id, kind, title: '6일 연속 기록이 끊기기 직전이에요', body: '오늘 한 문제만 풀어도 이어져요.', to: '/' }
    case 'review':
      return { id, kind, title: '오늘 복습 8문제가 기다려요', body: '운영체제 · 자료구조', to: '/' }
    case 'goal':
      return { id, kind, title: '오늘 목표 달성!', body: '10문제를 다 풀었어요. 소가 엄청 기뻐해요.', to: '/' }
    case 'summary':
      return {
        id,
        kind,
        title: '요약이 끝났어요',
        body: `${lecture?.title ?? '새 강의'} · 개념과 퀴즈가 준비됐어요.`,
        to: lecture ? `/lectures/${lecture.id}` : '/library',
      }
    case 'study':
      return {
        id,
        kind,
        title: '이제 참여할 수 있는 스터디가 있어요',
        body: post?.title ?? '자료구조 중간고사 대비 스터디',
        to: post ? `/board?post=${post.id}` : '/board?board=study',
      }
  }
}
