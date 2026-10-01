import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeftRight,
  Check,
  ChevronRight,
  EllipsisVertical,
  Folder as FolderIcon,
  FolderPlus,
  Layers,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { Concept, Folder, Lecture, RecordingFolder } from '../../shared/types'
import { cleanTag, type RecordingTagState } from '../../shared/recordingTags'
import { api } from '../api/client'
import { RecordingCalendar } from '../components/RecordingCalendar'
import { masteryLabel } from '../lib/mastery'
import { LIBRARY_NAME } from '../lib/names'
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  ListSkeleton,
  PageTitle,
  Row,
  Segmented,
  Sheet,
  Field,
  Tag,
} from '../components/ui'
import { cn } from '../lib/cn'

// 학습 탭: 요약에서 뽑힌 개념 모음(기본) · 녹음 캘린더 · 올린 녹음본 보관함.
// 개념과 녹음 모두 사용자가 만든 폴더에 담는다. 개념 폴더로는 문제를 푼다.
// 탭·과목·태그·검색어·페이지는 주소에 남겨서 뒤로 가기·공유 시 그대로 돌아오게 한다.
// 녹음본은 최신순, 10개씩 페이지로 나눈다.

type Tab = 'concepts' | 'calendar' | 'recordings'

const PAGE_SIZE = 10
const CONCEPT_PAGE_SIZE = 8 // 전체 개념은 카드가 커서 8개씩

// 폴더 칸에서 쓰는 서버 동작. 개념 폴더와 녹음 폴더가 같은 화면을 쓴다.
type FolderOps<T> = {
  rename: (id: string, name: string) => Promise<T | null>
  swap: (a: string, b: string) => Promise<T[] | null>
  remove: (id: string) => Promise<unknown>
}

const conceptFolderOps: FolderOps<Folder> = {
  rename: (id, name) => api.updateFolder(id, { name }),
  swap: api.swapFolders,
  remove: api.deleteFolder,
}

const recordingFolderOps: FolderOps<RecordingFolder> = {
  rename: (id, name) => api.updateRecordingFolder(id, { name }),
  swap: api.swapRecordingFolders,
  remove: api.deleteRecordingFolder,
}

