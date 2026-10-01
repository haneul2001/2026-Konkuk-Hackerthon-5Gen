import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import {
  BatteryFull,
  ChevronLeft,
  ShieldCheck,
  House,
  LibraryBig,
  MessagesSquare,
  Mic,
  Signal,
  Trophy,
  Wifi,
} from 'lucide-react'
import { cn } from '../lib/cn'
import type { Notice } from '../../shared/types'
import { api } from '../api/client'
import { ImmersiveContext } from '../lib/immersive'
import { NotifyContext } from '../lib/notify'
import { NoticeBanner } from './NoticeBanner'
import { Avatar } from './Avatar'
import { avatarOfMe } from '../../shared/avatars'
import { APP_NAME, LIBRARY_NAME } from '../lib/names'


// 앱으로 옮길 걸 전제로 한 화면 틀.
// 휴대폰에선 화면 전체를 쓰고, 그보다 넓으면 가운데에 390×844 폰 프레임을 띄운다.
// 프레임 안 너비는 항상 폰 너비라서 페이지 안에서는 sm:/md: 같은 반응형 접두사를 쓰지 않는다.

const tabs = [
  { to: '/', label: '홈', icon: House, end: true },
  { to: '/library', label: LIBRARY_NAME, icon: LibraryBig },
  { to: '/record', label: '녹음', icon: Mic, center: true },
  { to: '/ranking', label: '랭킹', icon: Trophy },
  { to: '/board', label: '게시판', icon: MessagesSquare },
]

const TAB_ROOTS = tabs.map((t) => t.to)
// 퀴즈는 탭이 아니라 강의·복습에서 들어간다.
// 탭 루트라도 이 쿼리가 붙으면 하위 화면(상세·글쓰기 등)이라 뒤로 버튼을 보인다.
const SUB_VIEW = /[?&](post|write|edit|review|lecture|folder)=/

export function Layout() {
  const location = useLocation()
  const { pathname, search } = location
  const navType = useNavigationType()
  const prevPath = useRef(pathname)
  const scrollRef = useRef<HTMLElement>(null)
  const isRoot = TAB_ROOTS.includes(pathname) && !SUB_VIEW.test(search)
  const [immersive, setImmersive] = useState(false)

  // 알림 배너 큐. 같은 알림은 한 번만 보여준다.
  const [queue, setQueue] = useState<Notice[]>([])
  const seen = useRef(new Set<string>())
  const notify = useCallback((n: Notice) => {
    if (seen.current.has(n.id)) return
    seen.current.add(n.id)
    setQueue((q) => [...q, n])
  }, [])
  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), [])

  // 프로필 버튼에 내 프로필 사진. 프로필에서 바꿀 수 있어서 화면을 옮길 때마다 다시 읽는다.
  const [avatar, setAvatar] = useState('')
  useEffect(() => {
    api.me().then((m) => setAvatar(avatarOfMe(m)))
  }, [pathname])

  // 앱을 열 때 한 번: 지금 상태로 생기는 알림(복습, 연속 기록 위험 등)을 띄운다.
  useEffect(() => {
    const t = setTimeout(() => api.notifications().then((list) => list.forEach(notify)), 800)
    return () => clearTimeout(t)
  }, [notify])

  // 스크롤 영역이 window가 아니라 main이라 화면 이동 시 직접 맨 위로 올린다.
  // 단, 같은 화면에서 탭·필터처럼 주소만 바꿔 끼운(replace) 경우는 그 자리를 지킨다.
  // replace인데도 화면이 통째로 바뀌는 곳은 navigate 옵션에 state: { scrollTop: true }를 넘긴다.
  useEffect(() => {
    const samePage = prevPath.current === pathname
    prevPath.current = pathname
    const wantsTop = (location.state as { scrollTop?: boolean } | null)?.scrollTop
    if (navType === 'REPLACE' && samePage && !wantsTop) return
    scrollRef.current?.scrollTo(0, 0)
  }, [pathname, search, location.key, location.state, navType])

  return (
    <PhoneFrame>
      {/* 상단 배너: 화면 맨 위(상태바·노치 영역)부터 쿠 진녹색으로 덮고, 아래쪽에만 노란 선 */}
      {immersive ? (
        <StatusBar />
      ) : (
        <div className="relative z-10 mb-1 shrink-0 border-b-2 border-highlight bg-primary pt-[env(safe-area-inset-top)] text-white shadow-[0_6px_16px_-8px_var(--color-primary-deep)]">
          <StatusBar />
          <TopBar isRoot={isRoot} avatar={avatar} />
        </div>
      )}

        <main
          ref={scrollRef}
          className={cn(
            'no-scrollbar flex flex-1 flex-col overflow-y-auto overscroll-contain px-5',
            immersive ? 'pt-[env(safe-area-inset-top)]' : 'pt-2 pb-8',
          )}
        >
          <ImmersiveContext.Provider value={setImmersive}>
            <NotifyContext.Provider value={notify}>
              <Outlet />
            </NotifyContext.Provider>
          </ImmersiveContext.Provider>
        </main>

        {!immersive && <TabBar />}

        {queue[0] && <NoticeBanner key={queue[0].id} notice={queue[0]} onDone={dismiss} />}
    </PhoneFrame>
  )
}

