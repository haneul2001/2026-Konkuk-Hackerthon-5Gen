import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Check, Folder as FolderIcon, Layers, Pencil, Plus, Search, X } from 'lucide-react'
import type { Concept, Folder } from '../../shared/types'
import { api } from '../api/client'
import {
  Button,
  ButtonLink,
  Card,
  Field,
  ListSkeleton,
  Sheet,
  Tag,
} from '../components/ui'
import { masteryLabel } from '../lib/mastery'
import { LIBRARY_NAME } from '../lib/names'
import { cn } from '../lib/cn'

// 개념 폴더 상세: 담긴 개념 목록, 이 폴더로 문제 풀기, 개념 담기(?add=1), 이름 바꾸기·삭제.

export function FolderPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const adding = params.get('add') === '1'
  const navigate = useNavigate()

  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [concepts, setConcepts] = useState<Concept[] | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    api.folders().then((f) => setFolders([...f]))
    api.concepts().then(setConcepts)
  }, [])

  const folder = folders?.find((f) => f.id === id)

  async function save(patch: { name?: string; conceptIds?: string[] }) {
    const updated = await api.updateFolder(id, patch)
    if (updated) setFolders((prev) => prev!.map((f) => (f.id === id ? { ...updated } : f)))
  }

  if (folders === null || concepts === null) return <ListSkeleton rows={3} />
  if (!folder) {
    return (
      <Card className="px-5 py-8 text-center">
        <p className="text-[15px] text-muted">폴더를 찾을 수 없어요.</p>
        <ButtonLink to="/library?tab=concepts" variant="primary" className="mt-4">
          {LIBRARY_NAME}로
        </ButtonLink>
      </Card>
    )
  }

  if (adding) {
    return (
      <ConceptPicker
        folder={folder}
        folders={folders}
        concepts={concepts}
        onCancel={() => setParams({}, { replace: true })}
        onSave={async (ids) => {
          await save({ conceptIds: ids })
          setParams({}, { replace: true })
        }}
      />
    )
  }

  const inFolder = folder.conceptIds
    .map((cid) => concepts.find((c) => c.id === cid))
    .filter((c): c is Concept => !!c)
  const tally = { mastered: 0, learning: 0, new: 0 }
  for (const c of inFolder) tally[c.mastery]++

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary" aria-hidden>
          <FolderIcon className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-tight font-bold text-balance">{folder.name}</h1>
          <p className="mt-1 text-[13px] text-muted">개념 {inFolder.length}개</p>
        </div>
        <button
          type="button"
          aria-label="폴더 편집"
          onClick={() => setEditing(true)}
          className="-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Pencil className="size-5" aria-hidden />
        </button>
      </div>

      {inFolder.length > 0 && (
        <div>
          <div className="flex h-3 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="bg-success" style={{ flexGrow: tally.mastered }} />
            <div className="bg-bright" style={{ flexGrow: tally.learning }} />
            <div className="bg-accent" style={{ flexGrow: tally.new }} />
          </div>
          <p className="mt-2 flex gap-3 text-[13px] text-muted tabular-nums">
            <span>외움 {tally.mastered}</span>
            <span>익히는 중 {tally.learning}</span>
            <span>새 개념 {tally.new}</span>
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {inFolder.length > 0 ? (
          <>
            <ButtonLink to={`/quiz?folder=${folder.id}`} variant="primary" className="w-full">
              이 폴더로 문제 풀기
            </ButtonLink>
            <ButtonLink to={`/flashcards?folder=${folder.id}`} className="w-full">
              <Layers className="size-5" aria-hidden />
              플래시카드로 외우기
            </ButtonLink>
          </>
        ) : null}
        <Button
          variant={inFolder.length ? 'secondary' : 'primary'}
          className="w-full"
          onClick={() => setParams({ add: '1' }, { replace: true })}
        >
          <Plus className="size-5" strokeWidth={2.5} aria-hidden />
          개념 담기
        </Button>
      </div>

      {inFolder.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-line-strong px-5 py-8 text-center text-[15px] text-pretty text-muted">
          아직 담긴 개념이 없어요. 개념을 담으면 이 폴더의 개념으로만 문제가 나와요.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {inFolder.map((c) => (
            <li key={c.id}>
              <Card className="flex items-start gap-2 py-3.5 pr-2 pl-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[16px] font-bold">{c.term}</p>
                    <Tag tone={masteryLabel[c.mastery].tone}>{masteryLabel[c.mastery].text}</Tag>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[14px] leading-relaxed text-muted">{c.summary}</p>
                  <p className="mt-2 truncate text-xs font-medium text-muted">
                    {c.lectureTitle} 강의
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`${c.term} 폴더에서 빼기`}
                  onClick={() => save({ conceptIds: folder.conceptIds.filter((x) => x !== c.id) })}
                  className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <EditSheet
          folder={folder}
          onClose={() => setEditing(false)}
          onRename={async (name) => {
            await save({ name })
            setEditing(false)
          }}
          onDelete={async () => {
            await api.deleteFolder(folder.id)
            navigate('/library?tab=concepts', { replace: true })
          }}
        />
      )}
    </div>
  )
}

function EditSheet({
  folder,
  onClose,
  onRename,
  onDelete,
}: {
  folder: Folder
  onClose: () => void
  onRename: (name: string) => void
  onDelete: () => void
}) {
  const [name, setName] = useState(folder.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <Sheet title="폴더 편집" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim()) onRename(name)
        }}
        className="space-y-4"
      >
        <Field
          label="폴더 이름"
          id="folder-name"
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="primary" className="w-full" disabled={!name.trim()}>
          저장
        </Button>
      </form>
      <div className="mt-6 border-t-2 border-line pt-4">
        {confirmDelete ? (
          <div className="space-y-2.5">
            <p className="text-[14px] text-muted">
              폴더만 지워지고 개념은 {LIBRARY_NAME}에 그대로 남아요.
            </p>
            <Button variant="danger" className="w-full" onClick={onDelete}>
              폴더 삭제
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="h-11 w-full cursor-pointer rounded-xl text-[15px] font-semibold text-danger focus-visible:outline-2 focus-visible:outline-primary"
          >
            이 폴더 삭제하기
          </button>
        )}
      </div>
    </Sheet>
  )
}

