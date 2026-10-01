import { useEffect, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { cn } from '../lib/cn'
import { courseTone } from '../lib/courseTone'

// 반복해서 쓰는 작은 조각들. 블록형: 두꺼운 테두리 + 아래로만 떨어지는 단색 그림자.
// 터치 대상은 최소 44px(h-11) 이상.

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div>
      <h1 className="text-[26px] leading-tight font-bold text-balance">{title}</h1>
      {sub && <p className="mt-1.5 text-[15px] text-pretty text-muted">{sub}</p>}
    </div>
  )
}

export function Section({
  title,
  action,
  children,
  className,
}: {
  title: string
  action?: { label: string; to: string }
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {action && (
          <Link
            to={action.to}
            className={cn(
              '-mr-2 inline-flex h-11 items-center gap-0.5 rounded-lg px-2 text-sm font-medium text-primary',
              focusRing,
            )}
          >
            {action.label}
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export function Card({
  children,
  className,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border-2 border-line bg-surface shadow-[0_3px_0_var(--color-line)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

type Variant = 'primary' | 'secondary' | 'inverse' | 'danger'

const variants: Record<Variant, string> = {
  primary:
    'bg-primary text-white shadow-[0_4px_0_var(--color-primary-deep)] active:shadow-[0_2px_0_var(--color-primary-deep)]',
  secondary:
    'border-2 border-line-strong bg-surface text-ink shadow-[0_4px_0_var(--color-line-strong)] active:shadow-[0_2px_0_var(--color-line-strong)]',
  danger:
    'bg-danger text-white shadow-[0_4px_0_var(--color-danger-deep)] active:shadow-[0_2px_0_var(--color-danger-deep)]',
  // 색 블록 위에 올리는 흰 버튼
  inverse:
    'bg-surface text-primary shadow-[0_4px_0_var(--color-primary-deep)] active:shadow-[0_2px_0_var(--color-primary-deep)]',
}

function buttonClass(variant: Variant = 'secondary', className?: string) {
  return cn(
    'press inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:translate-y-0',
    focusRing,
    variants[variant],
    className,
  )
}

export function Button({
  children,
  variant = 'secondary',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button type="button" className={buttonClass(variant, className)} {...rest}>
      {children}
    </button>
  )
}

export function ButtonLink({
  variant = 'secondary',
  className,
  ...rest
}: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...rest} />
}

export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'accent' | 'success' | 'danger'
}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded-md px-2 text-xs font-semibold',
        tone === 'neutral' && 'bg-bg text-muted',
        tone === 'primary' && 'bg-primary-soft text-primary-deep',
        tone === 'accent' && 'bg-accent-soft text-accent-ink',
        tone === 'success' && 'bg-success-soft text-success',
        tone === 'danger' && 'bg-danger-soft text-danger',
      )}
    >
      {children}
    </span>
  )
}

// 과목 배지: 과목 색(lib/courseTone) + 첫 글자
export function CourseBadge({ course, className }: { course: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-bold',
        courseTone(course),
        className,
      )}
    >
      {course.slice(0, 1)}
    </span>
  )
}

// 리스트 한 줄. 카드 안에서 divide로 나눈다.
export function Row({
  to,
  onClick,
  leading,
  title,
  meta,
  trailing,
}: {
  to?: string
  onClick?: () => void
  leading?: ReactNode
  title: ReactNode
  meta?: ReactNode
  trailing?: ReactNode
}) {
  const inner = (
    <>
      {leading}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{title}</p>
        {meta && <div className="mt-0.5 truncate text-[13px] text-muted">{meta}</div>}
      </div>
      {trailing}
    </>
  )
  const cls = cn(
    'flex min-h-16 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left active:bg-bg',
    focusRing,
  )
  if (to)
    return (
      <Link to={to} className={cls}>
        {inner}
      </Link>
    )
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly (readonly [T, string])[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="flex gap-1 rounded-xl bg-line/60 p-1">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          onClick={() => onChange(key)}
          className={cn(
            'h-10 flex-1 cursor-pointer rounded-lg text-sm font-semibold',
            focusRing,
            value === key ? 'bg-surface text-ink shadow-[0_2px_0_var(--color-line-strong)]' : 'text-muted',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function Field({
  label,
  id,
  hint,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; id: string; hint?: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        className={cn(
          'mt-1.5 h-12 w-full rounded-xl border-2 border-line bg-surface px-3.5 text-base placeholder:text-muted/70',
          'focus:border-primary focus:outline-none',
        )}
        {...rest}
      />
      {hint && <p className="mt-1.5 text-[13px] text-muted">{hint}</p>}
    </div>
  )
}

// 빈 상태: 설명 한 줄 + 행동 하나
export function EmptyState({
  message,
  action,
}: {
  message: string
  action: { label: string; to: string }
}) {
  return (
    <Card className="px-5 py-8 text-center">
      <p className="text-[15px] text-pretty text-muted">{message}</p>
      <ButtonLink to={action.to} variant="primary" className="mt-4">
        {action.label}
      </ButtonLink>
    </Card>
  )
}

// 아직 안 만든 기능 자리. 무엇이 들어올지와 담당·API를 적어둔다.
export function Placeholder({
  title,
  description,
  endpoint,
  owner,
}: {
  title: string
  description: string
  endpoint?: string
  owner?: string
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-line-strong px-4 py-5">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-sm text-pretty text-muted">{description}</p>
      {(endpoint || owner) && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {endpoint && (
            <code className="rounded bg-surface px-1.5 py-0.5 break-all">{endpoint}</code>
          )}
          {owner && <span>담당: {owner}</span>}
        </p>
      )}
    </div>
  )
}

export function ListSkeleton({ rows }: { rows: number }) {
  return (
    <Card aria-busy="true" aria-label="불러오는 중">
      <ul className="divide-y-2 divide-line">
        {Array.from({ length: rows }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="size-11 rounded-xl bg-bg" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-bg" />
              <div className="h-3 w-1/3 rounded bg-bg" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// 아래에서 올라오는 시트. 폰 프레임 안에 뜨도록 absolute(프레임이 기준)로 둔다.
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="absolute inset-0 z-20 flex items-end bg-ink/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full rounded-t-3xl bg-surface px-5 pt-6 pb-[max(env(safe-area-inset-bottom),24px)]"
      >
        <h2 className="text-[19px] font-bold">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  )
}
