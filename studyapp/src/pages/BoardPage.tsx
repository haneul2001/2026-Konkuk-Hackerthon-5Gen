import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { BoardPost, UserSummary } from '../../shared/types'
import { api } from '../api/client'
import {
  Button,
  Card,
  CourseBadge,
  Field,
  ListSkeleton,
  PageTitle,
  Placeholder,
  Row,
  Tag,
} from '../components/ui'

// 스터디 모집 게시판. 목록 + 상세(조건 충족 시 연락처 공개) + 글쓰기.

export function BoardPage() {
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('post')
  const writing = params.get('write') === '1'
  const [posts, setPosts] = useState<BoardPost[] | null>(null)
  const [me, setMe] = useState<UserSummary | null>(null)

  useEffect(() => {
    api.posts().then(setPosts)
    api.me().then(setMe)
  }, [])

  const selected = posts?.find((p) => p.id === selectedId)

  if (writing) return <WriteForm onCancel={() => setParams({})} />
  if (selected && me) return <PostDetail post={selected} me={me} />

  return (
    <div className="space-y-6">
      <PageTitle
        title="스터디 모집"
        sub={me && `내 누적 XP ${me.xpTotal.toLocaleString()} · 조건을 채우면 참여할 수 있어요.`}
      />

      {posts === null || me === null ? (
        <ListSkeleton rows={3} />
      ) : (
        <Card>
          <ul className="divide-y-2 divide-line">
            {posts.map((p) => {
              const eligible = me.xpTotal >= p.minXp
              const full = p.joined >= p.capacity
              return (
                <li key={p.id}>
                  <Row
                    onClick={() => setParams({ post: p.id })}
                    leading={<CourseBadge course={p.course} />}
                    title={p.title}
                    meta={
                      <span className="tabular-nums">
                        {p.joined}/{p.capacity}명 · XP {p.minXp.toLocaleString()} 이상
                      </span>
                    }
                    trailing={
                      full ? (
                        <Tag>마감</Tag>
                      ) : eligible ? (
                        <Tag tone="success">참여 가능</Tag>
                      ) : (
                        <Tag>XP 부족</Tag>
                      )
                    }
                  />
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <Button variant="primary" className="w-full" onClick={() => setParams({ write: '1' })}>
        <Plus className="size-5" strokeWidth={2.5} aria-hidden />
        모집글 쓰기
      </Button>
    </div>
  )
}

function PostDetail({ post, me }: { post: BoardPost; me: UserSummary }) {
  const eligible = me.xpTotal >= post.minXp
  const full = post.joined >= post.capacity
  const progress = Math.min(1, me.xpTotal / post.minXp)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <CourseBadge course={post.course} className="size-12" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{post.course}</p>
          <h1 className="text-[22px] leading-tight font-bold text-balance">{post.title}</h1>
          {full && (
            <p className="mt-1.5">
              <Tag>마감</Tag>
            </p>
          )}
        </div>
      </div>

      <Card className="grid grid-cols-2 divide-x-2 divide-line">
        <div className="p-4">
          <p className="text-xs font-medium text-muted">인원</p>
          <p className="mt-1 text-xl font-bold tabular-nums">
            {post.joined}/{post.capacity}명
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs font-medium text-muted">참여 조건</p>
          <p className="mt-1 text-xl font-bold tabular-nums">XP {post.minXp.toLocaleString()}</p>
        </div>
      </Card>

      {/* 내 XP가 조건에 얼마나 가까운지 */}
      <div>
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-semibold">내 누적 XP</span>
          <span className="tabular-nums text-muted">
            {me.xpTotal.toLocaleString()} / {post.minXp.toLocaleString()}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="참여 조건 달성률"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          className="mt-2 h-3 overflow-hidden rounded-full bg-line"
        >
          <div
            className={eligible ? 'h-full bg-success' : 'h-full bg-accent'}
            style={{ width: `${progress * 100}%` }}
          />
        </div>
      </div>

      {full ? (
        <p className="text-[15px] text-muted">모집이 끝났어요.</p>
      ) : eligible ? (
        <div className="space-y-2">
          <Button variant="primary" disabled className="w-full">
            참여하고 연락처 보기
          </Button>
          <p className="text-center text-[13px] text-muted">참여하면 오픈채팅 링크가 보여요.</p>
        </div>
      ) : (
        <p className="text-[15px] text-muted">
          <b className="text-accent-ink tabular-nums">
            {(post.minXp - me.xpTotal).toLocaleString()} XP
          </b>
          를 더 모으면 참여할 수 있어요.
        </p>
      )}

      <Placeholder
        title="참여 기능 준비 중"
        description="누적 XP 확인 → 참여 인원 증가 → 연락처 공개."
        endpoint="POST /api/posts/:id/join"
        owner="나"
      />
    </div>
  )
}

function WriteForm({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="space-y-5">
      <PageTitle title="모집글 쓰기" />
      <Field label="제목" id="title" placeholder="예: 자료구조 중간고사 대비 스터디" />
      <Field label="과목·주제" id="course" placeholder="예: 자료구조" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="최소 누적 XP" id="minXp" type="number" inputMode="numeric" placeholder="1000" />
        <Field label="모집 인원" id="capacity" type="number" inputMode="numeric" placeholder="4" />
      </div>
      <Field
        label="연락 방법"
        id="contact"
        placeholder="오픈채팅 링크"
        hint="조건을 채운 사람에게만 보여요."
      />
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Button onClick={onCancel}>취소</Button>
        <Button variant="primary" disabled>
          올리기
        </Button>
      </div>
      <Placeholder
        title="작성 기능 준비 중"
        description="입력값 검증 후 저장."
        endpoint="POST /api/posts"
        owner="나"
      />
    </div>
  )
}
