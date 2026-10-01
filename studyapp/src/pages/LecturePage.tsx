import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CalendarClock, CircleAlert, Layers, Loader, Megaphone, Play } from 'lucide-react'
import type { Concept, Lecture } from '../../shared/types'
import { api } from '../api/client'
import { RecordingPlayer, SummaryPlayer } from '../components/LectureListen'
import { ButtonLink, Card, Segmented, Tag } from '../components/ui'
import { clock } from '../lib/time'

// 강의 상세: 듣기(TTS) · 퀴즈(문제 풀기·플래시카드) · 전체 요약 탭. 기본은 듣기.
// 업로드 직후엔 처리 중이라 몇 초마다 다시 불러와 단계·진행률을 보여준다.

type Tab = 'tts' | 'quiz' | 'text'

const POLL_MS = 3000

const stageLabel: Record<string, string> = {
  queued: '차례를 기다리는 중',
  preprocessing: '녹음 소리를 다듬는 중',
  transcribing: '말을 글로 받아 적는 중',
  summarizing: '핵심 개념을 정리하는 중',
}

export function LecturePage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'quiz' || params.get('tab') === 'text' ? (params.get('tab') as Tab) : 'tts'
  const listen = params.get('listen') === 'recording' ? 'recording' : 'summary'
  // 개념의 '근거 듣기'에서 넘어오면 녹음의 그 위치(초)
  const startAt = params.has('t') ? Number(params.get('t')) : undefined
  // undefined: 불러오는 중, null: 없음
  const [lecture, setLecture] = useState<Lecture | null | undefined>(undefined)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [cardCount, setCardCount] = useState(0) // AI 플래시카드 수(개념 수가 아니다)
  const status = lecture?.status

  useEffect(() => {
    if (id) api.lecture(id).then(setLecture)
  }, [id])

  useEffect(() => {
    if (!id || status !== 'processing') return
    const timer = setInterval(() => api.lecture(id).then(setLecture), POLL_MS)
    return () => clearInterval(timer)
  }, [id, status])

  // 요약이 끝나야 개념이 생긴다
  useEffect(() => {
    if (status === 'ready') {
      api.concepts().then((list) => setConcepts(list.filter((c) => c.lectureId === id)))
      if (id) api.lectureCards(id).then((cards) => setCardCount(cards.length))
    }
  }, [id, status])

  if (!lecture) {
    return (
      <p className="text-[15px] text-muted">
        {lecture === undefined ? '강의를 불러오는 중이에요.' : '강의를 찾을 수 없어요.'}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-bold text-balance">{lecture.title}</h1>
          <p className="mt-1.5 flex items-center gap-2 text-[13px] text-muted">
            {lecture.durationMin}분
            {lecture.status === 'ready' ? (
              <Tag tone="success">요약 완료</Tag>
            ) : lecture.status === 'failed' ? (
              <Tag tone="danger">처리 실패</Tag>
            ) : (
              <Tag tone="accent">요약 중</Tag>
            )}
          </p>
        </div>
      </div>

      {lecture.status === 'processing' ? (
        <Processing lecture={lecture} />
      ) : lecture.status === 'failed' ? (
        <Card className="flex flex-col items-center px-5 py-10 text-center">
          <CircleAlert className="size-7 text-danger" aria-hidden />
          <p className="mt-3 text-[16px] font-bold">녹음을 처리하지 못했어요</p>
          {lecture.error && (
            <p className="mt-1.5 text-[14px] text-pretty text-muted">{lecture.error}</p>
          )}
          <ButtonLink
            to={`/record?mode=upload&course=${encodeURIComponent(lecture.course)}`}
            variant="primary"
            className="mt-5 w-full"
          >
            다시 올리기
          </ButtonLink>
        </Card>
      ) : (
        <>
          <Segmented
            label="요약 보기 방식"
            value={tab}
            options={[
              ['tts', '듣기'],
              ['quiz', '퀴즈'],
              ['text', '전체 요약'],
            ]}
            onChange={(key) => setParams({ tab: key }, { replace: true })}
          />

          {tab === 'quiz' && (
            <Card className="space-y-4 p-4">
              <div>
                <p className="text-[17px] font-bold">퀴즈 풀기</p>
                <p className="mt-2 flex gap-1.5">
                  <Tag>객관식</Tag>
                  <Tag>O/X</Tag>
                  <Tag>서술형</Tag>
                </p>
              </div>
              <ButtonLink to={`/quiz?lecture=${lecture.id}`} variant="primary" className="w-full">
                유형 고르고 시작
              </ButtonLink>
            </Card>
          )}
          {tab === 'quiz' &&
            (cardCount + concepts.length > 0 ? (
              <Card className="space-y-4 p-4">
                <div>
                  <p className="text-[17px] font-bold">플래시카드 {cardCount || concepts.length}장</p>
                  <p className="mt-1 text-[14px] text-muted">
                    질문을 보고 답을 떠올린 뒤, 뒤집어서 확인해요. 끝까지 넘기면 장수만큼 XP.
                  </p>
                </div>
                <ButtonLink to={`/flashcards?lecture=${lecture.id}`} className="w-full">
                  <Layers className="size-5" aria-hidden />
                  플래시카드 넘기기
                </ButtonLink>
              </Card>
            ) : (
              <p className="text-[15px] text-muted">이 강의에서 뽑힌 개념이 아직 없어요.</p>
            ))}
          {tab === 'tts' && (
            <>
              <Segmented
                label="듣기 방식"
                value={listen}
                options={[
                  ['summary', '요약 듣기'],
                  ['recording', '녹음 다시 듣기'],
                ]}
                onChange={(key) => setParams({ tab: 'tts', listen: key }, { replace: true })}
              />
              {/* TODO: 요약 듣기 5분마다 XP (POST /api/xp tts_5min) */}
              {listen === 'summary' ? (
                <SummaryPlayer lecture={lecture} concepts={concepts} />
              ) : (
                <RecordingPlayer lectureId={lecture.id} startAt={startAt} />
              )}
            </>
          )}
          {tab === 'text' && lecture.overview && (
            <Card className="p-4">
              <p className="text-[13px] font-semibold text-muted">강의 개요</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-pretty">{lecture.overview}</p>
            </Card>
          )}
          {tab === 'text' && (lecture.announcements?.length ?? 0) > 0 && (
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-accent-ink">
                <Megaphone className="size-4" aria-hidden />
                시험·과제 공지
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed">
                {lecture.announcements!.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Card>
          )}
          {tab === 'text' && (lecture.preview?.length ?? 0) > 0 && (
            <Card className="p-4">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-muted">
                <CalendarClock className="size-4" aria-hidden />
                다음 시간 예고
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-pretty">
                {lecture.preview!.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Card>
          )}
          {tab === 'text' && concepts.length > 0 && (
            <Card>
              <p className="border-b-2 border-line px-4 py-2.5 text-[13px] font-semibold text-muted">
                이 강의의 개념 {concepts.length}개
              </p>
              <ul className="divide-y-2 divide-line">
                {concepts.map((c) => (
                  <li key={c.id} className="px-4 py-3.5">
                    <p className="text-[15px] font-bold">{c.term}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-pretty text-muted">
                      {c.summary}
                    </p>
                    <Evidence
                      concept={c}
                      onListen={(sec) => setParams({ tab: 'tts', listen: 'recording', t: String(Math.floor(sec)) })}
                    />
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {tab === 'text' && !lecture.overview && concepts.length === 0 && (
            <p className="py-6 text-center text-[15px] text-muted">아직 요약이 없어요.</p>
          )}
        </>
      )}
    </div>
  )
}

// 개념의 근거: 녹음에서 그 개념을 말한 시간. 누르면 녹음 다시 듣기의 그 위치로 간다.
// 못 찾았으면 AI가 정리하며 바꾼 말일 수 있다고 알려, 학생이 요약을 그대로 믿지 않게 한다.
function Evidence({ concept, onListen }: { concept: Concept; onListen: (sec: number) => void }) {
  if (!concept.evidence) return null
  if (concept.evidence.length === 0) {
    return (
      <p className="mt-2 text-[13px] text-pretty text-muted">
        녹음에서 같은 표현을 찾지 못했어요. AI가 정리하며 바꾼 말일 수 있어요.
      </p>
    )
  }
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-[13px] font-semibold text-muted">근거 듣기</span>
      {concept.evidence.map((e) => (
        <button
          key={e.start}
          type="button"
          title={e.text}
          onClick={() => onListen(e.start)}
          className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-highlight-soft px-2 text-[13px] font-semibold text-primary-deep tabular-nums"
        >
          <Play className="size-3.5" aria-hidden />
          {clock(e.start)}
        </button>
      ))}
    </div>
  )
}

function Processing({ lecture }: { lecture: Lecture }) {
  const label = stageLabel[lecture.stage ?? ''] ?? '요약을 만드는 중'
  // 진행률은 받아 적는 단계에서만 온다
  const pct = lecture.stage === 'transcribing' && lecture.progress != null ? Math.round(lecture.progress * 100) : null
  return (
    <Card role="status" className="flex flex-col items-center px-5 py-10 text-center">
      <Loader className="size-7 animate-spin text-muted motion-reduce:animate-none" aria-hidden />
      <p className="mt-3 text-[16px] font-bold">{label}</p>
      {pct !== null && (
        <div className="mt-3 h-2.5 w-full max-w-60 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-bright transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="mt-3 text-[14px] text-pretty text-muted">
        2시간 녹음 기준 2~3분 걸려요. 다른 화면에 가 있어도 계속 처리돼요.
      </p>
      <ButtonLink to="/" className="mt-5">
        홈으로
      </ButtonLink>
    </Card>
  )
}
