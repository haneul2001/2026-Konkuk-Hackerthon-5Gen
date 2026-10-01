import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Concept, Folder, Lecture } from '../../shared/types'
import { api } from '../api/client'
import { LIBRARY_NAME } from '../lib/names'
import { Flashcards } from '../components/Flashcards'
import { ButtonLink, Card, ListSkeleton, PageTitle } from '../components/ui'

// 큐카드 보기. 어떤 개념 묶음을 넘길지는 주소로 정한다.
//  /cards?folder=ID    내가 만든 폴더의 개념
//  /cards?lecture=ID   강의 하나의 개념
//  /cards?course=과목  서재의 과목 필터 (없으면 전체 개념)

export function CardsPage() {
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
        <PageTitle title="큐카드" />
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
        <PageTitle title="큐카드" sub={title} />
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

  return <Flashcards title={title} concepts={picked} quizTo={quizTo} onQuit={quit} />
}
