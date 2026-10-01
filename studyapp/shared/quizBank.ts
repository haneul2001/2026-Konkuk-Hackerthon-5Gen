import type { QuizQuestion } from './types'

// 강의별 문제 은행. 문제는 AI 서버가 만들어서 지금은 비어 있다.
// AI 서버 없이 화면을 볼 때 여기에 { [강의 id]: 문제[] }를 넣으면 그 문제로 퀴즈가 나온다.
export const quizBank: Record<string, QuizQuestion[]> = {}
