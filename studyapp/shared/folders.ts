import { concepts, folders } from './mock'
import type { Folder } from './types'

// 개념 폴더 만들기·수정·삭제. 서버와 (서버가 꺼져 있을 때) 프론트가 같은 코드를 쓴다.

export function createFolder(name: string, conceptIds: string[] = []): Folder {
  const folder: Folder = {
    id: `fld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 30) || '새 폴더',
    conceptIds: validIds(conceptIds),
    createdAt: new Date().toISOString().slice(0, 10),
  }
  folders.push(folder)
  return folder
}

export function updateFolder(
  id: string,
  patch: { name?: string; conceptIds?: string[] },
): Folder | null {
  const folder = folders.find((f) => f.id === id)
  if (!folder) return null
  if (patch.name !== undefined) folder.name = patch.name.trim().slice(0, 30) || folder.name
  if (patch.conceptIds !== undefined) folder.conceptIds = validIds(patch.conceptIds)
  return folder
}

export function deleteFolder(id: string): boolean {
  const i = folders.findIndex((f) => f.id === id)
  if (i < 0) return false
  folders.splice(i, 1)
  return true
}

// 없는 개념 id와 중복은 버린다.
function validIds(ids: string[]) {
  const known = new Set(concepts.map((c) => c.id))
  return [...new Set(ids)].filter((id) => known.has(id))
}
