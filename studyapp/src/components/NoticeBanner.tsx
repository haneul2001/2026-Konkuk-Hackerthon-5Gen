import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import type { Mood, Notice } from '../../shared/types'
import { Mascot } from './Mascot'

// 상단 알림 배너. 폰 프레임 위쪽에서 내려오고 5초 뒤 사라진다.
// 누르면 알림의 to로 이동, ✕로 바로 닫기. 알림 종류마다 마스코트 표정이 다르다.

const AUTO_HIDE_MS = 5000

const moodFor: Record<Notice['kind'], Mood> = {
  angry: 'angry',
  streak: 'upset',
  review: 'normal',
  goal: 'joyful',
  summary: 'happy',
  study: 'glad',
}

export function NoticeBanner({ notice, onDone }: { notice: Notice; onDone: () => void }) {
  const navigate = useNavigate()

  useEffect(() => {
    const t = setTimeout(onDone, AUTO_HIDE_MS)
    return () => clearTimeout(t)
  }, [notice.id, onDone])

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute inset-x-3 top-[calc(env(safe-area-inset-top)+8px)] z-30 animate-[banner-in_260ms_ease-out] sm:top-12"
    >
      <div className="flex items-center gap-1 rounded-2xl border-2 border-line bg-surface py-2 pr-1 pl-2.5 shadow-[0_4px_0_var(--color-line-strong)]">
        <button
          type="button"
          onClick={() => {
            onDone()
            if (notice.to) navigate(notice.to)
          }}
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Mascot mood={notice.mood ?? moodFor[notice.kind]} still className="w-11 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-bold">{notice.title}</span>
            <span className="line-clamp-2 block text-[13px] leading-snug text-muted">{notice.body}</span>
          </span>
        </button>
        <button
          type="button"
          aria-label="알림 닫기"
          onClick={onDone}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  )
}
