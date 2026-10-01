import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Concept, Folder, Lecture, StudyCard } from '../../shared/types'
import { api } from '../api/client'
import { LIBRARY_NAME } from '../lib/names'
import { Flashcards, type Flash } from '../components/Flashcards'
import { ButtonLink, Card, ListSkeleton, PageTitle } from '../components/ui'

// 플래시카드 보기. 어떤 개념 묶음을 넘길지는 주소로 정한다.
//  /flashcards?folder=ID    내가 만든 폴더의 개념
//  /flashcards?lecture=ID   강의 하나의 개념
//  /flashcards?course=과목  서재의 과목 필터 (없으면 전체 개념)
// 카드는 AI 서버의 큐카드(질문 → 정답)를 쓰고, 큐카드가 없거나 서버가 없으면 개념 카드로 대신한다.

export function FlashcardsPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const folderId = params.get('folder')
  const lectureId = params.get('lecture')
  const course = params.get('course') ?? ''

  const [concepts, setConcepts] = useState<Concept[] | null>(null)
  const [folders, setFolders] = useState<Folder[] | null>(null)
  const [lectures, setLectures] = useState<Lecture[] | null>(null)

  useEffect(() => {
    api.concepts().then(setConcepts)
    api.folders().then(setFolders)
    api.lectures().then(setLectures)
  }, [])

  if (concepts === null || folders === null || lectures === null) {
    return (
      <div className="space-y-6">
        <PageTitle title="플래시카드" />
        <ListSkeleton rows={2} />
      </div>
    )
  }

  let title = course ? `${course} 개념` : `${LIBRARY_NAME} 전체 개념`
  let picked = concepts.filter((c) => !course || c.course === course)
  let quizTo: string | null = null

  const folder = folders.find((f) => f.id === folderId)
  const lecture = lectures.find((l) => l.id === lectureId)
  if (folder) {
    title = folder.name
    picked = concepts.filter((c) => folder.conceptIds.includes(c.id))
    quizTo = `/quiz?folder=${folder.id}`
  } else if (lecture) {
    title = lecture.title
    picked = concepts.filter((c) => c.lectureId === lecture.id)
    quizTo = `/quiz?lecture=${lecture.id}`
  }

  if (picked.length === 0) {
    return (
      <div className="space-y-6">
        <PageTitle title="플래시카드" sub={title} />
        <Card className="px-5 py-8 text-center">
          <p className="text-[15px] text-muted">넘겨 볼 개념이 아직 없어요.</p>
          <ButtonLink to="/library?tab=concepts" variant="primary" className="mt-4">
            {LIBRARY_NAME}으로
          </ButtonLink>
        </Card>
      </div>
    )
  }

  // 주소로 바로 들어왔으면 뒤로 갈 곳이 없으니 서재로
  const quit = () =>
    (window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/library?tab=concepts')

  return <Deck title={title} concepts={picked} quizTo={quizTo} onQuit={quit} />
}

// 고른 개념들의 큐카드를 받아 넘긴다. 큐카드가 없는 개념은 개념 카드로 채운다.
function Deck({
  title,
  concepts,
  quizTo,
  onQuit,
}: {
  title: string
  concepts: Concept[]
  quizTo: string | null
  onQuit: () => void
}) {
  const [cards, setCards] = useState<Flash[] | null>(null)
  const ids = concepts.map((c) => c.id).join(',')

  useEffect(() => {
    let alive = true
    api.cards(ids.split(',')).then((study) => {
      if (!alive) return
      const course = new Map(concepts.map((c) => [c.id, c.course]))
      const covered = new Set(study.map((s) => s.conceptId))
      setCards([
        ...study.map((s) => fromStudyCard(s, course.get(s.conceptId) ?? '')),
        ...shuffle(concepts.filter((c) => !covered.has(c.id))).map(fromConcept),
      ])
    })
    return () => {
      alive = false
    }
    // 개념 목록이 바뀔 때만 다시 받는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  if (cards === null) {
    return (
      <div className="space-y-6">
        <PageTitle title="플래시카드" sub={title} />
        <ListSkeleton rows={2} />
      </div>
    )
  }
  return <Flashcards title={title} cards={cards} quizTo={quizTo} onQuit={onQuit} />
}

function fromStudyCard(card: StudyCard, course: string): Flash {
  return {
    id: card.id,
    label: 'Q. 질문',
    icon: card.icon,
    front: card.front,
    answer: card.answer,
    detail: card.explanation,
    example: card.example,
    course,
    lectureTitle: card.lectureTitle,
    studyCardId: card.id,
  }
}

function fromConcept(c: Concept): Flash {
  return {
    id: c.id,
    label: 'Q. 이 설명에 맞는 개념은?',
    front: c.summary,
    answer: c.term,
    course: c.course,
    lectureTitle: c.lectureTitle,
  }
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
