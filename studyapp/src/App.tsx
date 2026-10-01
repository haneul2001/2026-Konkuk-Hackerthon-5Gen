import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AdminPage } from './pages/AdminPage'
import { BoardPage } from './pages/BoardPage'
import { CardsPage } from './pages/CardsPage'
import { FolderPage } from './pages/FolderPage'
import { HomePage } from './pages/HomePage'
import { LecturePage } from './pages/LecturePage'
import { LibraryPage } from './pages/LibraryPage'
import { QuizPage } from './pages/QuizPage'
import { RankingPage } from './pages/RankingPage'
import { RecordPage } from './pages/RecordPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="record" element={<RecordPage />} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="library/folders/:id" element={<FolderPage />} />
        <Route path="lectures/:id" element={<LecturePage />} />
        <Route path="quiz" element={<QuizPage />} />
        <Route path="cards" element={<CardsPage />} />
        <Route path="ranking" element={<RankingPage />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
    </Routes>
  )
}
