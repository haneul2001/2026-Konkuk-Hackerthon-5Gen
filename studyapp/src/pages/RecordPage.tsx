import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileAudio, Mic } from 'lucide-react'
import { localDate } from '../../shared/mock'
import { api, ApiError } from '../api/client'
import { LIBRARY_NAME } from '../lib/names'
import { Button, Field, PageTitle, Placeholder, Section, Segmented } from '../components/ui'

// 녹음·업로드 화면. 파일 업로드는 AI 서버로 바로 올라가고, 바로 녹음(MediaRecorder)은 팀원 담당이라 인터페이스만 둔다.
// 녹음 버튼은 화면에 들어오자마자 가운데에 보이도록 탭 바로 아래에 둔다.

const steps = [
  '녹음 또는 파일 업로드',
  '음성 인식(STT)으로 텍스트 변환',
  'AI가 핵심 개념 단위로 요약',
  '요약에서 플래시카드와 퀴즈 생성',
  `완료되면 ${LIBRARY_NAME}에 녹음본과 개념이 저장`,
]

export function RecordPage() {
  const [params, setParams] = useSearchParams()
  const mode = params.get('mode') === 'upload' ? 'upload' : 'record'
  const [notice, setNotice] = useState(false)

  return (
    <div className="space-y-6">
      <PageTitle title="강의 녹음" />

      <Segmented
        label="녹음 방식"
        value={mode}
        options={[
          ['record', '바로 녹음'],
          ['upload', '파일 업로드'],
        ]}
        onChange={(m) => setParams(m === 'upload' ? { mode: 'upload' } : {}, { replace: true })}
      />

      {mode === 'record' ? (
        <>
          <div className="flex flex-col items-center py-4 text-center">
            <p className="text-sm font-semibold text-muted">눌러서 녹음 시작</p>
            <p className="mt-1 text-[48px] leading-none font-bold tabular-nums">00:00</p>
            <button
              type="button"
              aria-label="녹음 시작"
              onClick={() => setNotice(true)}
              className="press mt-7 flex size-28 cursor-pointer items-center justify-center rounded-full bg-accent text-white shadow-[0_6px_0_var(--color-accent-ink)] ring-8 ring-accent-soft active:shadow-[0_3px_0_var(--color-accent-ink)] focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-primary"
            >
              <Mic className="size-11" strokeWidth={2.5} aria-hidden />
            </button>
            <p role="status" className="mt-6 min-h-5 text-[13px] text-pretty text-muted">
              {notice
                ? '녹음 기능은 아직 연결 전이에요. 파이프라인이 붙으면 바로 동작해요.'
                : '화면이 꺼지면 끊길 수 있어요. 긴 강의는 파일 업로드가 안전해요.'}
            </p>
          </div>

          <Field
            label="과목"
            id="course"
            placeholder="예: 자료구조"
            hint={`${LIBRARY_NAME}에서 과목별로 모아 보여줘요.`}
          />
        </>
      ) : (
        <UploadForm initialCourse={params.get('course') ?? ''} initialDate={params.get('date') ?? ''} />
      )}

      {mode === 'record' && (
        <Placeholder
          title="녹음 기능 준비 중"
          description="MediaRecorder로 녹음해서 파일 업로드와 같은 POST /api/lectures로 올리면 된다. 이후 STT → 요약 → 개념은 AI 서버가 한다."
          endpoint="POST /api/lectures (multipart: audio, course)"
          owner="팀원(녹음만)"
        />
      )}

      <Section title="처리 흐름">
        <ol className="space-y-3">
          {steps.map((s, i) => (
            <li key={s} className="flex items-center gap-3 text-[15px]">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[13px] font-bold text-primary-deep tabular-nums">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}

// 학습 탭 캘린더의 '+'에서 오면 녹음한 날(date)이 채워져 있다.
function UploadForm({ initialCourse, initialDate }: { initialCourse: string; initialDate: string }) {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [course, setCourse] = useState(initialCourse)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : localDate())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ready = !!file && course.trim().length > 0

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || busy) return
    const form = new FormData()
    form.append('audio', file)
    form.append('course', course.trim())
    if (title.trim()) form.append('title', title.trim())
    if (date) form.append('recordedAt', date)
    setBusy(true)
    setError('')
    try {
      const lecture = await api.uploadLecture(form)
      navigate(`/lectures/${lecture.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '올리지 못했어요. 잠시 뒤 다시 해 주세요.')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-line-strong bg-surface px-5 py-10 text-center active:bg-bg has-focus-visible:outline-2 has-focus-visible:outline-primary">
        <span className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <FileAudio className="size-6" aria-hidden />
        </span>
        <span className="mt-3 max-w-full truncate text-[15px] font-bold">
          {file ? file.name : '녹음 파일 선택'}
        </span>
        <span className="mt-1 text-[13px] text-muted">
          {file ? `${(file.size / 1024 / 1024).toFixed(1)}MB · 눌러서 바꾸기` : 'm4a, mp3, wav, webm'}
        </span>
        <input
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <Field
        label="과목"
        id="course-upload"
        placeholder="예: 자료구조"
        value={course}
        onChange={(e) => setCourse(e.target.value)}
        hint={`${LIBRARY_NAME}에서 과목별로 모아 보여줘요.`}
      />
      <Field
        label="녹음한 날"
        id="date-upload"
        type="date"
        value={date}
        max={localDate()}
        onChange={(e) => setDate(e.target.value)}
        hint="학습 탭 캘린더에 이 날짜로 들어가요."
      />
      <Field
        label="강의 제목 (선택)"
        id="title-upload"
        placeholder="비워 두면 'N주차 — 주제'로 자동으로 붙어요"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Button type="submit" variant="primary" disabled={!ready || busy} className="w-full">
        {busy ? '올리는 중…' : '업로드하고 요약 시작'}
      </Button>
      {error && (
        <p role="alert" className="text-center text-[14px] font-semibold text-danger">
          {error}
        </p>
      )}
    </form>
  )
}
