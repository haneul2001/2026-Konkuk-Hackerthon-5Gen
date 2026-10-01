import type { Mood } from '../../shared/types'
import { moodInfo } from '../../shared/mood'
import { cn } from '../lib/cn'

// 마스코트: 건국대 공식 캐릭터 '쿠'. 건국대 '쿠 응용형' 공식 이미지만 쓴다(public/ku, 출처는 SOURCE.md).
// 사용 규정: 캐릭터를 변형하지 않고 정비례로만 확대·축소한다.
//  → 그림을 고치지 않고, 기분(mood)마다 알맞은 공식 이미지를 고른다. 크기는 object-contain으로 비율 유지.
//  → 움직임은 위치만 살짝 옮긴다(styles: bob·shake·hop 등은 translate). 늘이거나 찌그러뜨리지 않는다.

export type MascotPose = Mood | 'welcome'

const SRC: Record<MascotPose, string> = {
  gaunt: '/ku/gaunt.webp', // 아프지말라쿠
  furious: '/ku/furious.webp', // 쿠도 화가나면 무섭쿠 8
  angry: '/ku/angry.webp', // 쿠도 화가나면 무섭쿠 9
  upset: '/ku/upset.webp', // 쿠도 화가나면 무섭쿠 5
  normal: '/ku/normal.webp', // 대학생 쿠의 일상 3
  glad: '/ku/glad.webp', // 오늘도 행복한 쿠 3
  happy: '/ku/happy.webp', // 오늘도 행복한 쿠 1
  joyful: '/ku/joyful.webp', // 오늘도 행복한 쿠 2
  welcome: '/ku/welcome.webp', // 환영한다쿠 (로그인 화면)
}

// 기분마다 움직임: 화나면 부르르, 폭발하면 덜덜, 헬쑥하면 힘없이 축 처짐, 아주 기쁘면 콩콩
const motion: Record<MascotPose, string> = {
  gaunt: 'animate-[droop_4.5s_ease-in-out_infinite]',
  furious: 'animate-[rage_0.18s_linear_infinite]',
  angry: 'animate-[shake_0.5s_ease-in-out_infinite]',
  upset: 'animate-[bob_3.6s_ease-in-out_infinite]',
  normal: 'animate-[bob_2.8s_ease-in-out_infinite]',
  glad: 'animate-[bob_2.4s_ease-in-out_infinite]',
  happy: 'animate-[bob_1.6s_ease-in-out_infinite]',
  joyful: 'animate-[hop_0.9s_ease-in-out_infinite]',
  welcome: 'animate-[bob_2.4s_ease-in-out_infinite]',
}

export function Mascot({
  mood = 'normal',
  pose,
  still = false,
  className,
}: {
  mood?: Mood
  pose?: 'welcome' // 기분과 상관없는 장면(로그인 화면의 환영 쿠)
  still?: boolean // 배너·버튼 안처럼 작게 쓸 때: 얼굴 쪽만 보이게, 움직임 없이 장식으로 취급(스크린 리더 생략)
  className?: string
}) {
  const key: MascotPose = pose ?? mood
  return (
    <img
      src={SRC[key]}
      width={512}
      height={512}
      draggable={false}
      {...(still
        ? { alt: '', 'aria-hidden': true }
        : { alt: pose === 'welcome' ? '환영하는 건국대 마스코트 쿠' : `건국대 마스코트 쿠, ${moodInfo[mood].label}` })}
      className={cn(
        'aspect-square select-none',
        // 작은 자리에선 얼굴(위쪽)만 보이게 잘라서 보여준다. 잘라도 비율은 그대로다
        still ? 'object-cover object-top' : ['object-contain', motion[key]],
        className,
      )}
    />
  )
}
