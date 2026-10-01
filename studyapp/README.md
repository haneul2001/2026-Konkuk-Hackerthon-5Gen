# 쿠노트

강의 녹음 → 요약 → 퀴즈 → 복습 → XP → 스터디 모집으로 이어지는 학습 웹앱. 해커톤 2인 팀용 초기 구조.

## 실행

```bash
npm install
npm run server   # API 스텁, http://localhost:3001
npm run dev      # 프론트, http://localhost:5173  (/api 요청은 3001로 프록시)
```

서버를 안 켜도 프론트는 `shared/mock.ts`의 목 데이터로 뜬다.

## 구조

```
shared/      프론트·서버 공용 타입(types.ts), 목 데이터(mock.ts),
             퀴즈 로직(quiz.ts: 출제·채점·XP·오답·복습 반영)과 목 문제 은행(quizBank.ts)
server/      Express 스텁. 미구현 라우트는 501 + todo 메시지를 돌려준다
src/
  api/       fetch 래퍼. 실패하면 목 데이터로 대체
  components/ Layout(폰 프레임 + 상단 바 + 하단 탭), ui(Card, Button, Row, Segmented, Field, Placeholder 등)
  pages/     Home, Record, Library(학습), Lecture, Quiz, Ranking, Board
  lib/names.ts  서비스·학습 탭 이름 상수 (이름 바뀌면 여기만)
```

## 담당

| 영역 | 담당 | 상태 |
| --- | --- | --- |
| 녹음·파일 업로드 (`POST /api/lectures`로 오디오가 올라오기까지) | 팀원·나 | 바로 녹음(MediaRecorder)·파일 업로드 동작 |
| 녹음본을 쓰는 나머지 전부: 원본 저장·다시 듣기, STT, 요약·개념 정리, 플래시카드, TTS, 퀴즈, 복습, XP, 랭킹, 게시판 | 나 | 홈·학습·퀴즈 동작, 나머지 인터페이스만 |

### 마스코트 기분 · 알림 · 관리자 (동작함)

소의 기분 8단계는 쉰 날과 연속 학습일로 정해진다(`shared/mood.ts`).

| 기분 | 조건 |
| --- | --- |
| 헬쑥함 | 30일 이상 안 함 (야윈 얼굴, 눈물, 먹구름) |
| 폭발 | 7일 이상 안 함 (시뻘건 얼굴, 이 드러냄, 불꽃) |
| 화남 | 3일 이상 안 함 |
| 언짢음 | 하루 빠짐(연속 기록 끊김) |
| 평범 | 연속 0~6일 |
| 조금 기쁨 | 연속 7일 |
| 매우 기쁨 | 연속 8~29일 |
| 매우매우 기쁨 | 연속 30일 이상 |

말풍선 문장은 기분마다 5개(`src/lib/mascotLines.ts`), 홈에 들어올 때마다 랜덤. 헬쑥함은 매달리는 장문.

알림은 지금 앱 안 상단 배너로만 뜬다(`shared/notices.ts`). 앱을 열 때 `GET /api/notifications`로 받아 하나씩 띄우고,
문제 제출 후에는 목표 달성·새로 참여 가능한 스터디 알림이 뜬다. TODO: 푸시 알림.
상단 방패 아이콘 = 관리자(`/admin`, 개발용): 기분 바로 바꾸기, 학습 기록 조정, 알림 시험 발송. TODO: 출시 전 인증 또는 제거.

### 개념 폴더 (동작함)

녹음 → 요약에서 뽑힌 개념은 학습 탭의 "전체 개념"에 미분류로 쌓인다. 사용자가 폴더를 만들고 개념을 담는다(한 개념을 여러 폴더에 담을 수 있음).
`GET/POST /api/folders`, `PATCH/DELETE /api/folders/:id`, 로직은 `shared/folders.ts`.

### 퀴즈 흐름 (동작함)

문제는 항상 개념 묶음 안에서만 나온다: 폴더(`/quiz?folder=`) · 강의(`/quiz?lecture=`) · 오늘 복습(`/quiz?review=`).
`POST /api/quiz { source, type, count }` → 그 묶음의 개념에 달린 문제만 뽑는다.
범위 선택 → 유형·문항 수 선택 → 한 문제씩 풀이(확인 → 정답/오답 피드백) → 결과.
결과를 제출하면 맞힌 문제마다 10 XP, 리그 순위 갱신, 틀린 문제는 오늘 복습에 추가, 개념 숙련도(새 개념 → 익히는 중 → 외움) 갱신.
서버가 꺼져 있으면 같은 `shared/quiz.ts`가 브라우저에서 돈다(새로고침하면 초기화).
남은 일: 요약 기반 문제 생성(지금은 `quizBank.ts`), 서술형 AI 피드백(지금은 핵심어 비교), DB 저장.

미완성 기능은 화면의 점선 박스(`Placeholder`)에 들어올 내용·API·담당이 적혀 있다.

## 디자인 원칙 (UI UX Pro Max 기준)

나중에 앱으로 옮길 걸 전제로 **폰 화면 하나**로 만든다. 휴대폰에선 화면 전체, 그보다 넓은 화면에선 가운데에 390×844 폰 프레임으로 보인다.

- 스타일: Flat + Vibrant & Block-based (Pro Max의 교육 앱 권장). 두꺼운 테두리 + 아래로만 떨어지는 단색 그림자, 누르면 2px 내려감
- 색: 건국대 UI의 KU Dark Green(#036B29) 메인, KU Light Green·라임 보조, 스트릭·순위만 오렌지. 대비 4.5:1 이상. `src/index.css`의 시맨틱 토큰(`primary`, `accent`, `ink`, `muted`, `line` …)만 쓰고 hex 직접 사용 금지
- 그라디언트, 보라색, 글로우, 이모지 아이콘 없음. 아이콘은 `lucide-react`
- 터치 대상 최소 44px, 본문 15–16px, 12px 미만 글자 없음
- 홈 상단에 마스코트(학사모 쓴 황소, `components/Mascot.tsx`)가 오늘 할 일을 한 문장으로 말해준다
- 하단 탭 5개: 홈 / 학습 / 녹음(가운데) / 랭킹 / 게시판. 퀴즈는 강의·복습에서 들어간다. 하위 화면은 상단 뒤로 버튼
- 페이지 안에서 `sm:`·`md:` 반응형 접두사 쓰지 않음 (프레임 안은 항상 폰 너비)
- `prefers-reduced-motion`이면 전환 효과 끔, 빈 상태엔 행동 하나만, 로딩은 구조 스켈레톤
