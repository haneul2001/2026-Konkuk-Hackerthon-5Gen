import { createContext, useContext, useEffect } from 'react'

// 문제 풀이처럼 집중해야 하는 화면에서 상단 바·하단 탭을 숨긴다.
// Layout이 setter를 내려주고, 화면은 useImmersive(true)만 부르면 된다.

export const ImmersiveContext = createContext<(on: boolean) => void>(() => {})

export function useImmersive(on: boolean) {
  const set = useContext(ImmersiveContext)
  useEffect(() => {
    set(on)
    return () => set(false)
  }, [on, set])
}
