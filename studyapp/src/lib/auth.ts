// 로그인 토큰. 브라우저에 두고 API 요청마다 Authorization 헤더로 보낸다.

const KEY = 'studyapp.token'

export function getToken() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setToken(token: string) {
  try {
    localStorage.setItem(KEY, token)
  } catch {
    // 사생활 보호 모드 등: 이번 세션 동안만 로그인 유지
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 무시
  }
}

export function authHeaders(): Record<string, string> {
  const t = getToken()
  return t ? { Authorization: `Bearer ${t}` } : {}
}

// 토큰이 더는 안 통할 때(만료·서버 초기화): 지우고 로그인 화면으로
export function onUnauthorized() {
  clearToken()
  if (!location.pathname.startsWith('/login')) location.replace('/login')
}
