import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
import { PhoneFrame, StatusBar } from '../components/Layout'
import { Mascot } from '../components/Mascot'
import { Button, Field, Segmented } from '../components/ui'
import { getToken, setToken } from '../lib/auth'
import { APP_NAME } from '../lib/names'

// 로그인 · 회원가입. 로그인은 아이디·비밀번호, 가입은 이름까지. 성공하면 토큰을 두고 홈으로.

type Mode = 'login' | 'signup'

export function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [guestOk, setGuestOk] = useState(false) // 로컬 서버면 '둘러보기' 버튼

  useEffect(() => {
    api.guestAllowed().then(setGuestOk)
  }, [])

  if (getToken()) return <Navigate to="/" replace />

  const ready = login.trim().length > 0 && password.length > 0 && (mode === 'login' || name.trim().length > 0)

  async function browse() {
    setBusy(true)
    setError('')
    try {
      setToken((await api.guest()).token)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '서버에 연결할 수 없어요')
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    setBusy(true)
    setError('')
    try {
      const r =
        mode === 'login'
          ? await api.login({ login: login.trim(), password })
          : await api.signup({ login: login.trim(), password, name: name.trim() })
      setToken(r.token)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '서버에 연결할 수 없어요')
      setBusy(false)
    }
  }

  return (
    <PhoneFrame>
      <StatusBar />
      <div className="no-scrollbar flex flex-1 flex-col overflow-y-auto px-6 py-8">
        <form onSubmit={submit} className="my-auto w-full space-y-5">
          <div className="flex flex-col items-center text-center">
            <Mascot pose="welcome" className="w-32" />
            <h1 className="mt-3 text-[28px] font-extrabold tracking-tight text-muted">
              <span className="text-bright">{APP_NAME.slice(0, 1)}</span>
              {APP_NAME.slice(1)}
            </h1>
            <p className="mt-1 text-[14px] text-muted">녹음 한 번으로 요약·퀴즈·플래시카드까지</p>
          </div>
  
          <Segmented
            label="로그인 또는 회원가입"
            value={mode}
            options={[
              ['login', '로그인'],
              ['signup', '회원가입'],
            ]}
            onChange={(m) => {
              setMode(m)
              setError('')
            }}
          />
  
          <Field
            label="아이디"
            id="login-id"
            value={login}
            autoComplete="username"
            autoCapitalize="none"
            maxLength={20}
            placeholder={mode === 'signup' ? '영문 소문자·숫자·밑줄 4~20자' : '아이디'}
            onChange={(e) => setLogin(e.target.value)}
          />
          <Field
            label="비밀번호"
            id="login-pw"
            type="password"
            value={password}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            placeholder={mode === 'signup' ? '4자 이상' : '비밀번호'}
            onChange={(e) => setPassword(e.target.value)}
          />
          {mode === 'signup' && (
            <Field
              label="이름"
              id="login-name"
              value={name}
              maxLength={10}
              placeholder="랭킹과 게시판에 보여요 (10자까지)"
              onChange={(e) => setName(e.target.value)}
            />
          )}
  
          {error && (
            <p role="alert" className="text-center text-[14px] font-semibold text-danger">
              {error}
            </p>
          )}
  
          <Button type="submit" variant="primary" className="w-full" disabled={!ready || busy}>
            {busy ? '잠시만요…' : mode === 'login' ? '로그인' : '가입하고 시작'}
          </Button>

          {guestOk && (
            <button
              type="button"
              onClick={browse}
              disabled={busy}
              className="h-11 w-full cursor-pointer rounded-xl border-2 border-dashed border-line-strong text-[14px] font-semibold text-muted active:bg-surface disabled:opacity-50"
            >
              로그인 없이 둘러보기 <span className="text-[12px]">(로컬 전용)</span>
            </button>
          )}
        </form>
      </div>
    </PhoneFrame>
  )
}
