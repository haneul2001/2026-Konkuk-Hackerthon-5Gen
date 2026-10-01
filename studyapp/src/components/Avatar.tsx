import { avatarSrc } from '../../shared/avatars'
import { cn } from '../lib/cn'

// 프로필 사진(공식 '쿠' 이미지). 둥근 틀 안에 비율 그대로 넣는다(늘이거나 찌그러뜨리지 않는다).
export function Avatar({ id, className }: { id: string; className?: string }) {
  return (
    <span className={cn('block shrink-0 overflow-hidden rounded-full bg-primary-soft', className)} aria-hidden>
      <img src={avatarSrc(id)} alt="" draggable={false} className="size-full object-contain" />
    </span>
  )
}
