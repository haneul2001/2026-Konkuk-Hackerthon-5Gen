// 과목마다 고정 색. 과목 이름으로 늘 같은 색을 고른다(캘린더 띠).
// 색만으로 구분하지 않도록 띠에는 제목을 함께 쓴다. 베이지 배경과 어울리는 쿠 색만 쓰고,
// 빨강 계열은 공휴일과 헷갈려서 쓰지 않는다.
const courseTones = [
  'bg-primary-soft text-primary-deep',
  'bg-highlight-soft text-accent-ink',
  'bg-accent-soft text-accent-ink',
  'bg-line-strong/60 text-ink',
]

export function courseTone(course: string) {
  let h = 0
  for (const ch of course) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return courseTones[h % courseTones.length]
}
