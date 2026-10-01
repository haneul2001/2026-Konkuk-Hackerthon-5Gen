import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
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
  const { pathname, search } = useLocation()
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

  // 앱을 열 때 한 번: 지금 상태로 생기는 알림(복습, 연속 기록 위험 등)을 띄운다.
  useEffect(() => {
    const t = setTimeout(() => api.notifications().then((list) => list.forEach(notify)), 800)
    return () => clearTimeout(t)
  }, [notify])

  // 스크롤 영역이 window가 아니라 main이라 화면 이동 시 직접 맨 위로 올린다.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0)
  }, [pathname, search])

  return (
    <div className="min-h-dvh sm:flex sm:items-center sm:justify-center sm:py-6">
      <div
        className={cn(
          'relative flex h-dvh w-full flex-col overflow-hidden bg-bg',
          'sm:h-[min(844px,calc(100dvh-48px))] sm:w-[390px] sm:rounded-[52px] sm:border-[12px] sm:border-bezel sm:shadow-2xl',
        )}
      >
        <StatusBar />
        {!immersive && <TopBar isRoot={isRoot} isHome={pathname === '/'} />}

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
      </div>
    </div>
  )
}

// 데스크톱 미리보기에서만 보이는 가짜 상태바. 실제 폰에선 OS 상태바가 있다.
function StatusBar() {
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

function TopBar({ isRoot, isHome }: { isRoot: boolean; isHome: boolean }) {
  const navigate = useNavigate()
  const { key } = useLocation()

  return (
    <header className="flex h-14 shrink-0 items-center justify-between px-3 pt-[env(safe-area-inset-top)]">
      {isRoot ? (
        <span className="px-2 text-lg font-extrabold tracking-tight text-primary">
          {isHome ? APP_NAME : ''}
        </span>
      ) : (
        <button
          type="button"
          aria-label="뒤로"
          // 주소로 바로 들어온 경우엔 돌아갈 곳이 없으니 홈으로
          onClick={() => (key === 'default' ? navigate('/') : navigate(-1))}
          className="flex size-11 cursor-pointer items-center justify-center rounded-full active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
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
              'flex size-11 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-primary',
              isActive ? 'text-primary' : 'text-muted active:bg-line/60',
            )
          }
        >
          <ShieldCheck className="size-6" aria-hidden />
        </NavLink>
        <button
          type="button"
          aria-label="내 프로필"
          className="flex size-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-primary"
        >
          <span className="flex size-9 items-center justify-center rounded-full border-2 border-line-strong bg-surface text-sm font-bold">
            하
          </span>
        </button>
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
                  isActive ? 'text-primary' : 'text-muted',
                )
              }
            >
              {({ isActive }) =>
                center ? (
                  <>
                    <span className="press -mt-6 flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-[0_4px_0_var(--color-primary-deep)] ring-4 ring-surface">
                      <Icon className="size-6" strokeWidth={2.5} aria-hidden />
                    </span>
                    <span>{label}</span>
                  </>
                ) : (
                  <>
                    <Icon className="size-6" strokeWidth={isActive ? 2.5 : 2} aria-hidden />
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
