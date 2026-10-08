// 54비트 마스터 타임라인(가상 120 BPM, 1비트 = 0.5초)과 순수 함수 보간 도구.
// 모든 연출 값은 시간 t(비트)만으로 계산한다. 상태를 프레임 사이에 남기지 않는다.

export const BEATS = 54
export const SEC_PER_BEAT = 0.5

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
/** a~b 구간에서의 진행도(0~1) */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p
export const inRange = (t: number, a: number, b: number) => t >= a && t < b

export const ease = {
  linear: (p: number) => p,
  out: (p: number) => 1 - Math.pow(1 - p, 3),
  in: (p: number) => p * p * p,
  inOut: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  /** 끝값을 정확히 1로 맞추는 살짝 넘치는 곡선 */
  back: (p: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
  },
}

export type SpringOpts = { freq?: number; damping?: number }

/** 감쇠 진동자의 계단 응답(닫힌 형태). tau는 비트, 반환은 0에서 시작해 1로 수렴 */
export function springStep(tau: number, { freq = 1.5, damping = 0.74 }: SpringOpts = {}): number {
  if (tau <= 0) return 0
  const s = tau * SEC_PER_BEAT
  const w = 2 * Math.PI * freq
  const z = damping
  if (z >= 1) return 1 - Math.exp(-w * s) * (1 + w * s)
  const wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s))
}

/** 목표가 여러 번 바뀌는 값 = 변화마다 스프링 하나를 더한 합. 시간의 순수 함수 */
export function spring(t: number, base: number, changes: ReadonlyArray<readonly [number, number]>, opts?: SpringOpts): number {
  let v = base
  let prev = base
  for (const [t0, target] of changes) {
    v += (target - prev) * springStep(t - t0, opts)
    prev = target
  }
  return v
}

export type Rect = { x: number; y: number; w: number; h: number }
export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })
export const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) })
export const centered = (cx: number, cy: number, w: number, h: number): Rect => ({ x: cx - w / 2, y: cy - h / 2, w, h })
export const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

// ===== 재생 속도표 =====
// 비트는 "장면 진행"의 단위이고, 실제 시간은 아래 표가 정한다.
// [시작 비트, 끝 비트, 초]. 시작 = 끝이면 그 장면에서 잠시 멈춰 보여 주는 구간.
// 커서 이동·타이핑·길게 누르기는 실제 손 속도에, 읽어야 하는 화면은 머무름에 맞췄다.
const PACE_BASE: ReadonlyArray<readonly [number, number, number]> = [
  // OPEN
  [0, 0, 1.0], [0, 1.6, 1.4], [1.6, 3.2, 1.5], [3.2, 4.1, 1.0], [4.1, 5.4, 1.1],
  [5.4, 8, 2.2], [8, 9.6, 1.5], [9.6, 10.5, 1.1], [10.5, 12, 1.4],
  // BUILD
  [12, 13, 0.9], [13, 15, 2.2], [15, 16.45, 1.8], [16.45, 18, 1.6], 
  // GLASS
  [18, 18.8, 0.9], [18.8, 20.4, 1.8], [20.4, 21.9, 1.7], [21.9, 22.4, 0.9], [22.4, 23.4, 1.8], [23.4, 24.4, 1.4], 
  // STAGE
  [24.4, 25.4, 1.1], [25.4, 26.3, 1.1], [26.3, 27.4, 1.2], [27.4, 28.8, 1.8], [28.8, 29.9, 1.4],
  [29.9, 30.2, 0.7], [30.2, 30.8, 0.9], [30.8, 31.6, 1.2], [31.6, 32.5, 1.0], [32.5, 34, 1.4],
  // DETAIL
  [34, 35.9, 2.0], [35.9, 37.9, 3.2], [37.9, 39.4, 1.6], [39.4, 40.7, 1.6], [40.7, 41.5, 1.0], [41.5, 42, 0.5],
  // JOURNEY
  [42, 43.2, 1.1], [43.2, 45.85, 4.6], [45.85, 47.6, 3.2], [47.6, 48.2, 0.7],
  // WALL (범람은 약 0.3초, 검정은 한 박자)
  [48.2, 48.8, 0.3], [48.8, 49.8, 0.5], [49.8, 51.7, 2.75], [51.7, 51.7, 8.0], [51.7, 52.5, 1.0], [52.5, 53.55, 1.2], [53.55, 54, 0.8],
]
/** 전체 빠르기. 1 = 위 표 그대로(약 87초). 0.65 ≈ 57초 */
export const SPEED = 0.65
// 범람(검정이 화면을 덮는 순간, 약 0.3초)과 끝의 "이제 시작해 볼까요?" 멈춤(8초)은 빠르기와 무관하게 유지
const FIXED = (p: readonly [number, number, number]) => (p[0] === 48.2 && p[1] === 48.8) || (p[0] === 51.7 && p[1] === 51.7)
export const PACE: ReadonlyArray<readonly [number, number, number]> = PACE_BASE.map((p) => (FIXED(p) ? p : ([p[0], p[1], p[2] * SPEED] as const)))
export const DURATION = PACE.reduce((a, p) => a + p[2], 0)

