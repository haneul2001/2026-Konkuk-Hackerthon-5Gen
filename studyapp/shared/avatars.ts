// 프로필 사진: 건국대 공식 '쿠 응용형' 이미지에서 평범한 모습 13장(public/ku/avatar, 출처는 public/ku/SOURCE.md).
// 내가 고른 사진(me.avatar)이 있으면 그걸, 없으면 아이디로 하나를 정해 늘 같은 사진이 나오게 한다.

export const AVATARS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13'] as const

export function isAvatar(v: unknown): v is string {
  return typeof v === 'string' && (AVATARS as readonly string[]).includes(v)
}

export function avatarSrc(id: string) {
  return `/ku/avatar/${isAvatar(id) ? id : AVATARS[0]}.webp`
}

// 문자열 → 사진 하나 (같은 문자열이면 늘 같은 사진)
export function avatarFor(key: string): string {
  let h = 0
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATARS[h % AVATARS.length]
}

// 내 정보(me)로 사진 정하기. 서버의 avatarOf와 같은 규칙
export function avatarOfMe(me: { id: string; avatar?: string }): string {
  return me.avatar && isAvatar(me.avatar) ? me.avatar : avatarFor(me.id)
}
