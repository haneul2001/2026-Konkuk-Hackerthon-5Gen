import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api, ApiError } from '../api/client'
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

  if (getToken()) return <Navigate to="/" replace />

  const ready = login.trim().length > 0 && password.length > 0 && (mode === 'login' || name.trim().length > 0)

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
    <div className="flex min-h-dvh items-center justify-center bg-bg px-5 py-8">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center text-center">
          <Mascot mood="glad" className="w-28" />
          <h1 className="mt-3 text-[24px] font-extrabold text-primary">{APP_NAME}</h1>
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
      </form>
    </div>
  )
}
