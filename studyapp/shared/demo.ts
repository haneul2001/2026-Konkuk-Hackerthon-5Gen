import { comments, league, localDate, me, posts, studyContacts } from './mock'
import type { BoardComment, BoardPost } from './types'

// 시연·테스트용 더미 데이터. DEMO_SEED=1 일 때만 서버가 켜질 때 한 번 채운다.
// 로그인이 없어 다른 사용자는 리그·게시판에만 나오는 가짜 사람이다. 서버를 다시 켜면 이 상태로 돌아간다.

const others = [
  { id: 'u_jiwoo', name: '지우', xp: 410 },
  { id: 'u_minjun', name: '민준', xp: 265 },
  { id: 'u_seoyeon', name: '서연', xp: 198 },
  { id: 'u_doyun', name: '도윤', xp: 150 },
  { id: 'u_harin', name: '하린', xp: 92 },
  { id: 'u_junho', name: '준호', xp: 60 },
  { id: 'u_yuna', name: '유나', xp: 35 },
]

// 지금으로부터 h시간 전
const ago = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()

export function seedDemo() {
  // 내 기록: 어제까지 5일 연속, 오늘 4문제 푼 상태
  Object.assign(me, {
    xpTotal: 1240,
    xpThisWeek: 180,
    streakDays: 5,
    lastStudyDate: localDate(),
    todaySolved: 4,
  })

  // 주간 리그: 나 + 7명, XP 순으로 순위
  league.length = 0
  league.push(
    { rank: 0, name: me.name, xpThisWeek: me.xpThisWeek, isMe: true },
    ...others.map((u) => ({ rank: 0, name: u.name, xpThisWeek: u.xp })),
  )
  league.sort((a, b) => b.xpThisWeek - a.xpThisWeek)
  league.forEach((e, i) => (e.rank = i + 1))
  me.leagueRank = league.find((e) => e.isMe)!.rank
  me.leagueSize = league.length

  // 게시판
  const post = (p: Omit<BoardPost, 'likes' | 'liked' | 'commentCount' | 'anonymous' | 'author'> &
    Partial<Pick<BoardPost, 'likes' | 'anonymous'>>, name: string): BoardPost => ({
    likes: 0,
    anonymous: false,
    ...p,
    liked: false,
    commentCount: 0,
    author: p.anonymous ? '익명' : name,
  })
  posts.push(
    post({ id: 'post_demo1', board: 'question', title: '다이렉트 매핑 캐시에서 태그 비트 수 구하는 법',
      body: '블록 16개, 블록 크기 4워드면 인덱스 비트랑 태그 비트를 어떻게 나누나요? 교수님 예제가 헷갈려요.',
      tags: ['컴퓨터구조', '캐시'], authorId: 'u_minjun', createdAt: ago(5), likes: 3 }, '민준'),
    post({ id: 'post_demo2', board: 'free', title: '중간고사 범위 공지 들으신 분?',
      body: '지난주 수업 마지막에 범위 말씀하셨던 것 같은데 녹음을 놓쳤어요 ㅠ',
      tags: ['중간고사'], authorId: 'u_harin', createdAt: ago(20), anonymous: true, likes: 5 }, '하린'),
    post({ id: 'post_demo3', board: 'study', title: '컴구 시험 대비 스터디 구해요 (주 2회)',
      body: '화·목 저녁 8시 온라인으로 문제 풀고 서로 설명해 주는 방식이에요.',
      tags: ['컴퓨터구조', '스터디'], authorId: 'u_jiwoo', createdAt: ago(30), likes: 7,
      study: { course: '컴퓨터구조', minXp: 300, capacity: 4, joined: 2 } }, '지우'),
    post({ id: 'post_demo4', board: 'study', title: '소공 팀플 같이 준비할 사람',
      body: '요구사항 명세 쓰는 거 같이 연습해요. 처음이어도 괜찮아요.',
      tags: ['소프트웨어공학'], authorId: 'u_seoyeon', createdAt: ago(48), likes: 2,
      study: { course: '소프트웨어공학', minXp: 100, capacity: 5, joined: 3 } }, '서연'),
    post({ id: 'post_demo5', board: 'free', title: '플래시카드 몰라요 누르면 다음에 먼저 나오네요',
      body: '복습할 때 편해요. 다들 하루 몇 장씩 보세요?',
      tags: ['공부법'], authorId: 'u_doyun', createdAt: ago(72), likes: 1 }, '도윤'),
  )
  studyContacts.post_demo3 = '오픈채팅: open.kakao.com/o/demo-cs'
  studyContacts.post_demo4 = '오픈채팅: open.kakao.com/o/demo-se'

  const comment = (c: Omit<BoardComment, 'isWriter' | 'likes'> & { likes?: number }): BoardComment => ({
    likes: 0,
    ...c,
    isWriter: posts.find((p) => p.id === c.postId)?.authorId === c.authorId,
  })
  comments.push(
    comment({ id: 'cmt_demo1', postId: 'post_demo1', authorId: 'u_jiwoo', author: '지우',
      body: '블록 16개면 인덱스 4비트예요. 나머지에서 오프셋 빼면 태그!', createdAt: ago(4), likes: 2 }),
    comment({ id: 'cmt_demo2', postId: 'post_demo1', authorId: 'u_minjun', author: '민준',
      body: '아 오프셋을 먼저 빼야 하는군요 감사합니다', createdAt: ago(3), parentId: 'cmt_demo1' }),
    comment({ id: 'cmt_demo3', postId: 'post_demo2', authorId: 'u_junho', author: '익명1',
      body: '7주차까지라고 하셨어요', createdAt: ago(18), likes: 4 }),
    comment({ id: 'cmt_demo4', postId: 'post_demo3', authorId: 'u_yuna', author: '유나',
      body: 'XP 조금만 더 모으면 참여할게요!', createdAt: ago(25) }),
  )
  for (const p of posts) p.commentCount = comments.filter((c) => c.postId === p.id).length
}
