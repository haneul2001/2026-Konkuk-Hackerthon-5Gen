import { current } from './session'
import type { RecordingFolder } from './types'

// 녹음 폴더 만들기·수정·삭제·순서 바꾸기. 개념 폴더(folders.ts)와 같은 방식이고 사용자별이다.
// 서버와 (서버가 꺼져 있을 때) 프론트가 같은 코드를 쓴다.

export function createRecordingFolder(name: string, lectureIds: string[] = []): RecordingFolder {
  const folder: RecordingFolder = {
    id: `rfd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim().slice(0, 30) || '새 폴더',
    lectureIds: uniq(lectureIds),
    createdAt: new Date().toISOString().slice(0, 10),
  }
  current().recordingFolders.push(folder)
  return folder
}

export function updateRecordingFolder(
  id: string,
  patch: { name?: string; lectureIds?: string[] },
): RecordingFolder | null {
  const folder = current().recordingFolders.find((f) => f.id === id)
  if (!folder) return null
  if (patch.name !== undefined) folder.name = patch.name.trim().slice(0, 30) || folder.name
  if (patch.lectureIds !== undefined) folder.lectureIds = uniq(patch.lectureIds)
  return folder
}

export function deleteRecordingFolder(id: string): boolean {
  const { recordingFolders } = current()
  const i = recordingFolders.findIndex((f) => f.id === id)
  if (i < 0) return false
  recordingFolders.splice(i, 1)
  return true
}

// 두 폴더 자리를 맞바꾼다. 목록 순서가 곧 화면 순서다.
export function swapRecordingFolders(a: string, b: string): RecordingFolder[] | null {
  const { recordingFolders } = current()
  const i = recordingFolders.findIndex((f) => f.id === a)
  const j = recordingFolders.findIndex((f) => f.id === b)
  if (i < 0 || j < 0) return null
  ;[recordingFolders[i], recordingFolders[j]] = [recordingFolders[j], recordingFolders[i]]
  return recordingFolders
}

// 녹음은 AI 서버에 있어서 여기서 존재 여부는 따지지 않는다. 중복·빈 값만 버린다.
function uniq(ids: string[]) {
  return [...new Set(ids.map(String))].filter(Boolean)
}
