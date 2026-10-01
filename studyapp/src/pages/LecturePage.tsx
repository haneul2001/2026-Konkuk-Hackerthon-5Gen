import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Layers, Loader } from 'lucide-react'
import type { Concept, Lecture } from '../../shared/types'
import { api } from '../api/client'
import { ButtonLink, Card, CourseBadge, Placeholder, Segmented, Tag } from '../components/ui'

// 강의 상세: 요약 보기(TTS / 큐카드)와 퀴즈 시작.

type Tab = 'cards' | 'tts' | 'text'

export function LecturePage() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'cards'
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [concepts, setConcepts] = useState<Concept[]>([])

  useEffect(() => {
    api.lectures().then((list) => setLecture(list.find((l) => l.id === id) ?? null))
    api.concepts().then((list) => setConcepts(list.filter((c) => c.lectureId === id)))
  }, [id])

  if (!lecture) {
    return <p className="text-[15px] text-muted">강의를 불러오는 중이거나 찾을 수 없어요.</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <CourseBadge course={lecture.course} className="size-12" />
        <div className="min-w-0">
          <h1 className="text-[22px] leading-tight font-bold text-balance">{lecture.title}</h1>
          <p className="mt-1.5 flex items-center gap-2 text-[13px] text-muted">
            {lecture.durationMin}분
            {lecture.status === 'ready' ? (
              <Tag tone="success">요약 완료</Tag>
            ) : (
              <Tag tone="accent">요약 중</Tag>
            )}
          </p>
        </div>
      </div>

      {lecture.status === 'processing' ? (
        <Card className="flex flex-col items-center px-5 py-10 text-center">
          <Loader className="size-7 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
          <p className="mt-3 text-[15px] text-muted">요약을 만들고 있어요. 끝나면 알려드릴게요.</p>
          <ButtonLink to="/" className="mt-5">
            홈으로
          </ButtonLink>
        </Card>
      ) : (
        <>
          <Segmented
            label="요약 보기 방식"
            value={tab}
            options={[
              ['cards', '큐카드'],
              ['tts', '듣기'],
              ['text', '전체 요약'],
            ]}
            onChange={(key) => setParams({ tab: key }, { replace: true })}
          />

          {tab === 'cards' &&
            (concepts.length > 0 ? (
              <Card className="space-y-4 p-4">
                <div>
                  <p className="text-[17px] font-bold">큐카드 {concepts.length}장</p>
                  <p className="mt-1 text-[14px] text-muted">
                    설명을 보고 개념을 떠올린 뒤, 뒤집어서 확인해요.
                  </p>
                </div>
                <ButtonLink to={`/cards?lecture=${lecture.id}`} variant="primary" className="w-full">
                  <Layers className="size-5" aria-hidden />
                  큐카드 넘기기
                </ButtonLink>
              </Card>
            ) : (
              <p className="text-[15px] text-muted">이 강의에서 뽑힌 개념이 아직 없어요.</p>
            ))}
          {tab === 'tts' && (
            <Placeholder
              title="요약 듣기(TTS)"
              description="요약을 음성으로 재생. 5분마다 XP 지급, 하루 상한 있음."
              endpoint="GET /api/lectures/:id/audio"
              owner="나"
            />
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
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {tab === 'text' && (
            <Placeholder
              title="전체 요약"
              description="STT 텍스트를 핵심 개념 단위로 정리한 요약 본문."
              endpoint="GET /api/lectures/:id"
              owner="나"
            />
          )}

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
        </>
      )}
    </div>
  )
}
