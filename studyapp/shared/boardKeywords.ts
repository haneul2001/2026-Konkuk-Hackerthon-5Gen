import { cleanTag } from './recordingTags'
import { current } from './session'

// 게시판 위 키워드(태그 필터) 줄. 사용자가 직접 넣고 뺀다. 사용자별이고 게시판 세 곳이 같은 목록을 쓴다.
// 한 번도 고치지 않았으면(null) 화면이 그 게시판에서 많이 쓰인 태그를 대신 보여 준다.

export const KEYWORD_MAX = 20

export function getKeywords(): string[] | null {
  const k = current().boardKeywords
  return k ? [...k] : null
}

// 목록 전체를 바꾼다(추가·삭제 모두 화면이 새 목록을 보낸다)
export function setKeywords(list: unknown): string[] | { error: string } {
  if (!Array.isArray(list)) return { error: '키워드 목록이 아니에요' }
  const clean = [...new Set(list.map((t) => cleanTag(String(t))).filter(Boolean))]
  if (clean.length > KEYWORD_MAX) return { error: `키워드는 ${KEYWORD_MAX}개까지예요` }
  current().boardKeywords = clean
  return [...clean]
}
