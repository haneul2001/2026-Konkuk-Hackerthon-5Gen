import { createContext, useContext } from 'react'
import type { Notice } from '../../shared/types'

// 어디서든 notify(notice)로 상단 배너를 띄운다. 큐에 쌓여 하나씩 보인다.
export const NotifyContext = createContext<(notice: Notice) => void>(() => {})

export function useNotify() {
  return useContext(NotifyContext)
}
