// "방금 · 9분 전 · 3시간 전 · 09/30" 처럼 게시판식 상대 시각
export function timeAgo(iso: string, now = Date.now()) {
  const min = Math.floor((now - new Date(iso).getTime()) / 60_000)
  if (min < 1) return '방금'
  if (min < 60) return `${min}분 전`
  if (min < 60 * 24) return `${Math.floor(min / 60)}시간 전`
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}
