import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Folder as FolderIcon, Plus, X } from 'lucide-react'
import type { Lecture, RecordingFolder } from '../../shared/types'
import { api } from '../api/client'
import { LIBRARY_NAME } from '../lib/names'
import { Button, ButtonLink, Card, ListSkeleton, Row, Sheet, Tag } from '../components/ui'
import { cn } from '../lib/cn'

// 녹음 폴더 안: 담긴 녹음 목록, 녹음 담기·빼기. 이름 변경·순서·삭제는 학습 탭 폴더 카드의 ⋮에서.
//  /library/recording-folders/ID?add=1  들어오자마자 녹음 고르기

export function RecordingFolderPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const picking = params.get('add') === '1'

  const [folders, setFolders] = useState<RecordingFolder[] | null>(null)
  const [lectures, setLectures] = useState<Lecture[] | null>(null)

  useEffect(() => {
    api.recordingFolders().then((f) => setFolders([...f]))
    api.lectures().then(setLectures)
  }, [])

  const folder = folders?.find((f) => f.id === id)

  async function saveLectures(lectureIds: string[]) {
    const updated = await api.updateRecordingFolder(id, { lectureIds })
    if (updated) setFolders((prev) => prev && prev.map((f) => (f.id === id ? { ...updated } : f)))
  }

  if (folders === null || lectures === null) return <ListSkeleton rows={3} />
  if (!folder) {
    return (
      <Card className="px-5 py-8 text-center">
        <p className="text-[15px] text-muted">폴더를 찾을 수 없어요.</p>
        <ButtonLink to="/library?tab=recordings" variant="primary" className="mt-4">
          {LIBRARY_NAME}으로
        </ButtonLink>
      </Card>
    )
  }

  // 지워진 녹음은 건너뛴다
  const inFolder = folder.lectureIds
    .map((lid) => lectures.find((l) => l.id === lid))
    .filter((l): l is Lecture => !!l)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-highlight-soft text-primary-deep" aria-hidden>
          <FolderIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-tight font-bold text-balance">{folder.name}</h1>
          <p className="mt-1 text-[13px] text-muted">녹음 {inFolder.length}개</p>
        </div>
      </div>

      <Button
        variant={inFolder.length ? 'secondary' : 'primary'}
        className="w-full"
        onClick={() => setParams({ add: '1' }, { replace: true })}
      >
        <Plus className="size-5" strokeWidth={2.5} aria-hidden />
        녹음 담기
      </Button>

      {inFolder.length === 0 ? (
        <Card className="px-5 py-8 text-center">
          <p className="text-[15px] text-muted">아직 담긴 녹음이 없어요.</p>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y-2 divide-line">
            {inFolder.map((l) => (
              <li key={l.id} className="flex items-center">
                <div className="min-w-0 flex-1">
                  <Row
                    to={`/lectures/${l.id}`}
                    title={l.title}
                    meta={<span className="tabular-nums">{l.durationMin}분 녹음</span>}
                    trailing={l.status === 'processing' ? <Tag tone="accent">요약 중</Tag> : null}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`${l.title} 폴더에서 빼기`}
                  onClick={() => saveLectures(folder.lectureIds.filter((x) => x !== l.id))}
                  className="mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {picking && (
        <LecturePicker
          lectures={lectures}
          selected={folder.lectureIds}
          onClose={() => setParams({}, { replace: true })}
          onSave={async (ids) => {
            await saveLectures(ids)
            setParams({}, { replace: true })
          }}
        />
      )}
    </div>
  )
}

function LecturePicker({
  lectures,
  selected,
  onClose,
  onSave,
}: {
  lectures: Lecture[]
  selected: string[]
  onClose: () => void
  onSave: (ids: string[]) => Promise<void>
}) {
  const [picked, setPicked] = useState(() => new Set(selected))
  const [busy, setBusy] = useState(false)

  return (
    <Sheet title="녹음 담기" onClose={onClose}>
      {lectures.length === 0 ? (
        <p className="text-[15px] text-muted">아직 올린 녹음이 없어요.</p>
      ) : (
        <div className="max-h-[50dvh] space-y-2 overflow-y-auto">
          {lectures.map((l) => (
            <label
              key={l.id}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-3',
                picked.has(l.id) ? 'border-highlight-deep bg-highlight-soft' : 'border-line bg-surface',
              )}
            >
              <input
                type="checkbox"
                checked={picked.has(l.id)}
                onChange={(e) => {
                  const next = new Set(picked)
                  if (e.target.checked) next.add(l.id)
                  else next.delete(l.id)
                  setPicked(next)
                }}
                className="size-4 cursor-pointer accent-highlight-deep"
              />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold">{l.title}</span>
                <span className="block text-[12px] text-muted tabular-nums">{l.durationMin}분 녹음</span>
              </span>
            </label>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            // 원래 순서를 지키고, 새로 고른 건 뒤에 붙인다
            const keep = selected.filter((x) => picked.has(x))
            const added = lectures.map((l) => l.id).filter((x) => picked.has(x) && !selected.includes(x))
            await onSave([...keep, ...added])
          }}
        >
          {busy ? '저장 중…' : `${picked.size}개 담기`}
        </Button>
      </div>
    </Sheet>
  )
}
