import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FileAudio, Mic, RotateCcw, Square } from 'lucide-react'
import { localDate } from '../../shared/mock'
import { api, ApiError } from '../api/client'
import { LIBRARY_NAME } from '../lib/names'
import { Button, Field, PageTitle, Section, Segmented } from '../components/ui'
import { cn } from '../lib/cn'

// 녹음·업로드 화면. 바로 녹음(MediaRecorder)과 파일 업로드 모두 AI 서버(POST /api/lectures)로 올라간다.
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
        <LiveRecorder />
      ) : (
        <UploadForm initialCourse={params.get('course') ?? ''} initialDate={params.get('date') ?? ''} />
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
          {file ? `${(file.size / 1024 / 1024).toFixed(1)}MB · 눌러서 바꾸기` : 'm4a, mp3, wav, webm, aac, ogg, flac'}
        </span>
        <input
          type="file"
          // audio/*로 받으면 안드로이드가 '음성 녹음'을 같이 띄운다. 업로드 탭이니 파일 확장자로만 받는다
          accept=".m4a,.mp3,.wav,.webm,.aac,.ogg,.flac,.mp4"
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

// 바로 녹음: 마이크로 녹음해서 파일 업로드와 같은 POST /api/lectures 로 올린다.
// 녹음하는 동안 화면이 꺼지지 않게 Wake Lock을 건다(지원하는 브라우저만). 녹음 중에 나가려 하면 한 번 묻는다.
type RecState = 'idle' | 'starting' | 'recording' | 'done'

// 브라우저가 지원하는 형식 중 고른다. 크롬·안드로이드는 webm, 사파리는 mp4(m4a)
function pickFormat(): { mimeType?: string; ext: string } {
  const options = [
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
    { mimeType: 'audio/mp4', ext: 'm4a' },
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
  ]
  return options.find((o) => MediaRecorder.isTypeSupported(o.mimeType)) ?? { ext: 'webm' }
}

function formatTime(sec: number) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

function LiveRecorder() {
  const navigate = useNavigate()
  const [state, setState] = useState<RecState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [course, setCourse] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null)

  // 녹음 중 시간 표시
  useEffect(() => {
    if (state !== 'recording') return
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt.current) / 1000)), 250)
    return () => clearInterval(t)
  }, [state])

  // 녹음 중에 다른 곳으로 나가려 하면 묻는다
  useEffect(() => {
    if (state !== 'recording') return
    const onLeave = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [state])

  // 화면을 떠나면 마이크를 끈다
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach((t) => t.stop())
      void wakeLock.current?.release().catch(() => {})
    },
    [],
  )

  // 미리 듣기 주소는 바뀔 때마다 이전 것을 정리한다
  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview])

  async function start() {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('이 브라우저는 녹음을 지원하지 않아요. 파일 업로드를 써 주세요.')
      return
    }
    setState('starting')
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setState('idle')
      setError('마이크를 쓸 수 없어요. 브라우저 주소창의 권한에서 마이크를 허용해 주세요.')
      return
    }
    const { mimeType, ext } = pickFormat()
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined)
    chunks.current = []
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
    rec.onstop = () => {
      stream.current?.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunks.current, { type: rec.mimeType || mimeType || 'audio/webm' })
      const f = new File([blob], `녹음-${localDate()}.${ext}`, { type: blob.type })
      setFile(f)
      setPreview(URL.createObjectURL(blob))
      setState('done')
    }
    rec.start(1000) // 1초마다 조각을 받아 둔다(중간에 끊겨도 앞부분은 남는다)
    recorder.current = rec
    startedAt.current = Date.now()
    setSeconds(0)
    setState('recording')
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
      wakeLock.current = (await nav.wakeLock?.request('screen')) ?? null
    } catch {
      // 화면 켜짐 유지를 못 해도 녹음은 된다
    }
  }

  function stop() {
    recorder.current?.stop()
    void wakeLock.current?.release().catch(() => {})
    wakeLock.current = null
  }

  function reset() {
    setFile(null)
    setPreview('')
    setSeconds(0)
    setState('idle')
  }

  async function upload() {
    if (!file || !course.trim() || busy) return
    const form = new FormData()
    form.append('audio', file)
    form.append('course', course.trim())
    if (title.trim()) form.append('title', title.trim())
    form.append('recordedAt', localDate())
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

  const recording = state === 'recording'

  return (
    <>
      <div className="flex flex-col items-center py-4 text-center">
        <p className="text-sm font-semibold text-muted">
          {recording ? '녹음 중 · 누르면 끝내요' : state === 'done' ? '녹음 끝' : '눌러서 녹음 시작'}
        </p>
        <p className={cn('mt-1 text-[48px] leading-none font-bold tabular-nums', recording && 'text-accent-ink')}>
          {formatTime(seconds)}
        </p>
        {state !== 'done' && (
          <button
            type="button"
            aria-label={recording ? '녹음 끝내기' : '녹음 시작'}
            aria-pressed={recording}
            disabled={state === 'starting'}
            onClick={recording ? stop : start}
            className={cn(
              'press mt-7 flex size-28 cursor-pointer items-center justify-center rounded-full bg-highlight text-primary-deep shadow-[0_6px_0_var(--color-highlight-deep)] ring-8 ring-highlight/30 active:shadow-[0_3px_0_var(--color-highlight-deep)] focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-primary disabled:opacity-60',
              recording && 'animate-pulse motion-reduce:animate-none',
            )}
          >
            {recording ? (
              <Square className="size-10" fill="currentColor" strokeWidth={2.5} aria-hidden />
            ) : (
              <Mic className="size-11" strokeWidth={2.5} aria-hidden />
            )}
          </button>
        )}
        {state === 'done' && preview && (
          <div className="mt-5 w-full space-y-2">
            <audio controls src={preview} className="w-full" />
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[14px] font-semibold text-muted active:bg-line/60"
            >
              <RotateCcw className="size-4" aria-hidden />
              다시 녹음
            </button>
          </div>
        )}
        <p role="status" className="mt-6 min-h-5 text-[13px] text-pretty text-muted">
          {error ? (
            <span className="font-semibold text-danger">{error}</span>
          ) : recording ? (
            '녹음하는 동안 화면을 켜 두세요. 다른 앱으로 가면 끊길 수 있어요.'
          ) : (
            '화면이 꺼지면 끊길 수 있어요. 긴 강의는 파일 업로드가 안전해요.'
          )}
        </p>
      </div>

      <Field
        label="과목"
        id="course"
        placeholder="예: 자료구조"
        value={course}
        onChange={(e) => setCourse(e.target.value)}
        hint={`${LIBRARY_NAME}에서 과목별로 모아 보여줘요.`}
      />
      {state === 'done' && (
        <>
          <Field
            label="강의 제목 (선택)"
            id="title-record"
            placeholder="비워 두면 'N주차 — 주제'로 자동으로 붙어요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Button variant="primary" className="w-full" disabled={!course.trim() || busy} onClick={upload}>
            {busy ? '올리는 중…' : course.trim() ? '업로드하고 요약 시작' : '과목을 쓰면 올릴 수 있어요'}
          </Button>
        </>
      )}
    </>
  )
}
