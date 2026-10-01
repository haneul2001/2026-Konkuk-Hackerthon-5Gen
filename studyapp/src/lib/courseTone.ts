// 과목마다 고정 색. 과목 이름으로 늘 같은 색을 고른다(배지·캘린더 띠가 같은 색).
// 색만으로 구분하지 않도록 배지에는 첫 글자를, 캘린더 띠에는 제목을 함께 쓴다.
const courseTones = [
  'bg-sky-100 text-sky-800',
  'bg-amber-100 text-amber-800',
  'bg-teal-100 text-teal-800', // 빨강 계열은 공휴일과 헷갈려서 쓰지 않는다
  'bg-lime-100 text-lime-800',
  'bg-primary-soft text-primary-deep',
]

export function courseTone(course: string) {
  let h = 0
  for (const ch of course) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return courseTones[h % courseTones.length]
}
