import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileAudio, Mic } from 'lucide-react'
import { LIBRARY_NAME } from '../lib/names'
import { Button, Field, PageTitle, Placeholder, Section, Segmented } from '../components/ui'

// 녹음·업로드 화면. 녹음 파이프라인은 팀원 담당이라 인터페이스만 둔다.
// 녹음 버튼은 화면에 들어오자마자 가운데에 보이도록 탭 바로 아래에 둔다.

const steps = [
  '녹음 또는 파일 업로드',
  '음성 인식(STT)으로 텍스트 변환',
  'AI가 핵심 개념 단위로 요약',
  '요약에서 큐카드와 퀴즈 생성',
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
        <div className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed border-line-strong bg-surface px-5 py-10 text-center active:bg-bg has-focus-visible:outline-2 has-focus-visible:outline-primary">
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <FileAudio className="size-6" aria-hidden />
            </span>
            <span className="mt-3 text-[15px] font-bold">녹음 파일 선택</span>
            <span className="mt-1 text-[13px] text-muted">m4a, mp3, wav</span>
            <input type="file" accept="audio/*" className="sr-only" />
          </label>
          <Field
            label="과목"
            id="course-upload"
            placeholder="예: 자료구조"
            hint={`${LIBRARY_NAME}에서 과목별로 모아 보여줘요.`}
          />
          <Button variant="primary" disabled className="w-full">
            업로드하고 요약 시작
          </Button>
        </div>
      )}

      <Placeholder
        title={mode === 'record' ? '녹음 기능 준비 중' : '업로드 기능 준비 중'}
        description={
          mode === 'record'
            ? 'MediaRecorder로 녹음해서 서버에 올리기까지. 올라온 뒤 STT → 요약 → 큐카드·퀴즈는 내 담당.'
            : '파일을 서버에 올리기까지. 올라온 뒤 STT → 요약 → 큐카드·퀴즈는 내 담당.'
        }
        endpoint="POST /api/lectures"
        owner="팀원(녹음·업로드만)"
      />

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
