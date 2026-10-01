// 플래시카드를 다 넘긴 뒤 결과 화면에 띄우는 공부 명언.
// 사진은 public/flashcards/quote-01.webp ~ quote-10.webp (800×450, CC0. 출처는 같은 폴더 CREDITS.md).

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
  image: `/flashcards/quote-${String(i + 1).padStart(2, '0')}.webp`,
}))

// 직전과 다른 명언 하나를 무작위로 고른다.
export function randomQuote(except?: Quote): Quote {
  const pool = QUOTES.filter((q) => q !== except)
  return pool[Math.floor(Math.random() * pool.length)]
}