// 재생 시간 → 비트를 매듭(구간 경계)마다 이어 붙이되, 단조 3차 보간(Fritsch–Carlson)으로
// 속도가 구간 경계에서 갑자기 바뀌지 않게 한다. 멈춤 구간 앞뒤에서는 자연스럽게 감속·가속한다.
const KNOTS = (() => {
  const xs = [0]
  const ys = [PACE[0][0]]
  let acc = 0
  for (const [, b1, d] of PACE) {
    acc += d
    xs.push(acc)
    ys.push(b1)
  }
  const n = xs.length
  const dk = Array.from({ length: n - 1 }, (_, i) => (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]))
  const m = new Array<number>(n).fill(0)
  for (let i = 1; i < n - 1; i++) m[i] = dk[i - 1] * dk[i] <= 0 ? 0 : (dk[i - 1] + dk[i]) / 2
  m[0] = 0 // 시작·끝(= 처음 장면으로 이어지는 순간)은 정지 상태
  m[n - 1] = 0
  for (let i = 0; i < n - 1; i++) {
    if (dk[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / dk[i]
    const b = m[i + 1] / dk[i]
    const h = Math.hypot(a, b)
    if (h > 3) {
      m[i] = (3 * a * dk[i]) / h
      m[i + 1] = (3 * b * dk[i]) / h
    }
  }
  return { xs, ys, m }
})()

/** 실제 재생 시간(초) → 비트. 시간의 순수 함수 */
export function beatAt(sec: number): number {
  const s = ((sec % DURATION) + DURATION) % DURATION
  const { xs, ys, m } = KNOTS
  let i = 0
  while (i < xs.length - 2 && s >= xs[i + 1]) i++
  const h = xs[i + 1] - xs[i]
  const u = h > 0 ? (s - xs[i]) / h : 0
  const u2 = u * u
  const u3 = u2 * u
  return (2 * u3 - 3 * u2 + 1) * ys[i] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * ys[i + 1] + (u3 - u2) * h * m[i + 1]
}
/** 비트 → 그 비트에 처음 도달하는 재생 시간(초) */
export function secAt(beat: number): number {
  let acc = 0
  for (const [b0, b1, d] of PACE) {
    if (b1 > b0 && beat >= b0 && beat < b1) {
      // 보간 곡선 위에서 이분 탐색
      let lo = acc
      let hi = acc + d
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2
        if (beatAt(mid) < beat) lo = mid
        else hi = mid
      }
      return hi
    }
    if (b1 === b0 && beat === b0) return acc
    acc += d
  }
  return 0
}

/** 영상의 장(챕터). still = 동작 줄이기 모드에서 보여 줄 정지 장면 */
export const CHAPTERS = [
  { id: "intro", label: "오운디", from: 0, to: 12, still: 9.6 },
  { id: "search", label: "시설 찾기", from: 12, to: 24.4, still: 18 },
  { id: "info", label: "시설 정보", from: 24.4, to: 34, still: 26.3 },
  { id: "route", label: "예약 안내", from: 34, to: 42, still: 41.5 },
  { id: "go", label: "운동하러", from: 42, to: 54, still: 47.6 },
] as const

/** 영상 안 자막(키노트식 카드). 비트 구간 */
export type Caption = { from: number; to: number; kicker: string; title: string; body: string; tag?: "demo" | "dev" | "plan"; tagText?: string; still: number; cta?: boolean }
export const CAPTIONS: Caption[] = [
  { from: 1.6, to: 8, kicker: "OWND · 오운디", title: "운동할 곳,\n이제 한 번에 찾아요", body: "인천 연수구(송도 포함)에서 먼저 시작해요.", still: 3.2 },
  { from: 8, to: 12, kicker: "OWND · 오운디", title: "공공·민간 시설을\n한 화면에", body: "체육관, 수영장, 테니스장, 클라이밍장까지 모아 보여드려요.", still: 9.6 },
  { from: 12, to: 18.8, kicker: "시설 찾기", title: "말하듯 찾으면 돼요", body: "한마디가 지역·종목·주차 같은 조건으로 바뀌어요.", tag: "demo", tagText: "시연 화면", still: 18 },
  { from: 18.8, to: 24.4, kicker: "시설 찾기", title: "가까운 곳부터\n좁혀 봐요", body: "거리, 종목, 공공·민간 여부로 골라요.", tag: "demo", tagText: "시연 컨트롤", still: 22.9 },
  { from: 24.4, to: 31.6, kicker: "시설 정보", title: "어디서 온 정보인지도\n함께 보여요", body: "기관 자료인지, 실시간 정보인지 분명히 적어 둬요.", tag: "demo", tagText: "시연 화면", still: 26.3 },
  { from: 31.6, to: 38, kicker: "시설 정보", title: "필요한 것만\n한눈에", body: "이름·위치·종목·출처를 한 화면에 모았어요.", tag: "demo", tagText: "시연 데이터", still: 35.9 },
  { from: 38, to: 42, kicker: "예약 안내", title: "예약은 시설마다\n길이 달라요", body: "공공시설은 기관 공식 예약 페이지로 안내해요. 이동만으로 예약이 끝나진 않아요.", tag: "dev", tagText: "개발 중", still: 41.5 },
  { from: 42, to: 48.2, kicker: "운동하러", title: "고르고, 확인하고,\n출발", body: "지역 → 종목 → 시설 정보 → 예약 경로. 지도는 카카오맵 연동을 준비 중이에요.", tag: "plan", tagText: "지도 연결 예정", still: 47.6 },
  { from: 50.3, to: 52.5, kicker: "OWND · 오운디", title: "이제 시작해\n볼까요?", body: "웹과 앱으로 곧 만나요.", still: 51.6, cta: true },
]
