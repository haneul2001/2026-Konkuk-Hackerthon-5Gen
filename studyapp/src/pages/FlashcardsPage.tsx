import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { CardSession, Concept, Folder } from '../../shared/types'
import { cardFromConcept } from '../../shared/cards'
import { api } from '../api/client'
import { LIBRARY_NAME } from '../lib/names'
import { Flashcards, type CardResult } from '../components/Flashcards'
import { ButtonLink, Card, ListSkeleton, PageTitle } from '../components/ui'

// 플래시카드 보기. 무엇을 넘길지는 주소로 정한다.
//  /flashcards?lecture=ID   녹음(강의) 하나의 AI 플래시카드. 다시 볼 때가 된 카드가 먼저 나온다
//  /flashcards?folder=ID    내 개념 폴더의 개념 카드. 볼 때마다 순서를 섞는다
//  /flashcards?course=과목  학습 탭의 과목 필터 개념 카드 (없으면 전체 개념)
// 첫 세트를 끝까지 넘기면 카드 수만큼 XP.

export function FlashcardsPage() {
  const [params] = useSearchParams()
  const lectureId = params.get('lecture')
  return lectureId ? <LectureCards lectureId={lectureId} /> : <ConceptCards />
}

// 주소로 바로 들어왔으면 뒤로 갈 곳이 없으니 학습 탭으로
function useQuit(fallback: string) {
  const navigate = useNavigate()
  return () => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate(fallback))
}

function LectureCards({ lectureId }: { lectureId: string }) {
  const quit = useQuit(`/lectures/${lectureId}?tab=quiz`)
  const [session, setSession] = useState<CardSession | null | undefined>(undefined)

  useEffect(() => {
    api.startCardSession(lectureId).then(setSession)
  }, [lectureId])

  const report = useCallback(
    async (results: CardResult[]) => {
      if (!session) return 0
      const r = await api.submitCardSession(session.id, results)
      return 'error' in r ? 0 : (r.xpGained ?? 0)
    },
    [session],
  )

  if (session === undefined) return <Loading />
  if (session === null || session.cards.length === 0) {
    return <Empty title="플래시카드" message="이 녹음의 플래시카드가 아직 없어요." to={`/lectures/${lectureId}?tab=quiz`} />
  }

  // 서버가 없을 때 대신 쓰는 개념 카드는 kind: 'concept'를 그대로 둔다
  return (
    <Flashcards
      title={session.title}
      cards={session.cards.map((c) => ({ kind: 'ai', ...c }))}
      quizTo={`/quiz?lecture=${lectureId}`}
      onFirstPass={report}
      onQuit={quit}
    />
  )
}

function ConceptCards() {
  const [params] = useSearchParams()
  const folderId = params.get('folder')
  const course = params.get('course') ?? ''
  const quit = useQuit('/library?tab=concepts')

  const [concepts, setConcepts] = useState<Concept[] | null>(null)
  const [folders, setFolders] = useState<Folder[] | null>(null)

  useEffect(() => {
    api.concepts().then(setConcepts)
    api.folders().then(setFolders)
  }, [])

  const report = useCallback(async (results: CardResult[]) => (await api.finishCardSet(results.length)).xpGained, [])

  if (concepts === null || folders === null) return <Loading />

  let title = course ? `${course} 개념` : `${LIBRARY_NAME} 전체 개념`
  let picked = concepts.filter((c) => !course || c.course === course)
  let quizTo: string | null = null
  const folder = folders.find((f) => f.id === folderId)
  if (folder) {
    title = folder.name
    picked = concepts.filter((c) => folder.conceptIds.includes(c.id))
    quizTo = `/quiz?folder=${folder.id}`
  }

  if (picked.length === 0) return <Empty title={title} message="넘겨 볼 개념이 아직 없어요." to="/library?tab=concepts" />

  return (
    <Flashcards title={title} cards={picked.map(cardFromConcept)} shuffled quizTo={quizTo} onFirstPass={report} onQuit={quit} />
  )
}

function Loading() {
  return (
    <div className="space-y-6">
      <PageTitle title="플래시카드" />
      <ListSkeleton rows={2} />
    </div>
  )
}

function Empty({ title, message, to }: { title: string; message: string; to: string }) {
  return (
    <div className="space-y-6">
      <PageTitle title="플래시카드" sub={title} />
      <Card className="px-5 py-8 text-center">
        <p className="text-[15px] text-muted">{message}</p>
        <ButtonLink to={to} variant="primary" className="mt-4">
          돌아가기
        </ButtonLink>
      </Card>
    </div>
  )
}