// 개념 담기: 전체 개념에서 골라 이 폴더의 목록을 통째로 바꾼다.
function ConceptPicker({
  folder,
  folders,
  concepts,
  onCancel,
  onSave,
}: {
  folder: Folder
  folders: Folder[]
  concepts: Concept[]
  onCancel: () => void
  onSave: (ids: string[]) => void
}) {
  const [picked, setPicked] = useState(() => new Set(folder.conceptIds))
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)

  // 어느 폴더에도 안 담긴 개념. 새로 녹음해서 생긴 개념은 여기서 시작한다.
  const filed = useMemo(() => new Set(folders.flatMap((f) => f.conceptIds)), [folders])
  const needle = q.trim().toLowerCase()
  const shown = concepts.filter(
    (c) => !needle || `${c.term} ${c.summary} ${c.course}`.toLowerCase().includes(needle),
  )
  const byCourse = new Map<string, Concept[]>()
  for (const c of shown) byCourse.set(c.course, [...(byCourse.get(c.course) ?? []), c])

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-muted">{folder.name}</p>
          <h1 className="text-[24px] leading-tight font-bold">개념 담기</h1>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="개념 찾기"
            aria-label="개념 찾기"
            className="h-12 w-full rounded-xl border-2 border-line bg-surface pr-3.5 pl-11 text-base placeholder:text-muted/70 focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-5 space-y-5 pb-4">
        {[...byCourse].map(([course, list]) => (
          <section key={course}>
            <h2 className="mb-2 text-sm font-bold text-muted">{course}</h2>
            <Card>
              <ul className="divide-y-2 divide-line">
                {list.map((c) => {
                  const on = picked.has(c.id)
                  return (
                    <li key={c.id}>
                      <label className="flex min-h-16 cursor-pointer items-center gap-3 px-4 py-3 active:bg-bg has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-primary">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={() => toggle(c.id)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden
                          className={cn(
                            'flex size-6 shrink-0 items-center justify-center rounded-md border-2',
                            on ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface',
                          )}
                        >
                          {on && <Check className="size-4" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[15px] font-semibold">{c.term}</span>
                            {!filed.has(c.id) && <Tag tone="accent">미분류</Tag>}
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] text-muted">
                            {c.lectureTitle} 강의
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </Card>
          </section>
        ))}
        {shown.length === 0 && (
          <p className="py-8 text-center text-[15px] text-muted">찾는 개념이 없어요.</p>
        )}
      </div>

      <div className="sticky bottom-0 -mx-5 mt-auto grid grid-cols-[1fr_2fr] gap-2.5 bg-bg px-5 pt-3 pb-4">
        <Button onClick={onCancel}>취소</Button>
        <Button
          variant="primary"
          disabled={saving}
          onClick={() => {
            setSaving(true)
            onSave([...picked])
          }}
        >
          {picked.size}개 담기
        </Button>
      </div>
    </div>
  )
}
