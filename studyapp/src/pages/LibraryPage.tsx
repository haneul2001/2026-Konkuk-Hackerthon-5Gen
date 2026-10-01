import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, Folder as FolderIcon, FolderPlus, Layers, Search } from 'lucide-react'
import type { Concept, Folder, Lecture } from '../../shared/types'
import { api } from '../api/client'
import { masteryLabel } from '../lib/mastery'
import { LIBRARY_NAME } from '../lib/names'
import {
  Button,
  ButtonLink,
  Card,
  CourseBadge,
  EmptyState,
  ListSkeleton,
  PageTitle,
  Placeholder,
  Row,
  Segmented,
  Sheet,
  Field,
  Tag,
} from '../components/ui'
import { cn } from '../lib/cn'

// 서재: 올린 녹음본 보관함 + 요약에서 뽑힌 개념 모음.
// 개념은 사용자가 만든 폴더에 담고, 폴더 단위로 문제를 푼다.
// 탭·과목·검색어는 주소에 남겨서 뒤로 가기·공유 시 그대로 돌아오게 한다.

type Tab = 'recordings' | 'concepts'

export function LibraryPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'concepts' ? 'concepts' : 'recordings'
  const course = params.get('course') ?? ''
  const urlQ = params.get('q') ?? ''
  // 입력창은 로컬 상태로 둔다. URL 값을 바로 value로 쓰면 라우터 갱신이 한 박자 늦어 한글 조합이 깨진다.
  const [q, setQ] = useState(urlQ)

  const [lectures, setLectures] = useState<Lecture[] | null>(null)
  const [concepts, setConcepts] = useState<Concept[] | null>(null)
  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    api.lectures().then(setLectures)
    api.concepts().then(setConcepts)
    api.folders().then(setFolders)
  }, [])

  const unfiled = useMemo(() => {
    if (!concepts || !folders) return 0
    const filed = new Set(folders.flatMap((f) => f.conceptIds))
    return concepts.filter((c) => !filed.has(c.id)).length
  }, [concepts, folders])

  function update(next: Partial<{ tab: Tab; course: string; q: string }>) {
    const merged = { tab, course, q, ...next }
    const p: Record<string, string> = {}
    if (merged.tab !== 'recordings') p.tab = merged.tab
    if (merged.course) p.course = merged.course
    if (merged.q) p.q = merged.q
    setParams(p, { replace: true })
  }

  const courses = useMemo(
    () => [...new Set((lectures ?? []).map((l) => l.course))],
    [lectures],
  )

  const needle = q.trim().toLowerCase()
  const shownLectures = (lectures ?? []).filter(
    (l) =>
      (!course || l.course === course) &&
      (!needle || `${l.title} ${l.course}`.toLowerCase().includes(needle)),
  )
  const cardCount = (concepts ?? []).filter((c) => !course || c.course === course).length
  const shownConcepts = (concepts ?? []).filter(
    (c) =>
      (!course || c.course === course) &&
      (!needle || `${c.term} ${c.summary} ${c.course}`.toLowerCase().includes(needle)),
  )

  return (
    <div className="space-y-5">
      <PageTitle
        title={LIBRARY_NAME}
        sub={
          lectures && concepts
            ? `녹음 ${lectures.length}개 · 개념 ${concepts.length}개`
            : '녹음본과 정리된 개념이 모이는 곳'
        }
      />

      {/* 검색 */}
      <div className="relative">
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
          ['recordings', '녹음본'],
          ['concepts', '개념'],
        ]}
        onChange={(t) => update({ tab: t })}
      />

      {tab === 'concepts' && (
        <section className="space-y-3" aria-labelledby="folders-title">
          <h2 id="folders-title" className="text-[17px] font-bold">
            내 폴더
          </h2>
          {folders === null ? (
            <ListSkeleton rows={1} />
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {folders.map((f) => (
                <Link
                  key={f.id}
                  to={`/library/folders/${f.id}`}
                  className="press flex min-h-24 cursor-pointer flex-col justify-between rounded-2xl border-2 border-line bg-surface p-3.5 shadow-[0_3px_0_var(--color-line)] active:shadow-[0_1px_0_var(--color-line)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <FolderIcon className="size-5 text-primary" fill="var(--color-primary-soft)" aria-hidden />
                  <span>
                    <span className="line-clamp-2 text-[15px] leading-snug font-bold">{f.name}</span>
                    <span className="mt-0.5 block text-xs text-muted tabular-nums">
                      개념 {f.conceptIds.length}개
                    </span>
                  </span>
                </Link>
              ))}
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-line-strong text-[14px] font-bold text-primary active:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <FolderPlus className="size-6" aria-hidden />새 폴더
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'concepts' && (
        <div className="flex items-baseline justify-between pt-1">
          <h2 className="text-[17px] font-bold">전체 개념</h2>
          {unfiled > 0 && (
            <span className="text-[13px] text-accent-ink">폴더에 안 담긴 개념 {unfiled}개</span>
          )}
        </div>
      )}

      {/* 과목 필터. 가로로 넘친다. */}
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5" role="group" aria-label="과목">
        {['', ...courses].map((c) => (
          <button
            key={c || 'all'}
            type="button"
            aria-pressed={course === c}
            onClick={() => update({ course: c })}
            className={cn(
              'h-11 shrink-0 cursor-pointer rounded-full border-2 px-4 text-sm font-semibold',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              course === c
                ? 'border-primary bg-primary text-white'
                : 'border-line bg-surface text-muted',
            )}
          >
            {c || '전체'}
          </button>
        ))}
      </div>

      {/* 큐카드 진입: 지금 고른 과목의 개념을 넘겨 본다 */}
      {tab === 'concepts' && cardCount > 0 && (
        <ButtonLink
          to={course ? `/cards?course=${encodeURIComponent(course)}` : '/cards'}
          variant="primary"
          className="w-full"
        >
          <Layers className="size-5" aria-hidden />
          {course || '전체'} 개념 큐카드로 외우기
          <span className="tabular-nums opacity-80">{cardCount}장</span>
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
          <Card>
            <ul className="divide-y-2 divide-line">
              {shownLectures.map((l) => (
                <li key={l.id}>
                  <Row
                    to={`/lectures/${l.id}`}
                    leading={<CourseBadge course={l.course} />}
                    title={l.title}
                    meta={
                      <span className="tabular-nums">
                        {l.durationMin}분 녹음
                        {l.status === 'ready' && ` · 개념 ${countFor(concepts, l.id)}개`}
                      </span>
                    }
                    trailing={
                      l.status === 'processing' ? <Tag tone="accent">요약 중</Tag> : null
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : concepts === null ? (
        <ListSkeleton rows={4} />
      ) : shownConcepts.length === 0 ? (
        <NoMatch />
      ) : (
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
      )}

      <Placeholder
        title={tab === 'recordings' ? '녹음 원본 저장소' : '개념 정리'}
        description={
          tab === 'recordings'
            ? '올라온 녹음 파일을 스토리지에 보관하고 다시 듣기를 제공한다. 지금은 목록만 있다.'
            : '요약 단계에서 핵심 개념을 뽑아 저장. 퀴즈 결과로 "익히는 중 → 외움" 갱신.'
        }
        endpoint={
          tab === 'recordings' ? 'GET /api/lectures/:id/audio-file' : 'GET /api/concepts'
        }
        owner="나"
      />

      {creating && (
        <NewFolderSheet
          onClose={() => setCreating(false)}
          onCreate={async (name) => {
            const folder = await api.createFolder(name)
            navigate(`/library/folders/${folder.id}?add=1`)
          }}
        />
      )}
    </div>
  )
}

function NewFolderSheet({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (name: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Sheet title="새 폴더" onClose={onClose}>
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
          placeholder="예: 기말고사 범위"
          hint="만든 다음 바로 개념을 담을 수 있어요."
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" variant="primary" className="w-full" disabled={!name.trim() || busy}>
          만들고 개념 담기
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
