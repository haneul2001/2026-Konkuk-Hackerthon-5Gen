import type { Mood } from '../../shared/types'
import { moodInfo } from '../../shared/mood'
import { cn } from '../lib/cn'

// 마스코트: 학사모 쓴 황소(건국대 상징). 이름은 미정.
// 굵은 외곽선 + 단색 면으로 나머지 블록형 UI와 맞춘다. 색은 토큰을 그대로 쓴다.
// 기분(mood)에 따라 눈썹·눈·입·볼과 작은 표시(화남 표시, 땀, 반짝이)가 바뀌고,
// 오래 안 하면 얼굴색·얼굴형까지 바뀐다(폭발: 시뻘건 얼굴, 헬쑥: 핏기 없고 야윈 얼굴).

const OUTLINE = 'var(--color-ink)'
const HIDE = '#e8b98a'
const MUZZLE = '#f6dcc2'
const HORN = '#fff6e5'
const BLUSH = '#f2a7a0'

const hideColor: Partial<Record<Mood, string>> = {
  angry: '#e9a283',
  furious: '#d9694c',
  gaunt: '#cdbba3', // 핏기 없는 회갈색
}

// 기분마다 움직임도 다르게: 화나면 부르르, 폭발하면 덜덜, 헬쑥하면 힘없이 축 처짐, 아주 기쁘면 콩콩
const motion: Record<Mood, string> = {
  gaunt: 'animate-[droop_4.5s_ease-in-out_infinite]',
  furious: 'animate-[rage_0.18s_linear_infinite]',
  angry: 'animate-[shake_0.5s_ease-in-out_infinite]',
  upset: 'animate-[bob_3.6s_ease-in-out_infinite]',
  normal: 'animate-[bob_2.8s_ease-in-out_infinite]',
  glad: 'animate-[bob_2.4s_ease-in-out_infinite]',
  happy: 'animate-[bob_1.6s_ease-in-out_infinite]',
  joyful: 'animate-[hop_0.9s_ease-in-out_infinite]',
}

