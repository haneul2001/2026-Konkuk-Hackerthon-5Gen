import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Ban,
  CornerDownRight,
  EllipsisVertical,
  ExternalLink,
  MessageCircle,
  Siren, Pencil, Search, SendHorizontal, ThumbsUp, X } from 'lucide-react'
import { REPORT_REASONS } from '../../shared/types'
import type { BoardComment, BoardKind, BoardPost, ReportReason, UserSummary } from '../../shared/types'
import { BOARDS, cleanTags, matches } from '../../shared/board'
import { cleanTag } from '../../shared/recordingTags'
import { api } from '../api/client'
import { Button, Field, ListSkeleton, PageTitle, Segmented, Sheet, Tag } from '../components/ui'
import { Avatar } from '../components/Avatar'
import { cn } from '../lib/cn'
import { timeAgo } from '../lib/time'

// 게시판: 자유·질문·그룹 스터디 모집. 에브리타임처럼 목록 → 상세(공감·댓글) → 글쓰기, 익명 선택.
//  /board?board=question&tag=자료구조   게시판·태그로 거른 목록
//  /board?post=ID                       글 상세
//  /board?write=1&board=study           글쓰기
//  /board?edit=ID                       내 글 수정

const boardLabel = Object.fromEntries(BOARDS.map((b) => [b.key, b.label])) as Record<BoardKind, string>
const shortLabel: Record<BoardKind, string> = { free: '자유', question: '질문', study: '스터디 모집' }

function isBoard(v: string | null): v is BoardKind {
  return v === 'free' || v === 'question' || v === 'study'
}

export function BoardPage() {
  const [params] = useSearchParams()
  const postId = params.get('post')
  const board: BoardKind = isBoard(params.get('board')) ? (params.get('board') as BoardKind) : 'free'

  const editId = params.get('edit')
  if (params.get('write') === '1') return <WriteForm initialBoard={board} />
  if (editId) return <EditPost key={editId} id={editId} />
  if (postId) return <PostDetail key={postId} id={postId} />
  // 게시판을 바꾸면 목록 상태를 새로 시작한다
  return <BoardList key={board} board={board} tag={params.get('tag') ?? ''} />
}

// ---- 목록 ----

