// 120비트 마스터 타임라인(1비트 = 0.7초, 전체 84초)과 순수 함수 보간 도구.
// 음악은 쓰지 않는다. 모든 연출 값은 시간 t(비트)만으로 계산한다. 상태를 프레임 사이에 남기지 않는다.

export const BEATS = 120
export const SEC_PER_BEAT = 0.7
export const DURATION = BEATS * SEC_PER_BEAT

export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
/** a~b 구간에서의 진행도(0~1) */
export const seg = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)))
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p

export const ease = {
  linear: (p: number) => p,
  out: (p: number) => 1 - Math.pow(1 - p, 3),
  in: (p: number) => p * p * p,
  inOut: (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  /** 화면 전환(앱 내비게이션 느낌): 빠르게 출발해 부드럽게 멈춤 */
  nav: (p: number) => 1 - Math.pow(1 - p, 4),
  /** 끝값을 정확히 1로 맞추는 살짝 넘치는 곡선 */
  back: (p: number) => 1 + 2.70158 * Math.pow(p - 1, 3) + 1.70158 * Math.pow(p - 1, 2),
}

export type SpringOpts = { freq?: number; damping?: number }

/** 감쇠 진동자의 계단 응답(닫힌 형태). tau는 비트, 반환은 0에서 시작해 1로 수렴(작은 overshoot) */
export function springStep(tau: number, { freq = 1.5, damping = 0.74 }: SpringOpts = {}): number {
  if (tau <= 0) return 0
  const s = tau * SEC_PER_BEAT
  const w = 2 * Math.PI * freq
  const z = damping
  if (z >= 1) return 1 - Math.exp(-w * s) * (1 + w * s)
  const wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s))
}

export type Rect = { x: number; y: number; w: number; h: number }
export const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h })
export const lerpRect = (a: Rect, b: Rect, p: number): Rect => ({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) })
export const centered = (cx: number, cy: number, w: number, h: number): Rect => ({ x: cx - w / 2, y: cy - h / 2, w, h })
export const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

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

/** 실제 재생 시간(초) → 비트(선형). 시간의 순수 함수 */
export function beatAt(sec: number): number {
  const s = ((sec % DURATION) + DURATION) % DURATION
  return s / SEC_PER_BEAT
}
/** 비트 → 재생 시간(초) */
export function secAt(beat: number): number {
  return beat * SEC_PER_BEAT
}

/**
 * 영상 안 설명. 비트 구간마다 휴대폰 옆(side: 왼쪽 l / 오른쪽 r)의 알맞은 높이(at: 앱 화면 y, 390×844 기준)에 놓이고,
 * 가는 선으로 휴대폰의 해당 부분을 가리킨다. 좁은 화면에서는 휴대폰 아래에 놓인다.
 */
export type Caption = { from: number; to: number; side: "l" | "r"; at: number; kicker: string; title: string; body: string; cta?: boolean }
export const CAPTIONS: Caption[] = [
  { from: 0, to: 8, side: "l", at: 300, kicker: "OWND · 오운디", title: "동네 운동,\n대화형 검색으로 찾고 바로 신청", body: "이용자는 소비자 화면, 시설은 사장님 화면을 써요." },
  { from: 8, to: 20, side: "r", at: 92, kicker: "대화형 검색", title: "한 번 묻고,\n이어서 또 물어요", body: "‘연수구에서 풋살할 곳’ 다음 ‘송도 쪽이면 좋겠어’. 앞 질문까지 문맥으로 이어 순서를 다시 정해요." },
  { from: 20, to: 32, side: "l", at: 520, kicker: "공공·민간 장소", title: "공공은 기관 예약,\n연결 시설은 앱 신청", body: "공공시설은 공유누리 출처와 기관 예약 경로를 안내해요." },
  { from: 32, to: 40, side: "r", at: 226, kicker: "시설 상세", title: "평점·운영시간·\n이용 안내를 한 화면에", body: "궁금하면 여기서 시설에 바로 문의할 수 있어요." },
  { from: 40, to: 52, side: "l", at: 440, kicker: "예약 신청", title: "날짜·인원·시간을\n고르면 신청 준비 끝", body: "풋살장 A는 1회 대관가, 풋살장 B 오전은 1인 가격이에요. 여기선 대관으로 신청해요." },
  { from: 52, to: 60, side: "r", at: 300, kicker: "승인 대기", title: "결제가 아니라\n‘승인 대기’예요", body: "앱에서 돈을 받지 않아요. 사장님이 승인해야 확정되고, 시작 30분 뒤까지 승인이 없으면 만료돼요." },
  { from: 60, to: 72, side: "r", at: 300, kicker: "사장님 화면", title: "같은 신청이\n사장님 목록에 도착", body: "사장님이 열어 보고 승인해요. 대관은 한 팀을 승인하면 같은 시간의 다른 신청이 자동 거절돼요." },
  { from: 72, to: 80, side: "l", at: 200, kicker: "이용자 화면", title: "알림으로 받고,\n예약 확정 확인", body: "앱이 켜져 있거나 백그라운드일 때 알려요. 앱을 완전히 닫았다면 다시 열 때 알림함에서 확인해요." },
  { from: 80, to: 84, side: "r", at: 470, kicker: "사장님 화면", title: "이용 시간이 지나면\n이용 완료 기록", body: "사장님이 입장 확인·이용 완료·노쇼를 기록해요." },
  { from: 84, to: 89, side: "l", at: 400, kicker: "이용 이후", title: "이용 완료가\n확인돼야 후기", body: "예약 확정과 이용 완료는 달라요. 이용 완료가 기록된 예약에만 후기를 쓸 수 있어요." },
  { from: 89, to: 100, side: "l", at: 300, kicker: "커뮤니티", title: "방문 인증 후기,\n게시판, 1:1 채팅", body: "후기는 피드에 ‘예약 방문 인증’으로 올라가요. 게시판 글은 후기와 별개이고, 작성자와 채팅할 수 있어요." },
  { from: 100, to: 112, side: "r", at: 300, kicker: "운영 데이터", title: "쌓인 기록이\n운영 근거가 돼요", body: "검색·신청·이용·후기 기록을 사장님 분석으로 모아요." },
  { from: 112, to: 120, side: "l", at: 380, kicker: "시작하기", title: "Android 앱으로\n시작해요", body: "웹사이트에서 APK를 받아 설치해요. 같은 앱에서 이용자·사장님을 골라 시작해요.", cta: true },
]
