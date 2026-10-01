import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import type express from 'express'
import { newUserState, setCurrentProvider, users, type UserState } from '../shared/session'
import type { UserSummary } from '../shared/types'

// 로그인. 사용자(아이디·비밀번호 해시·이름)는 AI 서버 DB의 app_users 테이블에 두고,
// 로그인하면 서명한 토큰을 준다. 토큰은 서버에 저장하지 않는다(서명으로 확인).
// 요청마다 토큰의 사용자 상태를 AsyncLocalStorage에 실어서 shared/*.ts의 current()가 보게 한다.

const AI = process.env.AI_SERVER ?? 'http://localhost:8000'
const SECRET = process.env.SESSION_SECRET ?? 'dev-secret-change-me'
if (!process.env.SESSION_SECRET) console.warn('SESSION_SECRET이 없어요. 배포에선 Render 환경 변수로 넣어 주세요')
const TOKEN_DAYS = 30

const als = new AsyncLocalStorage<UserState>()
setCurrentProvider(() => {
  const s = als.getStore()
  if (!s) throw new Error('로그인한 사용자 밖에서 current()를 불렀어요')
  return s
})

// ---- 비밀번호 ----

function hashPassword(pw: string) {
  const salt = randomBytes(16).toString('hex')
  return `scrypt$${salt}$${scryptSync(pw, salt, 64).toString('hex')}`
}

function verifyPassword(pw: string, stored: string) {
  const [, salt, hash] = stored.split('$')
  if (!salt || !hash) return false
  const a = Buffer.from(hash, 'hex')
  const b = scryptSync(pw, salt, 64)
  return a.length === b.length && timingSafeEqual(a, b)
}

// ---- 토큰: <사용자 id>.<발급 시각>.<서명> ----

function sign(payload: string) {
  return createHmac('sha256', SECRET).update(payload).digest('base64url')
}

export function issueToken(userId: string) {
  const payload = `${userId}.${Date.now()}`
  return `${payload}.${sign(payload)}`
}

export function readToken(token: string): string | null {
  const [id, iat, sig] = token.split('.')
  if (!id || !iat || !sig) return null
  const a = Buffer.from(sig)
  const b = Buffer.from(sign(`${id}.${iat}`))
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (Date.now() - Number(iat) > TOKEN_DAYS * 86_400_000) return null
  return id
}

// ---- AI 서버의 사용자 테이블 ----

type UserRow = { id: string; login: string; name: string; passwordHash: string }

async function aiFetch(path: string, init?: RequestInit) {
  return fetch(`${AI}${path}`, { ...init, signal: AbortSignal.timeout(5000) })
}

const LOGIN_RE = /^[a-z0-9_]{4,20}$/

// AI 서버가 이상한 응답을 줬을 때 원인을 알려 준다. 404·405면 로그인 API가 없는 예전 AI 서버다.
function aiError(r: Response, what: string): { error: string; status: number } {
  console.warn(`${what}: AI 서버가 ${r.status}로 응답 (${AI}/api/store/users)`)
  if (r.status === 404 || r.status === 405)
    return { error: 'AI 서버가 예전 버전이에요. main을 받아 AI 서버를 다시 켜 주세요', status: 502 }
  return { error: `${what}하지 못했어요 (AI 서버 ${r.status})`, status: 502 }
}

export type AuthResult = { token: string; user: UserSummary } | { error: string; status: number }

export async function signup(input: { login?: string; password?: string; name?: string }): Promise<AuthResult> {
  const login = String(input.login ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  const name = String(input.name ?? '').trim()
  if (!LOGIN_RE.test(login)) return { error: '아이디는 영문 소문자·숫자·밑줄 4~20자예요', status: 400 }
  if (password.length < 4) return { error: '비밀번호는 4자 이상이에요', status: 400 }
  if (!name || name.length > 10) return { error: '이름은 1~10자예요', status: 400 }

  const id = `u_${randomBytes(6).toString('hex')}`
  let r: Response
  try {
    r = await aiFetch('/api/store/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, login, name, passwordHash: hashPassword(password) }),
    })
  } catch {
    return { error: 'AI 서버에 연결할 수 없어요. 잠시 뒤 다시 해 주세요', status: 503 }
  }
  if (r.status === 409) return { error: '이미 있는 아이디예요', status: 409 }
  if (!r.ok) return aiError(r, '가입')

  users.set(id, newUserState(id, login, name))
  return { token: issueToken(id), user: users.get(id)!.me }
}

export async function login(input: { login?: string; password?: string }): Promise<AuthResult> {
  const login = String(input.login ?? '').trim().toLowerCase()
  const password = String(input.password ?? '')
  let r: Response
  try {
    r = await aiFetch(`/api/store/users/${encodeURIComponent(login)}`)
  } catch {
    return { error: 'AI 서버에 연결할 수 없어요. 잠시 뒤 다시 해 주세요', status: 503 }
  }
  if (r.status === 404) return { error: '아이디나 비밀번호가 맞지 않아요', status: 401 }
  if (!r.ok) return aiError(r, '로그인')
  const row = (await r.json()) as UserRow
  if (!verifyPassword(password, row.passwordHash)) return { error: '아이디나 비밀번호가 맞지 않아요', status: 401 }

  // 상태가 아직 없으면(가입 직후 저장 실패 등) 새로 만든다
  if (!users.has(row.id)) users.set(row.id, newUserState(row.id, row.login, row.name))
  return { token: issueToken(row.id), user: users.get(row.id)!.me }
}

// ---- 미들웨어: 토큰 → 사용자 상태를 이 요청의 current()로 ----

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserState
  }
}

export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const id = token ? readToken(token) : null
  const state = id ? users.get(id) : undefined
  if (!state) return res.status(401).json({ error: '로그인이 필요해요' })
  req.user = state
  als.run(state, next)
}