function BoardList({ board, tag }: { board: BoardKind; tag: string }) {
  const [, setParams] = useSearchParams()
  const [posts, setPosts] = useState<BoardPost[] | null>(null)
  const [me, setMe] = useState<UserSummary | null>(null)

  useEffect(() => {
    api.posts(board).then(setPosts)
  }, [board])
  useEffect(() => {
    api.me().then(setMe)
  }, [])

  // 이 게시판에서 많이 쓰인 태그부터
  const tags = useMemo(() => {
    const count = new Map<string, number>()
    for (const p of posts ?? []) for (const t of p.tags) count.set(t, (count.get(t) ?? 0) + 1)
    return [...count].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [posts])

  // 키워드 줄: 내가 넣고 뺀 목록. 한 번도 안 고쳤으면(null) 많이 쓰인 태그 8개를 보여 준다
  const [custom, setCustom] = useState<string[] | null | undefined>(undefined)
  useEffect(() => {
    api.boardKeywords().then((r) => setCustom(r.keywords))
  }, [])
  const keywords = custom ?? tags.slice(0, 8)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [kwError, setKwError] = useState('')

  async function saveKeywords(next: string[]) {
    const r = await api.setBoardKeywords(next)
    if ('error' in r) return setKwError(r.error)
    setKwError('')
    setCustom(r.keywords)
  }
  function addKeyword() {
    const t = cleanTag(draft)
    if (!t) return
    if (keywords.includes(t)) return setKwError('이미 있는 키워드예요')
    setDraft('')
    void saveKeywords([...keywords, t])
  }
  function removeKeyword(t: string) {
    if (tag === t) go({ tag: '' })
    void saveKeywords(keywords.filter((k) => k !== t))
  }

  // 검색어는 주소가 아니라 로컬 상태로 둔다(한글 조합이 깨지지 않게)
  const [searching, setSearching] = useState(false)
  const [q, setQ] = useState('')

  const shown = (posts ?? []).filter((p) => (!tag || p.tags.includes(tag)) && matches(p, q))
  const go = (next: { board?: BoardKind; tag?: string }) => {
    const b = next.board ?? board
    const t = next.tag ?? (next.board ? '' : tag)
    setParams({ ...(b !== 'free' && { board: b }), ...(t && { tag: t }) }, { replace: true })
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-start justify-between gap-2">
        <PageTitle
          title="게시판"
          sub={
            board === 'study' && me
              ? `내 누적 XP ${me.xpTotal.toLocaleString()} · 조건을 채우면 참여할 수 있어요.`
              : '같은 학교 학생들과 익명으로 이야기해요.'
          }
        />
        <button
          type="button"
          aria-label={searching ? '검색 닫기' : '글 검색'}
          aria-expanded={searching}
          onClick={() => {
            setSearching((s) => !s)
            setQ('')
          }}
          className="-mr-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {searching ? <X className="size-6" aria-hidden /> : <Search className="size-6" aria-hidden />}
        </button>
      </div>

      {searching && (
        <div className="relative mt-4">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${boardLabel[board]}에서 제목·내용·태그 검색`}
            aria-label="글 검색"
            className="h-12 w-full rounded-xl border-2 border-line bg-surface pr-3.5 pl-11 text-base placeholder:text-muted/70 focus:border-primary focus:outline-none"
          />
        </div>
      )}

      <div className="mt-4">
        <Segmented
          label="게시판"
          value={board}
          options={BOARDS.map((b) => [b.key, shortLabel[b.key]] as const)}
          onChange={(b) => go({ board: b })}
        />
      </div>

      {/* 키워드: 누르면 그 태그 글만. 넘치면 다음 줄로. '편집'에서 넣고 뺀다 */}
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="키워드">
        {['', ...keywords].map((t) => {
          const on = tag === t
          const chip = cn(
            'flex h-9 shrink-0 items-center rounded-full border-2 text-[14px] font-semibold',
            on ? 'border-highlight-deep bg-highlight text-primary-deep' : 'border-line bg-surface text-muted',
          )
          return editing && t ? (
            <span key={t} className={cn(chip, 'pr-1 pl-3.5')}>
              #{t}
              <button
                type="button"
                aria-label={`#${t} 키워드 빼기`}
                onClick={() => removeKeyword(t)}
                className="ml-0.5 flex size-7 cursor-pointer items-center justify-center rounded-full active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          ) : (
            <button
              key={t || 'all'}
              type="button"
              aria-pressed={on}
              onClick={() => go({ tag: t })}
              className={cn(
                chip,
                'cursor-pointer px-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              )}
            >
              {t ? `#${t}` : '전체'}
            </button>
          )
        })}
        {editing && (
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setKwError('')
            }}
            onKeyDown={(e) => {
              // 한글 조합 중 Enter는 무시(글자가 두 번 들어가지 않게)
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault()
                addKeyword()
              }
            }}
            onBlur={addKeyword}
            maxLength={16}
            placeholder="+ 키워드"
            aria-label="새 키워드"
            className="h-9 w-28 rounded-full border-2 border-dashed border-line-strong bg-surface px-3.5 text-[14px] placeholder:text-primary-deep/70 focus:border-primary focus:outline-none"
          />
        )}
        <button
          type="button"
          aria-pressed={editing}
          onClick={() => {
            if (editing) addKeyword()
            setEditing((v) => !v)
            setKwError('')
          }}
          className="flex h-9 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2.5 text-[14px] font-semibold text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
        >
          {editing ? (
            '완료'
          ) : (
            <>
              <Pencil className="size-4" aria-hidden />
              편집
            </>
          )}
        </button>
      </div>
      {kwError && (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-danger">
          {kwError}
        </p>
      )}

      {/* 글 목록: 화면 끝까지 붙는 에타식 리스트 */}
      <div className="mt-4 overflow-hidden rounded-2xl border-2 border-line bg-surface shadow-[0_3px_0_var(--color-line)]">
        {posts === null ? (
          <div className="p-5">
            <ListSkeleton rows={4} />
          </div>
        ) : shown.length === 0 ? (
          <p className="px-5 py-12 text-center text-[15px] text-muted">
            {q.trim()
              ? `'${q.trim()}'(이)가 들어간 글이 없어요.`
              : tag
                ? `#${tag} 글이 아직 없어요.`
                : '아직 글이 없어요. 첫 글을 써 보세요.'}
          </p>
        ) : (
          <ul className="divide-y-2 divide-line">
            {shown.map((p) => (
              <li key={p.id}>
                <PostItem post={p} me={me} onOpen={() => setParams({ post: p.id })} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 떠 있는 글쓰기 버튼 */}
      <div className="pointer-events-none sticky bottom-4 mt-4 flex justify-center">
        <button
          type="button"
          onClick={() => setParams({ write: '1', ...(board !== 'free' && { board }) })}
          className="press pointer-events-auto flex h-12 cursor-pointer items-center gap-2 rounded-full border-2 border-line-strong bg-surface px-6 text-[15px] font-bold shadow-[0_4px_0_var(--color-line-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <Pencil className="size-5 text-primary" aria-hidden />
          글 쓰기
        </button>
      </div>
    </div>
  )
}

function PostItem({ post, me, onOpen }: { post: BoardPost; me: UserSummary | null; onOpen: () => void }) {
  const s = post.study
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full cursor-pointer gap-3 px-5 py-4 text-left active:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[16px] font-bold">{post.title}</p>
        <p className="mt-1 line-clamp-2 text-[14px] leading-snug whitespace-pre-line text-ink/80">{post.body}</p>
        {s && (
          <p className="mt-1.5 text-[13px] font-semibold text-accent-ink tabular-nums">
            {s.course} · {s.joined}/{s.capacity}명 · XP {s.minXp.toLocaleString()} 이상
          </p>
        )}
        <PostMeta post={post} />
      </div>
      {s && me && (post.mine ? <Tag tone="primary">내 글</Tag> : <StudyStatus study={s} xp={me.xpTotal} />)}
    </button>
  )
}

function PostMeta({ post }: { post: BoardPost }) {
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
      {post.likes > 0 && (
        <span className="flex items-center gap-0.5 font-semibold text-danger tabular-nums">
          <ThumbsUp className="size-3.5" aria-label="공감" />
          {post.likes}
        </span>
      )}
      {post.commentCount > 0 && (
        <span className="flex items-center gap-0.5 font-semibold text-accent-ink tabular-nums">
          <MessageCircle className="size-3.5" aria-label="댓글" />
          {post.commentCount}
        </span>
      )}
      <span>{timeAgo(post.createdAt)}</span>
      <span aria-hidden className="text-line-strong">
        |
      </span>
      <span>{post.author}</span>
      {post.tags.map((t) => (
        <span key={t} className="text-accent-ink">
          #{t}
        </span>
      ))}
    </p>
  )
}

