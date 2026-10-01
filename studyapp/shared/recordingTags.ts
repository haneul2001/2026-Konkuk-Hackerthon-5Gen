import { current } from './session'

// 녹음에 다는 내 태그. 과목과 달리 사용자가 마음대로 만들고 지운다. 사용자별이다.
// 서버와 (서버가 꺼져 있을 때) 프론트가 같은 코드를 쓴다.

export type RecordingTagState = {
  tags: string[] // 내가 만든 태그 (만든 순서)
  byLecture: Record<string, string[]> // 녹음 id → 달린 태그
}

export function tagState(): RecordingTagState {
  const { recordingTagList, lectureTags } = current()
  return { tags: [...recordingTagList], byLecture: structuredClone(lectureTags) }
}

// 공백을 먼저 떼고 앞의 '#'을 뗀 뒤 15자까지
export function cleanTag(name: string) {
  return String(name ?? '').replace(/\s+/g, '').replace(/^#+/, '').slice(0, 15)
}

export function addTag(name: string): RecordingTagState | { error: string } {
  const { recordingTagList } = current()
  const tag = cleanTag(name)
  if (!tag) return { error: '태그 이름을 써 주세요' }
  if (recordingTagList.includes(tag)) return { error: '이미 있는 태그예요' }
  if (recordingTagList.length >= 20) return { error: '태그는 20개까지 만들 수 있어요' }
  recordingTagList.push(tag)
  return tagState()
}

// 태그를 지우면 달려 있던 녹음에서도 빠진다.
export function removeTag(name: string): RecordingTagState {
  const { recordingTagList, lectureTags } = current()
  const i = recordingTagList.indexOf(name)
  if (i >= 0) recordingTagList.splice(i, 1)
  for (const id of Object.keys(lectureTags)) {
    lectureTags[id] = lectureTags[id].filter((t) => t !== name)
    if (lectureTags[id].length === 0) delete lectureTags[id]
  }
  return tagState()
}

// 녹음 하나의 태그를 통째로 바꾼다. 처음 보는 태그는 목록에도 추가한다.
export function setLectureTags(lectureId: string, tags: string[]): RecordingTagState {
  const { recordingTagList, lectureTags } = current()
  const clean = [...new Set(tags.map(cleanTag).filter(Boolean))]
  for (const t of clean) if (!recordingTagList.includes(t)) recordingTagList.push(t)
  if (clean.length) lectureTags[lectureId] = clean
  else delete lectureTags[lectureId]
  return tagState()
}
