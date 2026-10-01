// 큐카드 위쪽 그림에 쓰는 공부 명언. 그림은 public/cuecards/quote-01.webp ~ quote-10.webp.
// 글자는 그림에 넣지 않고 화면에서 얹는다(생성 이미지의 한글이 자주 깨져서).

export type Quote = { text: string; author: string; image: string }

const LINES: [string, string][] = [
  ['배우고 때때로 익히면 또한 기쁘지 아니한가', '공자'],
  ['아는 것이 힘이다', '프랜시스 베이컨'],
  ['천재는 1%의 영감과 99%의 노력으로 이루어진다', '토머스 에디슨'],
  ['배움에는 왕도가 없다', '유클리드'],
  ['내일 죽을 것처럼 살고, 영원히 살 것처럼 배워라', '마하트마 간디'],
  ['교육은 세상을 바꿀 수 있는 가장 강력한 무기다', '넬슨 만델라'],
  ['나는 내가 아무것도 모른다는 것을 안다', '소크라테스'],
  ['성공은 매일 반복한 작은 노력들의 합이다', '로버트 콜리어'],
  ['중요한 것은 질문을 멈추지 않는 것이다', '알베르트 아인슈타인'],
  ['천 리 길도 한 걸음부터', '노자'],
]

export const QUOTES: Quote[] = LINES.map(([text, author], i) => ({
  text,
  author,
  image: `/cuecards/quote-${String(i + 1).padStart(2, '0')}.webp`,
}))

// 덱마다 시작점만 무작위로 잡고 순서대로 돌린다. 연달아 같은 그림이 나오지 않는다.
export function quoteCycle(count: number): Quote[] {
  const start = Math.floor(Math.random() * QUOTES.length)
  return Array.from({ length: count }, (_, i) => QUOTES[(start + i) % QUOTES.length])
}