function StudyStatus({ study, xp }: { study: NonNullable<BoardPost['study']>; xp: number }) {
  if (study.joinedByMe) return <Tag tone="primary">참여 중</Tag>
  if (study.joined >= study.capacity) return <Tag>마감</Tag>
  if (xp >= study.minXp) return <Tag tone="success">참여 가능</Tag>
  return <Tag>XP 부족</Tag>
}

// ---- 상세 ----

function PostDetail({ id }: { id: string }) {
  const navigate = useNavigate()
  const [data, setData] = useState<{ post: BoardPost; comments: BoardComment[] } | null | undefined>(undefined)
  const [me, setMe] = useState<UserSummary | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  // 대댓글을 달 원댓글. 고르면 아래 입력창이 대댓글 모드가 된다
  const [replyTo, setReplyTo] = useState<BoardComment | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [blockTarget, setBlockTarget] = useState<ModTarget | null>(null)
  const [reportTarget, setReportTarget] = useState<ModTarget | null>(null)
  const [postMenu, setPostMenu] = useState(false)

  useEffect(() => {
    api.post(id).then(setData)
    api.me().then(setMe)
  }, [id])

  if (data === undefined) return <ListSkeleton rows={3} />
  if (data === null) return <p className="text-[15px] text-muted">글을 찾을 수 없어요.</p>

  const { post, comments } = data

  if (post.blocked) {
    return <p className="text-[15px] text-muted">차단한 사용자의 글이에요.</p>
  }

  // 댓글 정보창의 공감·차단·신고
  function commentActions(c: BoardComment) {
    return {
      onLike: async () => {
        const r = await api.likeComment(c.id)
        if ('error' in r) return
        setData((d) => d && { ...d, comments: d.comments.map((x) => (x.id === r.id ? r : x)) })
      },
      onBlock: () => setBlockTarget(commentTarget(c)),
      onReport: () => setReportTarget(commentTarget(c)),
    }
  }

  async function like() {
    const updated = await api.likePost(post.id)
    if (updated) setData((d) => d && { ...d, post: updated })
  }

  async function remove() {
    const r = await api.deletePost(post.id)
    if ('error' in r) return setDeleteError(r.error)
    // 지운 글로 뒤로 가지 않게 목록으로 바꿔 끼운다
    navigate(post.board === 'free' ? '/board' : `/board?board=${post.board}`, { replace: true, state: { scrollTop: true } })
  }

  return (
    <div className="flex flex-1 flex-col">
      <p className="text-[13px] font-semibold text-primary">{boardLabel[post.board]}</p>

      <div className="mt-3 flex items-center gap-2.5">
        <Avatar id={post.avatar ?? ''} className="size-10 border-2 border-line" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{post.author}</p>
          <p className="text-[12px] text-muted">
            {timeAgo(post.createdAt)}
            {post.editedAt && ' · 수정됨'}
          </p>
        </div>
        {post.mine && (
          <div className="flex shrink-0 text-[13px] font-semibold text-muted">
            <button
              type="button"
              onClick={() => navigate(`/board?edit=${post.id}`)}
              className="h-11 cursor-pointer rounded-lg px-2.5 active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
            >
              수정
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="h-11 cursor-pointer rounded-lg px-2.5 text-danger active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
            >
              삭제
            </button>
          </div>
        )}
        {!post.mine && (
          <div className="relative shrink-0">
            <button
              type="button"
              aria-label="글 더보기"
              aria-expanded={postMenu}
              onClick={() => setPostMenu((m) => !m)}
              className="-mr-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-muted active:bg-line/60 focus-visible:outline-2 focus-visible:outline-primary"
            >
              <EllipsisVertical className="size-5" aria-hidden />
            </button>
            {postMenu && (
              <MoreMenu
                onClose={() => setPostMenu(false)}
                onBlock={() => setBlockTarget(postTarget(post))}
                onReport={() => setReportTarget(postTarget(post))}
              />
            )}
          </div>
        )}
      </div>

      <h1 className="mt-4 text-[20px] leading-snug font-bold text-balance">{post.title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-line text-pretty">{post.body}</p>
      {post.tags.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-x-2 text-[14px] font-semibold text-accent-ink">
          {post.tags.map((t) => (
            <span key={t}>#{t}</span>
          ))}
        </p>
      )}

      {post.study && me && (
        <StudyBox post={post} me={me} onJoined={(updated) => setData((d) => d && { ...d, post: updated })} />
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={like}
          aria-pressed={post.liked}
          className={cn(
            'press flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border-2 px-3 text-[13px] font-bold',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
            post.liked ? 'border-danger bg-danger-soft text-danger' : 'border-line bg-surface text-muted',
          )}
        >
          <ThumbsUp className="size-4" aria-hidden />
          공감 {post.likes}
        </button>
        <span className="flex items-center gap-1 text-[13px] font-semibold text-accent-ink tabular-nums">
          <MessageCircle className="size-4" aria-hidden />
          댓글 {post.commentCount}
        </span>
      </div>

      {/* 댓글: 원댓글 아래에 대댓글을 들여 쓴다 */}
      <ul className="-mx-5 mt-4 flex-1 divide-y-2 divide-line border-y-2 border-line bg-surface">
        {comments.length === 0 ? (
          <li className="px-5 py-8 text-center text-[14px] text-muted">첫 댓글을 남겨 보세요.</li>
        ) : (
          comments
            .filter((c) => !c.parentId)
            .map((c) => (
              <li key={c.id} className="px-5 py-3.5">
                <CommentItem
                  comment={c}
                  selected={replyTo?.id === c.id}
                  onReply={() => {
                    setReplyTo(c)
                    inputRef.current?.focus() // 입력창으로 스크롤도 같이 된다
                  }}
                  {...commentActions(c)}
                />
                {comments
                  .filter((r) => r.parentId === c.id)
                  .map((r) => (
                    <div key={r.id} className="mt-2.5 flex gap-1.5">
                      <CornerDownRight className="mt-2 size-4 shrink-0 text-muted" aria-hidden />
                      <div className="min-w-0 flex-1 rounded-xl bg-bg px-3.5 py-2.5">
                        <CommentItem comment={r} {...commentActions(r)} />
                      </div>
                    </div>
                  ))}
              </li>
            ))
        )}
      </ul>

      <CommentBox
        postId={post.id}
        inputRef={inputRef}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onAdded={(c) => {
          setData((d) => d && { post: { ...d.post, commentCount: d.post.commentCount + 1 }, comments: [...d.comments, c] })
          setReplyTo(null)
        }}
      />

      {blockTarget && (
        <BlockSheet
          target={blockTarget}
          onClose={() => setBlockTarget(null)}
          onDone={() => {
            setBlockTarget(null)
            if (blockTarget.kind === 'post') {
              // 글쓴이를 차단했으니 이 글은 더 못 본다. 목록으로
              navigate(post.board === 'free' ? '/board' : `/board?board=${post.board}`, { replace: true, state: { scrollTop: true } })
              return
            }
            if (replyTo?.authorId === blockTarget.authorId) setReplyTo(null)
            api.post(id).then(setData) // 차단한 사람 댓글을 가린 채로 다시 불러온다
          }}
        />
      )}
      {reportTarget && <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />}

      {confirmDelete && (
        <Sheet title="글을 지울까요?" onClose={() => setConfirmDelete(false)}>
          <p className="text-[15px] text-muted">댓글까지 함께 지워지고 되돌릴 수 없어요.</p>
          {deleteError && (
            <p role="alert" className="mt-2 text-[14px] font-semibold text-danger">
              {deleteError}
            </p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <Button onClick={() => setConfirmDelete(false)}>취소</Button>
            <Button variant="danger" onClick={remove}>
              삭제
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

// 수정: 글을 불러와서 글쓰기 화면을 채운다. 내 글이 아니면 막는다.
function EditPost({ id }: { id: string }) {
  const [post, setPost] = useState<BoardPost | null | undefined>(undefined)
  useEffect(() => {
    api.post(id).then((d) => setPost(d?.post ?? null))
  }, [id])
  if (post === undefined) return <ListSkeleton rows={3} />
  if (!post?.mine) return <p className="text-[15px] text-muted">내가 쓴 글만 고칠 수 있어요.</p>
  return <WriteForm initialBoard={post.board} editing={post} />
}

// 스터디 모집 글: 인원·조건과 내 XP가 조건에 얼마나 가까운지
function StudyBox({
  post,
  me,
  onJoined,
}: {
  post: BoardPost
  me: UserSummary
  onJoined: (post: BoardPost) => void
}) {
  const study = post.study!
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const eligible = me.xpTotal >= study.minXp
  const full = study.joined >= study.capacity
  const progress = study.minXp > 0 ? Math.min(1, me.xpTotal / study.minXp) : 1

  return (
    <div className="mt-4 space-y-4 rounded-2xl border-2 border-line bg-surface p-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs font-medium text-muted">과목</p>
          <p className="mt-0.5 truncate text-[15px] font-bold">{study.course}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">인원</p>
          <p className="mt-0.5 text-[15px] font-bold tabular-nums">
            {study.joined}/{study.capacity}명
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted">참여 조건</p>
          <p className="mt-0.5 text-[15px] font-bold tabular-nums">XP {study.minXp.toLocaleString()}</p>
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="font-semibold">내 누적 XP</span>
          <span className="tabular-nums text-muted">
            {me.xpTotal.toLocaleString()} / {study.minXp.toLocaleString()}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="참여 조건 달성률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line"
        >
          <div className={eligible ? 'h-full bg-success' : 'h-full bg-accent'} style={{ width: `${progress * 100}%` }} />
        </div>
      </div>

      {study.contact ? (
        // 글쓴이이거나 참여한 사람: 연락처 공개
        <div className="rounded-xl bg-primary-soft px-4 py-3">
          <p className="text-[13px] font-bold text-primary-deep">
            {post.mine ? '내가 올린 모집글이에요 · 연락처' : '참여했어요! 아래로 연락하세요'}
          </p>
          <Contact value={study.contact} />
        </div>
      ) : full ? (
        <p className="text-[14px] text-muted">모집이 끝났어요.</p>
      ) : eligible ? (
        <div className="space-y-2">
          <Button
            variant="primary"
            className="w-full"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              setError('')
              const r = await api.joinPost(post.id)
              setBusy(false)
              if ('error' in r) setError(r.error)
              else onJoined(r)
            }}
          >
            {busy ? '참여하는 중…' : '참여하고 연락처 보기'}
          </Button>
          {error ? (
            <p role="alert" className="text-center text-[13px] font-semibold text-danger">
              {error}
            </p>
          ) : (
            <p className="text-center text-[12px] text-muted">참여하면 인원이 1명 늘고 연락처가 보여요.</p>
          )}
        </div>
      ) : (
        <p className="text-[14px] text-muted">
          <b className="text-accent-ink tabular-nums">{(study.minXp - me.xpTotal).toLocaleString()} XP</b>를 더 모으면
          참여할 수 있어요.
        </p>
      )}
    </div>
  )
}

// 링크면 눌러서 열고, 아니면 글자 그대로
function Contact({ value }: { value: string }) {
  if (/^https?:\/\//.test(value)) {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 flex items-center gap-1.5 text-[15px] font-semibold break-all text-primary underline underline-offset-2"
      >
        {value}
        <ExternalLink className="size-4 shrink-0" aria-hidden />
      </a>
    )
  }
  return <p className="mt-1 text-[15px] font-semibold break-all select-all">{value}</p>
}

// 댓글 한 개. 오른쪽 정보창: [대댓글(원댓글만)] | [공감] | [⋮ 차단·신고]
// 내 댓글엔 공감·⋮가 없고, 차단한 사람 댓글은 내용 없이 표시만 한다.
function CommentItem({
  comment: c,
  selected,
  onReply,
  onLike,
  onBlock,
  onReport,
}: {
  comment: BoardComment
  selected?: boolean
  onReply?: () => void
  onLike: () => void
  onBlock: () => void
  onReport: () => void
}) {
  const [menu, setMenu] = useState(false)

  if (c.blocked) return <p className="py-1 text-[14px] text-muted">차단한 사용자의 댓글이에요.</p>

  const actions = [
    onReply && { key: 'reply', label: '대댓글', icon: MessageCircle, onClick: onReply, active: selected },
    !c.mine && { key: 'like', label: c.liked ? '공감 취소' : '공감', icon: ThumbsUp, onClick: onLike, active: c.liked },
    !c.mine && { key: 'more', label: '더보기', icon: EllipsisVertical, onClick: () => setMenu((m) => !m), active: menu },
  ].filter(Boolean) as { key: string; label: string; icon: typeof ThumbsUp; onClick: () => void; active?: boolean }[]

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('flex min-w-0 items-center gap-2 text-[14px] font-bold', c.isWriter && 'text-primary')}>
          <Avatar id={c.avatar ?? ''} className="size-7 border border-line" />
          <span className="truncate">{c.author}</span>
        </p>
        {actions.length > 0 && (
          <div className="relative -my-1.5 flex shrink-0 items-center rounded-lg bg-line/50 text-muted">
            {actions.map((a, i) => (
              <span key={a.key} className="flex items-center">
                {i > 0 && <span aria-hidden className="h-3 w-px bg-line-strong" />}
                <button
                  type="button"
                  aria-label={a.label}
                  aria-pressed={a.key === 'more' ? undefined : a.active}
                  aria-expanded={a.key === 'more' ? menu : undefined}
                  onClick={a.onClick}
                  className={cn(
                    'flex h-8 w-9 cursor-pointer items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-primary',
                    a.active && (a.key === 'like' ? 'text-danger' : 'text-primary'),
                  )}
                >
                  <a.icon className="size-4" aria-hidden fill={a.key === 'like' && a.active ? 'currentColor' : 'none'} />
                </button>
              </span>
            ))}

            {menu && <MoreMenu onClose={() => setMenu(false)} onBlock={onBlock} onReport={onReport} />}
          </div>
        )}
      </div>
      <p className="mt-0.5 text-[15px] leading-snug whitespace-pre-line">{c.body}</p>
      <p className="mt-1 flex items-center gap-2 text-[12px] text-muted">
        {timeAgo(c.createdAt)}
        {(c.likes ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 font-semibold text-danger tabular-nums">
            <ThumbsUp className="size-3" aria-label="공감" />
            {c.likes}
          </span>
        )}
      </p>
    </>
  )
}

// 차단·신고 대상: 게시글 또는 댓글
type ModTarget = { kind: 'post' | 'comment'; id: string; author: string; authorId: string; body: string }

function postTarget(p: BoardPost): ModTarget {
  return { kind: 'post', id: p.id, author: p.author, authorId: p.authorId, body: p.title }
}
function commentTarget(c: BoardComment): ModTarget {
  return { kind: 'comment', id: c.id, author: c.author, authorId: c.authorId, body: c.body }
}

// ⋮ 메뉴: 차단 · 신고. 바깥을 누르면 닫힌다
function MoreMenu({ onClose, onBlock, onReport }: { onClose: () => void; onBlock: () => void; onReport: () => void }) {
  return (
    <>
      <button type="button" aria-label="메뉴 닫기" className="fixed inset-0 z-10 cursor-default" onClick={onClose} />
      <div
        role="menu"
        className="absolute top-full right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border-2 border-line bg-surface py-1 text-ink shadow-[0_4px_0_var(--color-line)]"
      >
        {[
          { label: '차단', icon: Ban, onClick: onBlock },
          { label: '신고', icon: Siren, onClick: onReport },
        ].map((m) => (
          <button
            key={m.label}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose()
              m.onClick()
            }}
            className="flex h-11 w-full cursor-pointer items-center gap-2.5 px-4 text-[15px] font-semibold active:bg-bg"
          >
            <m.icon className="size-5 text-muted" aria-hidden />
            {m.label}
          </button>
        ))}
      </div>
    </>
  )
}

// 차단 확인
function BlockSheet({ target, onClose, onDone }: { target: ModTarget; onClose: () => void; onDone: () => void }) {
  const [error, setError] = useState('')
  return (
    <Sheet title="이 사용자를 차단할까요?" onClose={onClose}>
      <p className="text-[15px] text-pretty text-muted">
        {target.author}님의 글과 댓글이 더 이상 보이지 않아요. 랭킹에는 그대로 나와요.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[14px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="danger"
          onClick={async () => {
            const r =
              target.kind === 'post' ? await api.blockPostAuthor(target.id) : await api.blockCommentAuthor(target.id)
            if ('error' in r) setError(r.error)
            else onDone()
          }}
        >
          차단
        </Button>
      </div>
    </Sheet>
  )
}

// 신고 사유 고르기. 신고는 관리자 화면의 '신고 내역'에 쌓인다.
function ReportSheet({ target, onClose }: { target: ModTarget; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (done) {
    return (
      <Sheet title="신고했어요" onClose={onClose}>
        <p className="text-[15px] text-muted">운영자가 확인한 뒤 처리해요.</p>
        <Button variant="primary" className="mt-5 w-full" onClick={onClose}>
          확인
        </Button>
      </Sheet>
    )
  }

  return (
    <Sheet title="신고 사유를 골라 주세요" onClose={onClose}>
      <p className="line-clamp-2 rounded-xl bg-bg px-3.5 py-2.5 text-[14px] text-muted">
        {target.kind === 'post' ? '게시글' : '댓글'} · {target.author}: {target.body}
      </p>
      <div role="radiogroup" aria-label="신고 사유" className="mt-3 divide-y-2 divide-line">
        {REPORT_REASONS.map((r) => (
          <label key={r} className="flex h-12 cursor-pointer items-center gap-3 text-[15px]">
            <input
              type="radio"
              name="report-reason"
              checked={reason === r}
              onChange={() => setReason(r)}
              className="size-4 cursor-pointer accent-primary"
            />
            {r}
          </label>
        ))}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[14px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Button onClick={onClose}>취소</Button>
        <Button
          variant="danger"
          disabled={!reason}
          onClick={async () => {
            if (!reason) return
            const r =
              target.kind === 'post'
                ? await api.reportPost(target.id, reason)
                : await api.reportComment(target.id, reason)
            if ('error' in r) setError(r.error)
            else setDone(true)
          }}
        >
          신고
        </Button>
      </div>
    </Sheet>
  )
}

function CommentBox({
  postId,
  inputRef,
  replyTo,
  onCancelReply,
  onAdded,
}: {
  postId: string
  inputRef: React.RefObject<HTMLInputElement | null>
  replyTo: BoardComment | null
  onCancelReply: () => void
  onAdded: (c: BoardComment) => void
}) {
  const [text, setText] = useState('')
  const [anonymous, setAnonymous] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!text.trim() || busy) return
    setBusy(true)
    setError('')
    const r = await api.addComment(postId, text, anonymous, replyTo?.id)
    setBusy(false)
    if ('error' in r) return setError(r.error)
    onAdded(r)
    setText('')
  }

  return (
    <form onSubmit={submit} className="-mx-5 bg-bg px-5 pt-3">
      {replyTo && (
        <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-primary">
          <CornerDownRight className="size-4" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{replyTo.author}님 댓글에 대댓글 쓰는 중</span>
          <button
            type="button"
            onClick={onCancelReply}
            className="-my-2 flex h-9 cursor-pointer items-center gap-0.5 rounded-lg px-2 text-muted active:bg-line/60"
          >
            <X className="size-4" aria-hidden />
            취소
          </button>
        </div>
      )}
      <div className="flex items-center gap-2 rounded-xl border-2 border-line bg-surface pl-3 focus-within:border-primary">
        <AnonymousCheck checked={anonymous} onChange={setAnonymous} id="cmt-anon" />
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={replyTo ? '대댓글을 입력하세요' : '댓글을 입력하세요'}
          aria-label={replyTo ? '대댓글' : '댓글'}
          maxLength={500}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted/70 focus:outline-none"
        />
        <button
          type="submit"
          aria-label="댓글 올리기"
          disabled={!text.trim() || busy}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center text-primary disabled:cursor-not-allowed disabled:text-muted/50"
        >
          <SendHorizontal className="size-5" aria-hidden />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

function AnonymousCheck({ checked, onChange, id }: { checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <label htmlFor={id} className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[13px] font-bold">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 cursor-pointer accent-primary"
      />
      <span className={checked ? 'text-primary' : 'text-muted'}>익명</span>
    </label>
  )
}

// ---- 글쓰기 ----

// 새 글 쓰기와 수정이 같은 화면을 쓴다. editing이 있으면 그 글로 채우고 게시판은 못 바꾼다.
function WriteForm({ initialBoard, editing }: { initialBoard: BoardKind; editing?: BoardPost }) {
  const navigate = useNavigate()
  const [board, setBoard] = useState<BoardKind>(initialBoard)
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  const [tags, setTags] = useState<string[]>(editing?.tags ?? [])
  const [anonymous, setAnonymous] = useState(editing?.anonymous ?? true)
  const [study, setStudy] = useState(() => {
    const s = editing?.study
    return s
      ? { course: s.course, minXp: String(s.minXp), capacity: String(s.capacity), contact: s.contact ?? '' }
      : { course: '', minXp: '', capacity: '4', contact: '' }
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const input = {
      title,
      body,
      tags,
      anonymous,
      study:
        board === 'study'
          ? {
              course: study.course,
              minXp: Number(study.minXp) || 0,
              capacity: Number(study.capacity) || 0,
              contact: study.contact,
            }
          : undefined,
    }
    const r = editing ? await api.updatePost(editing.id, input) : await api.createPost({ ...input, board })
    setBusy(false)
    if ('error' in r) return setError(r.error)
    // 글쓰기·수정 화면은 기록에서 빼고 그 글로
    navigate(`/board?post=${r.id}`, { replace: true, state: { scrollTop: true } })
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <PageTitle title={editing ? '글 수정' : '글 쓰기'} sub={editing && boardLabel[editing.board]} />

      {!editing && (
        <Segmented
          label="게시판"
          value={board}
          options={BOARDS.map((b) => [b.key, shortLabel[b.key]] as const)}
          onChange={setBoard}
        />
      )}

      <Field
        label="제목"
        id="post-title"
        value={title}
        maxLength={60}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={board === 'study' ? '예: 자료구조 중간고사 대비 스터디' : '제목'}
      />

      <div>
        <label htmlFor="post-body" className="text-sm font-semibold">
          내용
        </label>
        <textarea
          id="post-body"
          value={body}
          maxLength={2000}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          placeholder={board === 'question' ? '궁금한 점을 자세히 적을수록 답이 빨리 와요.' : '내용을 입력하세요.'}
          className="mt-1.5 w-full resize-none rounded-xl border-2 border-line bg-surface px-3.5 py-3 text-base leading-relaxed placeholder:text-muted/70 focus:border-primary focus:outline-none"
        />
      </div>

      <TagInput tags={tags} onChange={setTags} />

      {board === 'study' && (
        <fieldset className="space-y-4 rounded-2xl border-2 border-line bg-surface p-4">
          <legend className="px-1 text-sm font-bold">모집 조건</legend>
          <Field
            label="과목·주제"
            id="study-course"
            value={study.course}
            onChange={(e) => setStudy({ ...study, course: e.target.value })}
            placeholder="예: 자료구조"
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="최소 누적 XP"
              id="study-minxp"
              type="number"
              inputMode="numeric"
              min={0}
              value={study.minXp}
              onChange={(e) => setStudy({ ...study, minXp: e.target.value })}
              placeholder="1000"
            />
            <Field
              label="모집 인원"
              id="study-capacity"
              type="number"
              inputMode="numeric"
              min={2}
              max={20}
              value={study.capacity}
              onChange={(e) => setStudy({ ...study, capacity: e.target.value })}
            />
          </div>
          <Field
            label="연락 방법"
            id="study-contact"
            value={study.contact}
            onChange={(e) => setStudy({ ...study, contact: e.target.value })}
            placeholder="오픈채팅 링크"
            hint="조건을 채워 참여한 사람에게만 보여요."
          />
        </fieldset>
      )}

      <div className="flex items-center justify-between rounded-xl border-2 border-line bg-surface px-4 py-3">
        <AnonymousCheck checked={anonymous} onChange={setAnonymous} id="post-anon" />
        <span className="text-[13px] text-muted">{anonymous ? '이름 대신 "익명"으로 보여요' : '내 이름이 보여요'}</span>
      </div>

      {error && (
        <p role="alert" className="text-center text-[14px] font-semibold text-danger">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => navigate(-1)}>취소</Button>
        <Button type="submit" variant="primary" disabled={busy || !title.trim() || !body.trim()}>
          {busy ? (editing ? '고치는 중…' : '올리는 중…') : editing ? '수정 완료' : '올리기'}
        </Button>
      </div>
    </form>
  )
}

// 태그 입력: 엔터·쉼표·띄어쓰기로 하나씩 추가. 한글 조합 중 엔터는 무시한다.
function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [draft, setDraft] = useState('')

  function commit(text = draft) {
    const next = cleanTags([...tags, ...text.split(/[\s,]+/)])
    onChange(next)
    setDraft('')
  }

  return (
    <div>
      <label htmlFor="post-tags" className="text-sm font-semibold">
        태그 <span className="font-normal text-muted">(최대 5개)</span>
      </label>
      <div className="mt-1.5 flex min-h-12 flex-wrap items-center gap-1.5 rounded-xl border-2 border-line bg-surface px-2.5 py-2 focus-within:border-primary">
        {tags.map((t) => (
          <span
            key={t}
            className="flex h-8 items-center gap-1 rounded-full bg-primary-soft pr-1 pl-3 text-[14px] font-semibold text-primary-deep"
          >
            #{t}
            <button
              type="button"
              aria-label={`${t} 태그 빼기`}
              onClick={() => onChange(tags.filter((x) => x !== t))}
              className="flex size-6 cursor-pointer items-center justify-center rounded-full active:bg-primary/15"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </span>
        ))}
        {tags.length < 5 && (
          <input
            id="post-tags"
            value={draft}
            onChange={(e) => {
              const v = e.target.value
              // 쉼표·띄어쓰기를 치면 그 앞까지 태그로
              if (/[\s,]$/.test(v)) commit(v)
              else setDraft(v)
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') {
                e.preventDefault()
                if (draft.trim()) commit()
              } else if (e.key === 'Backspace' && !draft && tags.length) {
                onChange(tags.slice(0, -1))
              }
            }}
            onBlur={() => draft.trim() && commit()}
            placeholder={tags.length ? '' : '예: 자료구조 시험'}
            className="h-8 min-w-24 flex-1 bg-transparent px-1 text-base placeholder:text-muted/70 focus:outline-none"
          />
        )}
      </div>
    </div>
  )
}
