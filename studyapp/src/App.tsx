import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { getToken } from './lib/auth'
import { AdminPage } from './pages/AdminPage'
import { BoardPage } from './pages/BoardPage'
import { FlashcardsPage } from './pages/FlashcardsPage'
import { FolderPage } from './pages/FolderPage'
import { HomePage } from './pages/HomePage'
import { LecturePage } from './pages/LecturePage'
import { LibraryPage } from './pages/LibraryPage'
import { LoginPage } from './pages/LoginPage'
import { ProfilePage } from './pages/ProfilePage'
import { QuizPage } from './pages/QuizPage'
import { RankingPage } from './pages/RankingPage'
import { RecordingFolderPage } from './pages/RecordingFolderPage'
import { RecordPage } from './pages/RecordPage'

// 로그인 안 했으면 로그인 화면으로. 토큰이 더는 안 통하면 api/client.ts가 지우고 다시 보낸다.
function RequireAuth() {
  return getToken() ? <Outlet /> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="record" element={<RecordPage />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="library/folders/:id" element={<FolderPage />} />
          <Route path="library/recording-folders/:id" element={<RecordingFolderPage />} />
          <Route path="lectures/:id" element={<LecturePage />} />
          <Route path="quiz" element={<QuizPage />} />
          <Route path="flashcards" element={<FlashcardsPage />} />
          <Route path="ranking" element={<RankingPage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Route>
    </Routes>
  )
}