export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'recordings' || tabParam === 'calendar' ? tabParam : 'concepts'
  const course = params.get('course') ?? ''
  const tag = tab === 'recordings' ? (params.get('tag') ?? '') : '' // 내가 만든 녹음 태그
  const page = Math.max(1, Number(params.get('page')) || 1)
  const urlQ = params.get('q') ?? ''
  // 입력창은 로컬 상태로 둔다. URL 값을 바로 value로 쓰면 라우터 갱신이 한 박자 늦어 한글 조합이 깨진다.
  const [q, setQ] = useState(urlQ)

  const [lectures, setLectures] = useState<Lecture[] | null>(null)
  const [concepts, setConcepts] = useState<Concept[] | null>(null)
  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [recFolders, setRecFolders] = useState<RecordingFolder[] | null>(null)
  const [recTags, setRecTags] = useState<RecordingTagState | null>(null)
  const [managingTags, setManagingTags] = useState(false)
  const [creating, setCreating] = useState<Tab | null>(null) // 어느 쪽 폴더를 만드는지
  const [filing, setFiling] = useState<Lecture | null>(null) // '폴더에 담기' 시트를 연 녹음
  const navigate = useNavigate()

  useEffect(() => {
    api.lectures().then(setLectures)
    api.concepts().then(setConcepts)
    api.folders().then(setFolders)
    api.recordingFolders().then(setRecFolders)
    api.recordingTags().then(setRecTags)
  }, [])

  const unfiled = useMemo(() => {
    if (!concepts || !folders) return 0
    const filed = new Set(folders.flatMap((f) => f.conceptIds))
    return concepts.filter((c) => !filed.has(c.id)).length
  }, [concepts, folders])

  // 페이지는 넘겨줄 때만 남는다: 탭·과목·태그·검색어가 바뀌면 1페이지로
  function update(next: Partial<{ tab: Tab; course: string; tag: string; q: string; page: number }>) {
    const merged = { tab, course, tag, q, ...next }
    const p: Record<string, string> = {}
    if (merged.tab !== 'concepts') p.tab = merged.tab
    if (merged.course) p.course = merged.course
    if (merged.tag && merged.tab === 'recordings') p.tag = merged.tag
    if (merged.q) p.q = merged.q
    if (merged.page && merged.page > 1) p.page = String(merged.page)
    setParams(p, { replace: true })
  }

  const courses = useMemo(
    () => [...new Set((lectures ?? []).map((l) => l.course))],
    [lectures],
  )

  const needle = q.trim().toLowerCase()
  const tagsOf = (id: string) => recTags?.byLecture[id] ?? []
  const filteredLectures = (lectures ?? [])
    .filter(
      (l) =>
        (!course || l.course === course) &&
        (!tag || tagsOf(l.id).includes(tag)) &&
        (!needle || `${l.title} ${l.course} ${tagsOf(l.id).join(' ')}`.toLowerCase().includes(needle)),
    )
    // 최신순: 녹음한 날이 늦은 것부터
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  const pageCount = Math.max(1, Math.ceil(filteredLectures.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const shownLectures = filteredLectures.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const cardCount = (concepts ?? []).filter((c) => !course || c.course === course).length
  const filteredConcepts = (concepts ?? []).filter(
    (c) =>
      (!course || c.course === course) &&
      (!needle || `${c.term} ${c.summary} ${c.course}`.toLowerCase().includes(needle)),
  )
  const conceptPageCount = Math.max(1, Math.ceil(filteredConcepts.length / CONCEPT_PAGE_SIZE))
  const conceptPage = Math.min(page, conceptPageCount)
  const shownConcepts = filteredConcepts.slice(
    (conceptPage - 1) * CONCEPT_PAGE_SIZE,
    conceptPage * CONCEPT_PAGE_SIZE,
  )

  return (
    <div className="space-y-5">
      <PageTitle
        title={LIBRARY_NAME}
        sub={
          lectures && concepts
            ? `개념 ${concepts.length}개 · 녹음 ${lectures.length}개`
            : '정리된 개념과 녹음본이 모이는 곳'
        }
      />

      {/* 검색 (캘린더에선 없음) */}
      <div className={cn('relative', tab === 'calendar' && 'hidden')}>
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            update({ q: e.target.value })
          }}
          placeholder={tab === 'concepts' ? '개념 이름이나 내용으로 찾기' : '강의 제목으로 찾기'}
          aria-label={`${LIBRARY_NAME}에서 찾기`}
          className="h-12 w-full rounded-xl border-2 border-line bg-surface pr-3.5 pl-11 text-base placeholder:text-muted/70 focus:border-primary focus:outline-none"
        />
      </div>

      <Segmented
        label={`${LIBRARY_NAME} 보기`}
        value={tab}
        options={[
          ['concepts', '개념'],
          ['calendar', '캘린더'],
          ['recordings', '녹음본'],
        ]}
        onChange={(t) => update({ tab: t })}
      />

      {tab === 'calendar' ? (
        lectures === null ? (
          <ListSkeleton rows={4} />
        ) : (
          <RecordingCalendar
            lectures={lectures}
            onMoved={(updated) => setLectures((prev) => prev && prev.map((l) => (l.id === updated.id ? updated : l)))}
          />
        )
      ) : (
        <>
          {/* 내 폴더: 개념 탭은 개념 폴더, 녹음본 탭은 녹음 폴더 */}
          <section className="space-y-3" aria-labelledby="folders-title">
            <h2 id="folders-title" className="text-[17px] font-bold">
              내 폴더
            </h2>
            {tab === 'concepts' ? (
              folders === null ? (
                <ListSkeleton rows={1} />
              ) : (
                <FolderGrid
                  key="concepts"
                  folders={folders}
                  unit="개념"
                  countOf={(f) => f.conceptIds.length}
                  linkOf={(f) => `/library/folders/${f.id}`}
                  ops={conceptFolderOps}
                  onChange={(u) => setFolders((prev) => prev && u(prev))}
                  onCreate={() => setCreating('concepts')}
                />
              )
            ) : recFolders === null ? (
              <ListSkeleton rows={1} />
            ) : (
              <FolderGrid
                key="recordings"
                folders={recFolders}
                unit="녹음"
                countOf={(f) => f.lectureIds.length}
                linkOf={(f) => `/library/recording-folders/${f.id}`}
                ops={recordingFolderOps}
                onChange={(u) => setRecFolders((prev) => prev && u(prev))}
                onCreate={() => setCreating('recordings')}
              />
            )}
          </section>

          <div className="flex items-baseline justify-between pt-1">
            <h2 className="text-[17px] font-bold">{tab === 'concepts' ? '전체 개념' : '전체 녹음'}</h2>
            {tab === 'concepts' && unfiled > 0 && (
              <span className="text-[13px] text-accent-ink">폴더에 안 담긴 개념 {unfiled}개</span>
            )}
          </div>

          {/* 과목·태그 필터. 넘치면 다음 줄로. 한 번에 하나만 고른다 */}
          <div className="flex flex-wrap gap-2" role="group" aria-label="과목·태그">
            {['', ...courses].map((c) => (
              <Chip
                key={c || 'all'}
                label={c || '전체'}
                active={course === c && !tag}
                onClick={() => update({ course: c, tag: '' })}
              />
            ))}
            {tab === 'recordings' &&
              recTags?.tags.map((t) => (
                <Chip key={`#${t}`} label={`#${t}`} active={tag === t} onClick={() => update({ tag: t, course: '' })} />
              ))}
            {tab === 'recordings' && (
              <button
                type="button"
                onClick={() => setManagingTags(true)}
                className="flex h-11 shrink-0 cursor-pointer items-center gap-1 rounded-full border-2 border-dashed border-line-strong px-4 text-sm font-semibold text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <Plus className="size-4" strokeWidth={2.5} aria-hidden />
                태그
              </button>
            )}
          </div>

          {/* 플래시카드 진입: 지금 고른 과목의 개념을 넘겨 본다 */}
          {tab === 'concepts' && cardCount > 0 && (
            <ButtonLink
              to={course ? `/flashcards?course=${encodeURIComponent(course)}` : '/flashcards'}
              variant="primary"
              className="w-full"
            >
              <Layers className="size-5 shrink-0" aria-hidden />
              {/* 과목 이름이 길어도 한 줄: 이름은 말줄임, 장 수는 꺾이지 않게 */}
              <span className="min-w-0 truncate">{course || '전체'} 플래시카드로 외우기</span>
              <span className="shrink-0 whitespace-nowrap tabular-nums opacity-80">{cardCount}장</span>
            </ButtonLink>
          )}

          {tab === 'recordings' ? (
            lectures === null ? (
              <ListSkeleton rows={4} />
            ) : lectures.length === 0 ? (
              <EmptyState
                message="아직 올린 녹음이 없어요."
                action={{ label: '첫 강의 녹음하기', to: '/record' }}
              />
            ) : shownLectures.length === 0 ? (
              <NoMatch />
            ) : (
              <>
                <Card>
                  <ul className="divide-y-2 divide-line">
                    {shownLectures.map((l) => {
                      const filed = (recFolders ?? []).some((f) => f.lectureIds.includes(l.id))
                      const myTags = tagsOf(l.id)
                      return (
                        // 줄 전체는 강의로 가는 링크, 오른쪽 버튼은 따로(링크 안에 버튼을 넣지 않는다)
                        <li key={l.id} className="flex items-center">
                          <div className="min-w-0 flex-1">
                            <Row
                              to={`/lectures/${l.id}`}
                              title={l.title}
                              meta={
                                <span className="tabular-nums">
                                  {l.durationMin}분 녹음
                                  {l.status === 'ready' && ` · 개념 ${countFor(concepts, l.id)}개`}
                                  {myTags.length > 0 && (
                                    <span className="text-muted"> · {myTags.map((t) => `#${t}`).join(' ')}</span>
                                  )}
                                </span>
                              }
                              trailing={
                                <>
                                  {l.status === 'processing' && <Tag tone="accent">요약 중</Tag>}
                                  {l.status === 'failed' && <Tag tone="danger">처리 실패</Tag>}
                                  {filed && <Tag tone="primary">담김</Tag>}
                                </>
                              }
                            />
                          </div>
                          {l.status !== 'failed' && (
                            <button
                              type="button"
                              aria-label={`${l.title} 폴더·태그 정리`}
                              onClick={() => setFiling(l)}
                              className="mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              <FolderPlus className="size-5" aria-hidden />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </Card>
                {pageCount > 1 && (
                  <Pager
                    page={currentPage}
                    count={pageCount}
                    onGo={(n) => {
                      update({ page: n })
                      document.querySelector('main')?.scrollTo({ top: 0 })
                    }}
                  />
                )}
              </>
            )
          ) : concepts === null ? (
            <ListSkeleton rows={4} />
          ) : shownConcepts.length === 0 ? (
            <NoMatch />
          ) : (
            <>
              <ul className="space-y-2.5">
                {shownConcepts.map((c) => (
                  <li key={c.id}>
                    <Link
                      to={`/lectures/${c.lectureId}?tab=text`}
                      className="press block cursor-pointer rounded-2xl border-2 border-line bg-surface p-4 shadow-[0_3px_0_var(--color-line)] active:shadow-[0_1px_0_var(--color-line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[16px] font-bold">{c.term}</p>
                        <Tag tone={masteryLabel[c.mastery].tone}>{masteryLabel[c.mastery].text}</Tag>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[14px] leading-relaxed text-pretty text-muted">
                        {c.summary}
                      </p>
                      <p className="mt-2.5 truncate text-xs font-medium text-muted">
                        {c.lectureTitle} 강의
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              {conceptPageCount > 1 && (
                <Pager
                  page={conceptPage}
                  count={conceptPageCount}
                  onGo={(n) => {
                    update({ page: n })
                    document.querySelector('main')?.scrollTo({ top: 0 })
                  }}
                />
              )}
            </>
          )}

        </>
      )}

      {filing && recFolders && recTags && (
        <FileLectureSheet
          lecture={filing}
          folders={recFolders}
          tagState={recTags}
          onClose={() => setFiling(null)}
          onSaved={(changed, tags) => {
            setRecFolders((prev) => prev && prev.map((f) => changed.find((c) => c.id === f.id) ?? f))
            if (tags) setRecTags(tags)
            setFiling(null)
          }}
          onCreate={() => {
            setFiling(null)
            setCreating('recordings')
          }}
        />
      )}

      {managingTags && recTags && (
        <TagManagerSheet
          tags={recTags.tags}
          onChange={(s) => {
            setRecTags(s)
            if (tag && !s.tags.includes(tag)) update({ tag: '' }) // 보고 있던 태그를 지웠으면 전체로
          }}
          onClose={() => setManagingTags(false)}
        />
      )}

      {creating && (
        <NewFolderSheet
          kind={creating}
          onClose={() => setCreating(null)}
          onCreate={async (name) => {
            if (creating === 'concepts') {
              const folder = await api.createFolder(name)
              navigate(`/library/folders/${folder.id}?add=1`)
            } else {
              const folder = await api.createRecordingFolder(name)
              navigate(`/library/recording-folders/${folder.id}?add=1`)
            }
          }}
        />
      )}
    </div>
  )
}

// 내 폴더 칸. 카드 오른쪽 위 ⋮ → 이름 변경 / 순서 이동 / 삭제.
// 순서 이동: 모든 폴더에 동그라미가 생기고, 다른 폴더를 누르면 두 폴더 자리가 바뀐다.
// 삭제: 바로 목록에서 빼고 아래에 10초 동안 '되돌리기' 배너를 띄운다.
//       배너가 사라질 때(10초 · X · 화면 이동) 실제로 지운다.
function FolderGrid<T extends { id: string; name: string }>({
  folders,
  unit,
  countOf,
  linkOf,
  ops,
  onChange,
  onCreate,
}: {
  folders: T[]
  unit: string // 카드에 '개념 3개' / '녹음 2개'
  countOf: (f: T) => number
  linkOf: (f: T) => string
  ops: FolderOps<T>
  // 항상 최신 목록 기준으로 바꾼다(10초 뒤 삭제 확정이 그 사이 순서 이동을 덮지 않게)
  onChange: (update: (prev: T[]) => T[]) => void
  onCreate: () => void
}) {
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null) // 자리를 옮길 폴더
  const [renaming, setRenaming] = useState<T | null>(null)
  const [pending, setPending] = useState<T | null>(null) // 지우기 직전(되돌리기 가능)
  const pendingRef = useRef<T | null>(null)
  pendingRef.current = pending

  function commitDelete(folder: T) {
    ops.remove(folder.id)
    onChange((prev) => prev.filter((x) => x.id !== folder.id))
    setPending((p) => (p?.id === folder.id ? null : p))
  }

  function startDelete(folder: T) {
    if (pending) commitDelete(pending) // 앞서 지운 건 확정
    setPending(folder)
  }

  // 10초 지나면 확정
  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => commitDelete(pending), UNDO_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  // 화면을 떠나면(탭을 바꿔도) 확정
  useEffect(
    () => () => {
      if (pendingRef.current) ops.remove(pendingRef.current.id)
    },
    [ops],
  )

  const shown = folders.filter((f) => f.id !== pending?.id)

  async function swapWith(target: string) {
    if (!moving || target === moving) return setMoving(null)
    const list = await ops.swap(moving, target)
    if (list) onChange(() => [...list])
    setMoving(null)
  }

  const card =
    'flex min-h-24 w-full flex-col justify-between rounded-2xl border-2 bg-surface p-3.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

  const menu = (f: T) => [
    { label: '이름 변경', icon: Pencil, onClick: () => setRenaming(f) },
    { label: '순서 이동', icon: ArrowLeftRight, onClick: () => setMoving(f.id), disabled: shown.length < 2 },
    { label: '삭제', icon: Trash2, onClick: () => startDelete(f), danger: true },
  ]

  return (
    <>
      {moving && (
        <div
          role="status"
          className="flex items-center justify-between rounded-xl bg-highlight-soft px-3.5 py-2 text-[14px] font-semibold text-primary-deep"
        >
          자리를 바꿀 폴더를 누르세요
          <button
            type="button"
            onClick={() => setMoving(null)}
            className="-my-1 -mr-1.5 h-9 cursor-pointer rounded-lg px-2 text-muted active:bg-surface"
          >
            취소
          </button>
        </div>
      )}

      {shown.length === 0 && !moving ? (
        // 폴더가 하나도 없을 때: 빈 점선 칸 대신 무엇을 하는 곳인지 알려 주는 카드
        <div className="flex items-center gap-3.5 rounded-2xl border-2 border-line bg-surface p-4 shadow-[0_3px_0_var(--color-line)]">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-highlight-soft text-primary-deep">
            <FolderIcon className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold">아직 폴더가 없어요</p>
            <p className="mt-0.5 text-[13px] text-pretty text-muted">과목·시험 범위별로 {unit}을 모아 보세요.</p>
          </div>
          <Button variant="inverse" className="h-10 shrink-0 px-3.5 text-[14px]" onClick={onCreate}>
            <FolderPlus className="size-4" aria-hidden />
            만들기
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5">
          {shown.map((f) =>
            moving ? (
              // 순서 이동 중: 카드 전체가 고르는 버튼
              <button
                key={f.id}
                type="button"
                aria-pressed={f.id === moving}
                aria-label={f.id === moving ? `${f.name} (옮길 폴더, 누르면 취소)` : `${f.name} 폴더와 자리 바꾸기`}
                onClick={() => swapWith(f.id)}
                className={cn(
                  card,
                  'relative cursor-pointer',
                  f.id === moving
                    ? 'border-primary shadow-[0_3px_0_var(--color-primary)]'
                    : 'border-line shadow-[0_3px_0_var(--color-line)]',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-3 right-3 flex size-6 items-center justify-center rounded-full border-2',
                    f.id === moving ? 'border-highlight-deep bg-highlight text-primary-deep' : 'border-line-strong bg-surface',
                  )}
                >
                  {f.id === moving && <Check className="size-4" strokeWidth={3} />}
                </span>
                <FolderCardBody name={f.name} count={`${unit} ${countOf(f)}개`} />
              </button>
            ) : (
              <div key={f.id} className="relative">
                <Link
                  to={linkOf(f)}
                  className={cn(
                    card,
                    'press cursor-pointer border-line pr-10 shadow-[0_3px_0_var(--color-line)] active:shadow-[0_1px_0_var(--color-line)]',
                  )}
                >
                  <FolderCardBody name={f.name} count={`${unit} ${countOf(f)}개`} />
                </Link>
                <button
                  type="button"
                  aria-label={`${f.name} 폴더 메뉴`}
                  aria-expanded={menuFor === f.id}
                  onClick={() => setMenuFor((m) => (m === f.id ? null : f.id))}
                  className="absolute top-1.5 right-1.5 flex size-9 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <EllipsisVertical className="size-5" aria-hidden />
                </button>
                {menuFor === f.id && (
                  <>
                    <button
                      type="button"
                      aria-label="메뉴 닫기"
                      className="fixed inset-0 z-10 cursor-default"
                      onClick={() => setMenuFor(null)}
                    />
                    <div
                      role="menu"
                      className="absolute top-11 right-1.5 z-20 w-36 overflow-hidden rounded-xl border-2 border-line bg-surface py-1 shadow-[0_4px_0_var(--color-line)]"
                    >
                      {menu(f).map((m) => (
                        <button
                          key={m.label}
                          type="button"
                          role="menuitem"
                          disabled={m.disabled}
                          onClick={() => {
                            setMenuFor(null)
                            m.onClick()
                          }}
                          className={cn(
                            'flex h-11 w-full cursor-pointer items-center gap-2.5 px-4 text-[15px] font-semibold active:bg-bg',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            m.danger && 'text-danger',
                          )}
                        >
                          <m.icon className={cn('size-5', !m.danger && 'text-muted')} aria-hidden />
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ),
          )}
          {!moving && (
            <button
              type="button"
              onClick={onCreate}
              className="press flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface/60 text-[14px] font-bold text-primary-deep active:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-highlight text-primary-deep shadow-[0_2px_0_var(--color-highlight-deep)]">
                <FolderPlus className="size-5" aria-hidden />
              </span>
              새 폴더
            </button>
          )}
        </div>
      )}

      {renaming && (
        <RenameSheet
          current={renaming.name}
          onClose={() => setRenaming(null)}
          onSave={async (name) => {
            const updated = await ops.rename(renaming.id, name)
            if (updated) onChange((prev) => prev.map((x) => (x.id === updated.id ? updated : x)))
            setRenaming(null)
          }}
        />
      )}

      {/* 되돌리기 배너: 폰 화면 아래(탭 바 위)에 뜬다. key로 새 삭제마다 진행 막대를 처음부터 */}
      {pending && (
        <div
          key={pending.id}
          role="status"
          className="absolute inset-x-4 bottom-28 z-30 overflow-hidden rounded-2xl bg-ink text-white shadow-lg"
        >
          <div className="flex items-center gap-2 py-2 pr-2 pl-4">
            <p className="min-w-0 flex-1 truncate text-[14px]">'{pending.name}' 폴더를 삭제했어요</p>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="h-10 shrink-0 cursor-pointer rounded-lg px-3 text-[14px] font-bold text-highlight active:bg-white/10"
            >
              되돌리기
            </button>
            <button
              type="button"
              aria-label="닫기 (삭제 확정)"
              onClick={() => commitDelete(pending)}
              className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-white/70 active:bg-white/10"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          {/* 남은 시간 */}
          <div className="h-1 bg-white/15">
            <div className="h-full animate-[shrink_10s_linear_forwards] bg-highlight" />
          </div>
        </div>
      )}
    </>
  )
}

const UNDO_MS = 10_000

function FolderCardBody({ name, count }: { name: string; count: string }) {
  return (
    <>
      <FolderIcon className="size-5 text-muted" fill="var(--color-highlight-soft)" aria-hidden />
      <span>
        <span className="line-clamp-2 text-[15px] leading-snug font-bold">{name}</span>
        <span className="mt-0.5 block text-xs text-muted tabular-nums">{count}</span>
      </span>
    </>
  )
}

function RenameSheet({
  current,
  onClose,
  onSave,
}: {
  current: string
  onClose: () => void
  onSave: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(current)
  const [busy, setBusy] = useState(false)
  const changed = name.trim() && name.trim() !== current
  return (
    <Sheet title="폴더 이름 변경" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!changed || busy) return
          setBusy(true)
          await onSave(name.trim())
        }}
        className="space-y-4"
      >
        <Field
          label="폴더 이름"
          id="rename-folder"
          value={name}
          maxLength={30}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <Button onClick={onClose}>취소</Button>
          <Button type="submit" variant="primary" disabled={!changed || busy}>
            저장
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

// 녹음 한 개 정리: 녹음 폴더에 담거나 빼고(여러 폴더 가능), 내 태그를 단다.
function FileLectureSheet({
  lecture,
  folders,
  tagState,
  onClose,
  onSaved,
  onCreate,
}: {
  lecture: Lecture
  folders: RecordingFolder[]
  tagState: RecordingTagState
  onClose: () => void
  onSaved: (changed: RecordingFolder[], tags?: RecordingTagState) => void
  onCreate: () => void
}) {
  const initial = new Set(folders.filter((f) => f.lectureIds.includes(lecture.id)).map((f) => f.id))
  const [checked, setChecked] = useState(initial)
  const initialTags = tagState.byLecture[lecture.id] ?? []
  const [tags, setTags] = useState<string[]>(initialTags)
  const [allTags, setAllTags] = useState(tagState.tags) // 여기서 새로 만든 태그도 바로 보이게
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  function addDraft() {
    const t = cleanTag(draft)
    if (!t) return
    if (!allTags.includes(t)) setAllTags([...allTags, t])
    if (!tags.includes(t)) setTags([...tags, t])
    setDraft('')
  }

  async function save() {
    setBusy(true)
    const changed: RecordingFolder[] = []
    for (const f of folders) {
      const want = checked.has(f.id)
      if (want === initial.has(f.id)) continue
      const lectureIds = want ? [...f.lectureIds, lecture.id] : f.lectureIds.filter((id) => id !== lecture.id)
      const updated = await api.updateRecordingFolder(f.id, { lectureIds })
      if (updated) changed.push(updated)
    }
    const tagsChanged = tags.join('\n') !== initialTags.join('\n')
    onSaved(changed, tagsChanged ? await api.setLectureTags(lecture.id, tags) : undefined)
  }

  return (
    <Sheet title="폴더·태그 정리" onClose={onClose}>
      <p className="truncate text-[14px] text-muted">{lecture.title}</p>

      <p className="mt-4 text-sm font-bold">폴더</p>
      {folders.length === 0 ? (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-line-strong px-3.5 py-3">
          <p className="text-[14px] text-muted">녹음 폴더가 아직 없어요.</p>
          <button
            type="button"
            onClick={onCreate}
            className="flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-lg px-2 text-[14px] font-bold text-muted active:bg-bg"
          >
            <FolderPlus className="size-4" aria-hidden />새 폴더
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 max-h-[30dvh] space-y-2 overflow-y-auto">
            {folders.map((f) => (
              <label
                key={f.id}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-xl border-2 px-3.5 py-3',
                  checked.has(f.id) ? 'border-highlight-deep bg-highlight-soft' : 'border-line bg-surface',
                )}
              >
                <input
                  type="checkbox"
                  checked={checked.has(f.id)}
                  onChange={(e) => {
                    const next = new Set(checked)
                    if (e.target.checked) next.add(f.id)
                    else next.delete(f.id)
                    setChecked(next)
                  }}
                  className="size-4 cursor-pointer accent-highlight-deep"
                />
                <FolderIcon className="size-5 shrink-0 text-muted" fill="var(--color-highlight-soft)" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-bold">{f.name}</span>
                  <span className="block text-[12px] text-muted tabular-nums">녹음 {f.lectureIds.length}개</span>
                </span>
              </label>
            ))}
          </div>
        </>
      )}

      <p className="mt-5 text-sm font-bold">태그</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {allTags.map((t) => {
          const on = tags.includes(t)
          return (
            <button
              key={t}
              type="button"
              aria-pressed={on}
              onClick={() => setTags(on ? tags.filter((x) => x !== t) : [...tags, t])}
              className={cn(
                'h-9 cursor-pointer rounded-full border-2 px-3.5 text-[14px] font-semibold',
                on ? 'border-highlight-soft bg-highlight-soft text-primary-deep' : 'border-line bg-surface text-muted',
              )}
            >
              #{t}
            </button>
          )
        })}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return // 한글 조합 중 엔터는 무시
            if (e.key === 'Enter') {
              e.preventDefault()
              addDraft()
            }
          }}
          onBlur={addDraft}
          maxLength={16}
          placeholder="+ 새 태그"
          aria-label="새 태그"
          className="h-9 w-28 rounded-full border-2 border-dashed border-line-strong bg-surface px-3.5 text-[14px] placeholder:text-muted focus:border-primary focus:outline-none"
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Button onClick={onClose}>취소</Button>
        <Button variant="primary" disabled={busy} onClick={save}>
          {busy ? '저장 중…' : '완료'}
        </Button>
      </div>
    </Sheet>
  )
}

// '+ 태그': 내 녹음 태그 만들기·지우기
function TagManagerSheet({
  tags,
  onChange,
  onClose,
}: {
  tags: string[]
  onChange: (s: RecordingTagState) => void
  onClose: () => void
}) {
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  async function add() {
    if (!name.trim()) return
    const r = await api.addRecordingTag(name)
    if ('error' in r) return setError(r.error)
    setError('')
    setName('')
    onChange(r)
  }

  return (
    <Sheet title="내 태그" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
        className="flex gap-2"
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={16}
          autoFocus
          placeholder="예: 시험범위"
          aria-label="새 태그 이름"
          className="h-12 min-w-0 flex-1 rounded-xl border-2 border-line bg-surface px-3.5 text-base placeholder:text-muted/70 focus:border-primary focus:outline-none"
        />
        <Button type="submit" variant="primary" disabled={!name.trim()}>
          추가
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-[14px] font-semibold text-danger">
          {error}
        </p>
      )}
      <p className="mt-4 text-[13px] text-muted">
        녹음 옆 📁 버튼에서 태그를 달 수 있어요. 지운 태그는 달려 있던 녹음에서도 빠져요.
      </p>
      {tags.length === 0 ? (
        <p className="mt-3 text-[15px] text-muted">아직 만든 태그가 없어요.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="flex h-9 items-center gap-1 rounded-full bg-highlight-soft pr-1 pl-3.5 text-[14px] font-semibold text-primary-deep"
            >
              #{t}
              <button
                type="button"
                aria-label={`${t} 태그 지우기`}
                onClick={async () => onChange(await api.removeRecordingTag(t))}
                className="flex size-7 cursor-pointer items-center justify-center rounded-full active:bg-primary/15"
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      )}
      <Button className="mt-5 w-full" onClick={onClose}>
        닫기
      </Button>
    </Sheet>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'h-11 shrink-0 cursor-pointer rounded-full border-2 px-4 text-sm font-semibold',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        active ? 'border-highlight-soft bg-highlight-soft text-primary-deep' : 'border-line bg-surface text-muted',
      )}
    >
      {label}
    </button>
  )
}

// 페이지 버튼: 이전 · 1 2 3 · 다음
function Pager({ page, count, onGo }: { page: number; count: number; onGo: (n: number) => void }) {
  const btn =
    'flex h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl px-3 text-[14px] font-bold whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40'
  return (
    <nav aria-label="페이지" className="flex items-center justify-center gap-1">
      <button type="button" className={cn(btn, 'text-muted')} disabled={page === 1} onClick={() => onGo(page - 1)}>
        이전
      </button>
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          aria-current={n === page ? 'page' : undefined}
          onClick={() => onGo(n)}
          className={cn(btn, 'tabular-nums', n === page ? 'bg-highlight text-primary-deep shadow-[0_2px_0_var(--color-highlight-deep)]' : 'border-2 border-line bg-surface text-muted')}
        >
          {n}
        </button>
      ))}
      <button type="button" className={cn(btn, 'text-muted')} disabled={page === count} onClick={() => onGo(page + 1)}>
        다음
      </button>
    </nav>
  )
}

function NewFolderSheet({
  kind,
  onClose,
  onCreate,
}: {
  kind: Tab
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const what = kind === 'concepts' ? '개념' : '녹음'
  return (
    <Sheet title={`새 ${what} 폴더`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!name.trim() || busy) return
          setBusy(true)
          onCreate(name)
        }}
        className="space-y-4"
      >
        <Field
          label="폴더 이름"
          id="new-folder"
          value={name}
          maxLength={30}
          autoFocus
          placeholder={kind === 'concepts' ? '예: 기말고사 범위' : '예: 중간고사 녹음'}
          hint={`만든 다음 바로 ${what}을 담을 수 있어요.`}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="primary" className="w-full" disabled={!name.trim() || busy}>
          만들고 {what} 담기
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      </form>
    </Sheet>
  )
}

function NoMatch() {
  return (
    <p className="rounded-2xl border-2 border-line bg-surface px-5 py-8 text-center text-[15px] text-muted">
      조건에 맞는 항목이 없어요.
    </p>
  )
}

function countFor(concepts: Concept[] | null, lectureId: string) {
  return concepts ? concepts.filter((c) => c.lectureId === lectureId).length : 0
}