export function Mascot({
  mood = 'normal',
  still = false,
  className,
}: {
  mood?: Mood
  still?: boolean // 배너·버튼 안처럼 작게 쓸 때: 움직임·그림자를 빼고 장식으로 취급(스크린 리더 생략)
  className?: string
}) {
  const hide = hideColor[mood] ?? HIDE
  const thin = mood === 'gaunt'
  const blush = mood === 'glad' ? 0.8 : mood === 'happy' || mood === 'joyful' ? 1 : mood === 'normal' ? 0.6 : 0

  // 학사모: 아주 기쁘면 살짝, 폭발하면 크게 기울고, 헬쑥하면 눈썹까지 흘러내린다
  const capTransform =
    mood === 'joyful'
      ? 'rotate(-8 100 50)'
      : mood === 'furious'
        ? 'rotate(14 100 50) translate(4 -6)'
        : mood === 'gaunt'
          ? 'translate(0 10) rotate(-5 100 50)'
          : undefined

  return (
    <svg
      viewBox={still ? '0 12 200 160' : '0 0 200 184'}
      {...(still
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': `학사모를 쓴 황소 마스코트, ${moodInfo[mood].label}` })}
      className={cn(!still && motion[mood], className)}
    >
      {!still && <ellipse cx="100" cy="176" rx={thin ? 38 : 48} ry="6" fill="var(--color-line)" />}

      {mood === 'furious' && <FuriousBack />}

      <g stroke={OUTLINE} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
        {/* 뿔: 야윈 얼굴에서는 안쪽으로 붙인다 */}
        <path d="M58 76 C36 70 28 50 36 34 C44 50 56 56 70 60 Z" fill={HORN} transform={thin ? 'translate(9 6)' : undefined} />
        <path d="M142 76 C164 70 172 50 164 34 C156 50 144 56 130 60 Z" fill={HORN} transform={thin ? 'translate(-9 6)' : undefined} />
        {/* 귀: 헬쑥하면 축 늘어진다 */}
        {thin ? (
          <>
            <ellipse cx="52" cy="112" rx="20" ry="10" transform="rotate(-62 52 112)" fill={hide} />
            <ellipse cx="148" cy="112" rx="20" ry="10" transform="rotate(62 148 112)" fill={hide} />
          </>
        ) : (
          <>
            <ellipse cx="40" cy="96" rx="20" ry="11" transform="rotate(-18 40 96)" fill={hide} />
            <ellipse cx="160" cy="96" rx="20" ry="11" transform="rotate(18 160 96)" fill={hide} />
          </>
        )}
        {/* 머리 */}
        <ellipse cx="100" cy="108" rx={thin ? 47 : 58} ry={thin ? 56 : 54} fill={hide} />
        {/* 주둥이 */}
        <ellipse cx="100" cy="138" rx={thin ? 30 : 38} ry={thin ? 21 : 24} fill={thin ? '#ebdccb' : MUZZLE} />
      </g>

      {/* 귀 안쪽 */}
      {!thin && (
        <g fill={BLUSH}>
          <ellipse cx="40" cy="97" rx="10" ry="5" transform="rotate(-18 40 97)" />
          <ellipse cx="160" cy="97" rx="10" ry="5" transform="rotate(18 160 97)" />
        </g>
      )}

      {/* 콧구멍: 폭발하면 벌름 */}
      {mood === 'furious' ? (
        <g fill={OUTLINE}>
          <ellipse cx="87" cy="133" rx="6" ry="7" />
          <ellipse cx="113" cy="133" rx="6" ry="7" />
        </g>
      ) : (
        <g fill={OUTLINE}>
          <ellipse cx={thin ? 91 : 88} cy="134" rx={thin ? 3 : 4} ry={thin ? 4.5 : 5.5} />
          <ellipse cx={thin ? 109 : 112} cy="134" rx={thin ? 3 : 4} ry={thin ? 4.5 : 5.5} />
        </g>
      )}

      {thin && <GauntFace />}
      <Eyes mood={mood} />
      <Brows mood={mood} />
      <Mouth mood={mood} />

      {/* 볼 */}
      {blush > 0 && (
        <g fill={BLUSH} opacity={blush}>
          <ellipse cx="62" cy="120" rx="9" ry="5" />
          <ellipse cx="138" cy="120" rx="9" ry="5" />
        </g>
      )}

      <g transform={capTransform}>
        <g stroke={OUTLINE} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round">
          <path d="M70 52 L70 68 Q100 80 130 68 L130 52" fill="var(--color-primary-deep)" />
          <path d="M100 26 L156 44 L100 62 L44 44 Z" fill="var(--color-primary)" />
        </g>
        {/* 술: 헬쑥하면 힘없이 축 늘어진다 */}
        <path
          d={thin ? 'M100 44 L132 56 L134 90' : 'M100 44 L148 52 L148 76'}
          fill="none"
          stroke={thin ? '#c9d98f' : 'var(--color-highlight)'}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={thin ? 134 : 148}
          cy={thin ? 94 : 80}
          r="6"
          fill={thin ? '#c9d98f' : 'var(--color-highlight)'}
          stroke={OUTLINE}
          strokeWidth="3"
        />
        <circle cx="100" cy="44" r="4" fill={OUTLINE} />
      </g>

      <Extras mood={mood} />
    </svg>
  )
}

function Eyes({ mood }: { mood: Mood }) {
  // 웃는 눈(^ ^)
  if (mood === 'happy' || mood === 'joyful') {
    return (
      <g fill="none" stroke={OUTLINE} strokeWidth="5" strokeLinecap="round">
        <path d="M67 107 Q76 95 85 107" />
        <path d="M115 107 Q124 95 133 107" />
      </g>
    )
  }
  // 반쯤 감은 눈(언짢음)
  if (mood === 'upset') {
    return (
      <g>
        <path d="M69 103 A7 7 0 0 0 83 103 Z" fill={OUTLINE} />
        <path d="M117 103 A7 7 0 0 0 131 103 Z" fill={OUTLINE} />
        <g stroke={OUTLINE} strokeWidth="4" strokeLinecap="round">
          <path d="M67 103 L85 103" />
          <path d="M115 103 L133 103" />
        </g>
      </g>
    )
  }
  // 폭발: 위가 깎인 흰자에 바늘 같은 빨간 눈동자 = 표독한 눈
  if (mood === 'furious') {
    return (
      <g stroke={OUTLINE} strokeWidth="3.5" strokeLinejoin="round">
        <path d="M62 98 L90 108 Q78 116 64 108 Z" fill="#fff" />
        <path d="M138 98 L110 108 Q122 116 136 108 Z" fill="#fff" />
        <ellipse cx="79" cy="108" rx="2.6" ry="4" fill="var(--color-danger)" stroke="none" />
        <ellipse cx="121" cy="108" rx="2.6" ry="4" fill="var(--color-danger)" stroke="none" />
      </g>
    )
  }
  // 헬쑥: 처지고 촉촉한 큰 눈 + 다크서클 + 눈물
  if (mood === 'gaunt') {
    return (
      <g>
        <g fill="none" stroke="#8a7f92" strokeWidth="3" strokeLinecap="round" opacity="0.8">
          <path d="M70 116 Q78 121 86 116" />
          <path d="M114 116 Q122 121 130 116" />
        </g>
        <circle cx="78" cy="106" r="8" fill={OUTLINE} />
        <circle cx="122" cy="106" r="8" fill={OUTLINE} />
        <g fill="#fff">
          <circle cx="81" cy="103" r="3.2" />
          <circle cx="125" cy="103" r="3.2" />
          <circle cx="75.5" cy="109.5" r="1.4" />
          <circle cx="119.5" cy="109.5" r="1.4" />
        </g>
        {/* 눈물 */}
        <g fill="#9fd3f5" stroke={OUTLINE} strokeWidth="2" strokeLinejoin="round">
          <path d="M70 113 Q66 122 70 126 Q74 122 70 113 Z" />
          <path d="M130 113 Q126 122 130 126 Q134 122 130 113 Z" />
        </g>
      </g>
    )
  }
  const r = mood === 'angry' ? 6 : 7
  return (
    <g>
      <circle cx="76" cy="104" r={r} fill={OUTLINE} />
      <circle cx="124" cy="104" r={r} fill={OUTLINE} />
      {mood !== 'angry' && (
        <g fill="#fff">
          <circle cx="78.5" cy="101.5" r="2.4" />
          <circle cx="126.5" cy="101.5" r="2.4" />
        </g>
      )}
    </g>
  )
}

function Brows({ mood }: { mood: Mood }) {
  const paths: Partial<Record<Mood, [string, string]>> = {
    furious: ['M56 84 L92 100', 'M144 84 L108 100'], // 아주 굵고 가파른 V
    angry: ['M62 86 L88 96', 'M138 86 L112 96'], // 안쪽으로 내려간 V
    upset: ['M64 92 L87 94', 'M136 92 L113 94'], // 거의 평평, 살짝 찌푸림
    gaunt: ['M66 95 Q76 90 87 86', 'M134 95 Q124 90 113 86'], // 안쪽 끝이 올라간 걱정 눈썹
    glad: ['M66 90 Q76 85 86 89', 'M114 89 Q124 85 134 90'],
    happy: ['M66 86 Q76 80 86 85', 'M114 85 Q124 80 134 86'],
    joyful: ['M66 84 Q76 77 86 83', 'M114 83 Q124 77 134 84'],
  }
  const p = paths[mood]
  if (!p) return null
  const width = mood === 'furious' ? 8 : mood === 'angry' ? 5 : 4
  return (
    <g fill="none" stroke={OUTLINE} strokeWidth={width} strokeLinecap="round">
      <path d={p[0]} />
      <path d={p[1]} />
    </g>
  )
}

function Mouth({ mood }: { mood: Mood }) {
  switch (mood) {
    case 'furious':
      // 이를 드러내고 으르렁
      return (
        <g strokeLinejoin="round">
          <path d="M80 146 Q100 138 120 146 L117 160 Q100 165 83 160 Z" fill={OUTLINE} stroke={OUTLINE} strokeWidth="3" />
          <path d="M83 147 Q100 141 117 147 L115 151 L111 147.5 L107 151.5 L103 146.5 L100 151.5 L97 146.5 L93 151.5 L89 147.5 L85 151 Z" fill="#fff" />
          <path d="M85 159 L89 155 L93 160 L97 155.5 L100 160.5 L103 155.5 L107 160 L111 155 L115 159 Q100 163 85 159 Z" fill="#fff" />
        </g>
      )
    case 'angry':
      return <path d="M88 154 Q100 145 112 154" fill="none" stroke={OUTLINE} strokeWidth="4" strokeLinecap="round" />
    case 'upset':
      return <path d="M90 151 Q95 148 100 151 Q105 154 110 151" fill="none" stroke={OUTLINE} strokeWidth="4" strokeLinecap="round" />
    case 'gaunt':
      // 떨리는 작은 입
      return <path d="M92 150 Q96 146 100 149 Q104 146 108 150" fill="none" stroke={OUTLINE} strokeWidth="3" strokeLinecap="round" />
    case 'normal':
      return null
    case 'glad':
      return <path d="M90 147 Q100 156 110 147" fill="none" stroke={OUTLINE} strokeWidth="4" strokeLinecap="round" />
    case 'happy':
      return (
        <path d="M87 145 Q100 162 113 145 Z" fill={OUTLINE} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
      )
    case 'joyful':
      return (
        <g>
          <path d="M84 143 Q100 168 116 143 Z" fill={OUTLINE} stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round" />
          <ellipse cx="100" cy="156" rx="8" ry="4.5" fill="#f08a8a" />
        </g>
      )
  }
}

// 헬쑥한 얼굴: 꺼진 볼, 이마 주름
function GauntFace() {
  return (
    <g fill="none" stroke={OUTLINE} strokeLinecap="round" opacity="0.55">
      <path d="M62 116 Q66 128 72 134" strokeWidth="3" />
      <path d="M138 116 Q134 128 128 134" strokeWidth="3" />
      <path d="M90 76 Q100 73 110 76" strokeWidth="2.5" />
      <path d="M93 82 Q100 80 107 82" strokeWidth="2.5" />
    </g>
  )
}

// 폭발: 머리 뒤로 솟는 불꽃
function FuriousBack() {
  return (
    <g stroke={OUTLINE} strokeWidth="3" strokeLinejoin="round">
      <path d="M26 112 Q14 84 30 62 Q30 80 42 84 Q36 64 52 44 Q52 70 64 74 Z" fill="var(--color-accent)" />
      <path d="M174 112 Q186 84 170 62 Q170 80 158 84 Q164 64 148 44 Q148 70 136 74 Z" fill="var(--color-accent)" />
      <path d="M34 106 Q28 90 38 78 Q40 90 48 92 Z" fill="#fbbf24" />
      <path d="M166 106 Q172 90 162 78 Q160 90 152 92 Z" fill="#fbbf24" />
    </g>
  )
}

function Extras({ mood }: { mood: Mood }) {
  if (mood === 'angry' || mood === 'furious') {
    const big = mood === 'furious'
    const mark = (x: number, y: number, s: number) => (
      <g key={`${x}-${y}`} stroke="var(--color-danger)" strokeWidth={big ? 5 : 4.5} strokeLinecap="round" fill="none">
        <path d={`M${x - s} ${y - s} Q${x - s / 2} ${y - 1} ${x} ${y - 1}`} />
        <path d={`M${x + s} ${y - s} Q${x + s / 2} ${y - 1} ${x} ${y - 1}`} />
        <path d={`M${x - s} ${y + s} Q${x - s / 2} ${y + 1} ${x} ${y + 1}`} />
        <path d={`M${x + s} ${y + s} Q${x + s / 2} ${y + 1} ${x} ${y + 1}`} />
      </g>
    )
    return (
      <g>
        {/* 화남 표시: 폭발하면 양쪽에 */}
        {mark(172, 34, big ? 14 : 12)}
        {big && mark(28, 28, 10)}
        {/* 콧김: 폭발하면 크게 뿜는다 */}
        <g fill="var(--color-line)" stroke={OUTLINE} strokeWidth="2.5">
          {big ? (
            <>
              <circle cx="52" cy="150" r="10" />
              <circle cx="36" cy="160" r="8" />
              <circle cx="22" cy="168" r="6" />
              <circle cx="148" cy="150" r="10" />
              <circle cx="164" cy="160" r="8" />
              <circle cx="178" cy="168" r="6" />
            </>
          ) : (
            <>
              <circle cx="56" cy="150" r="7" />
              <circle cx="46" cy="158" r="5" />
              <circle cx="144" cy="150" r="7" />
              <circle cx="154" cy="158" r="5" />
            </>
          )}
        </g>
      </g>
    )
  }
  if (mood === 'upset') {
    // 땀방울
    return (
      <path
        d="M152 70 Q146 82 152 86 Q158 82 152 70 Z"
        fill="#9fd3f5"
        stroke={OUTLINE}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    )
  }
  if (mood === 'gaunt') {
    // 머리 위 먹구름과 빗줄기, 힘없이 맴도는 파리 한 마리
    return (
      <g>
        <path
          d="M150 34 Q150 22 162 22 Q166 12 178 16 Q190 16 188 28 Q196 32 190 40 L154 40 Q146 40 150 34 Z"
          fill="#c4c9cc"
          stroke={OUTLINE}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <g stroke="#8fb6d6" strokeWidth="2.5" strokeLinecap="round">
          <path d="M160 46 L157 54" />
          <path d="M170 46 L167 54" />
          <path d="M180 46 L177 54" />
        </g>
        <path d="M24 74 q4 -6 8 0 q4 6 8 0" fill="none" stroke="#9aa1a6" strokeWidth="2" strokeDasharray="2 3" />
        <circle cx="44" cy="74" r="3" fill={OUTLINE} />
        <ellipse cx="42" cy="70" rx="3" ry="2" fill="#dfe8ee" stroke={OUTLINE} strokeWidth="1" />
      </g>
    )
  }
  if (mood === 'joyful' || mood === 'happy') {
    // 반짝이 (네 갈래 별)
    const star = (x: number, y: number, s: number, fill: string) => (
      <path
        key={`${x}-${y}`}
        d={`M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`}
        fill={fill}
        stroke={OUTLINE}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    )
    return (
      <g>
        {star(24, 44, 9, 'var(--color-highlight)')}
        {star(176, 108, 8, 'var(--color-highlight)')}
        {mood === 'joyful' && star(178, 26, 7, '#fbbf24')}
        {mood === 'joyful' && star(22, 128, 7, '#fbbf24')}
      </g>
    )
  }
  return null
}