// 휴대폰에선 화면 전체, 그보다 넓으면 가운데 390×844 폰 프레임. 로그인 화면도 같이 쓴다.
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh sm:flex sm:items-center sm:justify-center sm:py-6">
      <div
        className={cn(
          'relative flex h-dvh w-full flex-col overflow-hidden bg-bg',
          'sm:h-[min(844px,calc(100dvh-48px))] sm:w-[390px] sm:rounded-[52px] sm:border-[12px] sm:border-bezel sm:shadow-2xl',
        )}
      >
        {children}
      </div>
    </div>
  )
}

// 데스크톱 미리보기에서만 보이는 가짜 상태바. 실제 폰에선 OS 상태바가 있다. 글자색은 바깥(배너)을 따른다.
export function StatusBar() {
  return (
    <div
      aria-hidden
      className="hidden h-11 shrink-0 items-center justify-between px-7 text-[15px] font-semibold sm:flex"
    >
      <span className="tabular-nums">9:41</span>
      <span className="absolute top-2.5 left-1/2 h-[26px] w-[100px] -translate-x-1/2 rounded-full bg-bezel" />
      <span className="flex items-center gap-1.5">
        <Signal className="size-4" strokeWidth={2.5} />
        <Wifi className="size-4" strokeWidth={2.5} />
        <BatteryFull className="size-5" strokeWidth={2} />
      </span>
    </div>
  )
}

function TopBar({ isRoot, avatar }: { isRoot: boolean; avatar: string }) {
  const navigate = useNavigate()
  const { key } = useLocation()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between px-3">
      {isRoot ? (
        <span className="px-2 text-[26px] font-extrabold tracking-tight">
          <span className="text-highlight">{APP_NAME.slice(0, 1)}</span>
          {APP_NAME.slice(1)}
        </span>
      ) : (
        <button
          type="button"
          aria-label="뒤로"
          // 주소로 바로 들어온 경우엔 돌아갈 곳이 없으니 홈으로
          onClick={() => (key === 'default' ? navigate('/') : navigate(-1))}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full active:bg-white/15 focus-visible:outline-2 focus-visible:outline-highlight"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      )}
      <div className="flex items-center">
        <NavLink
          to="/admin"
          aria-label="관리자"
          className={({ isActive }) =>
            cn(
              'flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-highlight',
              isActive ? 'text-highlight' : 'text-white/85 active:bg-white/15',
            )
          }
        >
          <ShieldCheck className="size-6" aria-hidden />
        </NavLink>
        <NavLink
          to="/profile"
          aria-label="내 프로필"
          className="flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-highlight"
        >
          {({ isActive }) => (
            avatar ? (
              <Avatar
                id={avatar}
                className={cn('size-9 border-2', isActive ? 'border-highlight bg-highlight' : 'border-highlight bg-white')}
              />
            ) : (
              <span className="size-9 rounded-full border-2 border-highlight bg-white/10" />
            )
          )}
        </NavLink>
      </div>
    </header>
  )
}

function TabBar() {
  return (
    <nav
      aria-label="주 메뉴"
      className="shrink-0 border-t-2 border-line bg-surface pb-[max(env(safe-area-inset-bottom),8px)] sm:pb-5"
    >
      <ul className="grid grid-cols-5">
        {tabs.map(({ to, label, icon: Icon, end, center }) => (
          <li key={to} className="flex justify-center">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 w-full cursor-pointer flex-col items-center justify-center gap-0.5 pt-1.5 text-[11px] font-semibold',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                  isActive ? 'text-primary-deep' : 'text-muted',
                )
              }
            >
              {({ isActive }) =>
                center ? (
                  <>
                    <span className="press -mt-6 flex size-14 items-center justify-center rounded-full bg-highlight text-primary-deep shadow-[0_4px_0_var(--color-highlight-deep)] ring-4 ring-surface">
                      <Icon className="size-6" strokeWidth={2.5} aria-hidden />
                    </span>
                    <span>{label}</span>
                  </>
                ) : (
                  <>
                    <span
                      className={cn(
                        'flex h-7 w-12 items-center justify-center rounded-full',
                        isActive && 'bg-highlight-soft',
                      )}
                    >
                      <Icon className="size-6" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
                    </span>
                    <span>{label}</span>
                  </>
                )
              }
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
