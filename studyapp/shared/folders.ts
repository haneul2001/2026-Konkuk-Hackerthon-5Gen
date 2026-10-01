import { folders } from './mock'
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

// 두 폴더 자리를 맞바꾼다. 목록 순서가 곧 화면 순서다.
export function swapFolders(a: string, b: string): Folder[] | null {
  const i = folders.findIndex((f) => f.id === a)
  const j = folders.findIndex((f) => f.id === b)
  if (i < 0 || j < 0) return null
  ;[folders[i], folders[j]] = [folders[j], folders[i]]
  return folders
}

// 중복과 빈 값은 버린다. 개념은 AI 서버에 있어서 여기서 존재 여부는 따지지 않는다.
function validIds(ids: string[]) {
  return [...new Set(ids.map(String))].filter(Boolean)
}
