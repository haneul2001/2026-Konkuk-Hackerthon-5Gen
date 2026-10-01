# 배포: Render + Cloudflare Tunnel

```
브라우저 ──https──▶ Render (studyapp: 화면 + Express API)
                        │  AI_SERVER 환경 변수
                        ▼
                Cloudflare Tunnel (https://….trycloudflare.com)
                        ▼
                팀원 PC: AI 서버 (localhost:8000, GPU · Ollama)
```

- **화면과 Express**는 Render 웹 서비스 하나에서 같은 주소로 뜬다. Express가 빌드된 화면(`dist`)도 내보낸다.
- **AI 서버**는 GPU가 있는 팀원 PC에서 그대로 돌리고, Cloudflare Tunnel로 바깥 주소를 연다. Render의 Express가 그 주소를 부른다.

## 1. AI 서버 열기 (팀원 PC)

1. AI 서버 실행: `cd ai-server` → `.venv\Scripts\python -m uvicorn app.main:app --port 8000`
2. [cloudflared 설치](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) 후 다른 창에서:
   ```
   cloudflared tunnel --url http://localhost:8000
   ```
3. 출력에 나온 `https://xxxx.trycloudflare.com` 주소를 복사한다. 브라우저에서 `그주소/health`가 열리면 됐다.

> 이 빠른 터널은 **켤 때마다 주소가 바뀐다.** 바뀌면 Render의 `AI_SERVER`도 바꿔야 한다.
> 주소를 고정하려면 Cloudflare 계정에 도메인을 연결하고 이름 있는 터널(`cloudflared tunnel create …`)을 만든다.

## 2. Render 띄우기

1. Render → **New → Blueprint** → 이 GitHub 저장소를 고른다. 루트의 `render.yaml`을 읽어서 `studyapp` 웹 서비스를 만든다.
2. 환경 변수 `AI_SERVER`에 1-3의 터널 주소를 넣는다 (끝에 `/` 없이).
3. 배포가 끝나면 `https://studyapp-….onrender.com`이 앱 주소다.
   - `/api/health`가 `{"ok":true,"ai":true}`면 AI 서버까지 연결된 것. `"ai":false`면 터널 주소나 AI 서버를 확인한다.

직접 만들 때 설정값: Root Directory `studyapp` · Build `npm ci --include=dev && npm run build` · Start `npm start` · Health Check `/api/health` · Node 22.

## 알아둘 점

- **Render 무료 플랜은 15분 동안 접속이 없으면 잠든다.** 다시 깨어날 때 1분 가까이 걸린다. 게시판 글, 폴더·태그, XP·리그, 오늘 복습은 Express가 AI 서버 DB(`app_state` 테이블)에 저장해 두므로 깨어나면 다시 불러온다. 단, **깨어날 때 AI 서버(터널)에 연결돼야** 불러오고 저장도 된다. `/api/health`의 `"store":true`로 확인한다. 시연 전에 한 번 열어 깨워 두자.
- **켜는 순서:** AI 서버(터널) → Express. Express가 먼저 켜지면 5초마다 다시 연결을 시도하고, 연결 전에 바꾼 건 저장되지 않는다(연결되면 DB 내용이 메모리를 덮는다).
- **녹음 업로드는 한 번에 100MB까지** (Cloudflare 터널 한도). 2시간 녹음은 m4a로 올리는 게 안전하다.
- 퀴즈 만들기(15~45초)는 Cloudflare의 응답 대기 한도(100초) 안이다.
- 화면에서 API는 같은 주소의 `/api`로 부르므로 따로 CORS·주소 설정은 없다. 개발 중에는 지금처럼 `npm run dev`(5173) + `npm run server`(3001)를 쓴다.
