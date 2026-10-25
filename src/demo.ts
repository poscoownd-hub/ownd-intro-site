// OWND 제품 데모 무대. 실제 앱 캡처(로컬 격리 서버에서 실제 앱을 조작해 얻은 화면)만으로
// "검색 → 상세 → 신청 → 사장님 승인 → 확정 알림 → 이용 완료 → 후기 → 커뮤니티 → 운영 데이터" 여정을 보여 준다.
// seek(t)는 시간(비트)과 무대 크기만으로 모든 스타일을 다시 계산한다(프레임 사이 상태 없음).
// 무대 안의 터치 점·강조 테두리·라벨은 연출이다. 방문자의 클릭은 서비스로 요청을 보내지 않는다.

import { BEATS, CAPTIONS, clamp, ease, lerp, seg, springStep, type Rect } from "./timeline"

// ───────── 자산 ─────────
const SHOT = (id: string) => `/assets/demo/${id}.webp`
/** 장면에서 쓰는 실제 캡처와 처음 필요한 비트(점진 로딩·seek 대기 기준) */
const ASSETS: Record<string, number> = {
  "h01-home": 0, "h02-typed1": 6, "h03-result1": 8, "h04-typed2": 12, "h05-result2": 14, "h07-public-sheet": 18, "h08-own-row": 24,
  "h09-own-detail": 28, "h10-date": 36, "h10b-party10": 38, "h11-person-price": 40, "h11b-back-a": 42, "h12-party": 44, "h13-slot": 46, "h14-pending": 48,
  "o03-list": 56, "o04-detail": 60, "o05-approved": 64, "h15-home-bell": 68, "h16-notifications": 70, "h17-confirmed": 72,
  "o07-usage": 76, "o08-completed": 78, "h20-completed": 80, "h21-review-empty": 82, "h22-review-filled": 83, "h23-review-posted": 84,
  "h24-home-tab": 86, "h26-board": 88, "h27-post": 90, "h29-chat-typed": 92, "h30-chat-sent": 94,
  "an-00": 96, "an-01": 100, "an-02": 102,
}
type Asset = string

// 앱 화면 좌표(CSS px, 390×844 기준)
type SR = { x: number; y: number; w: number; h: number }
const R = (x: number, y: number, w: number, h: number): SR => ({ x, y, w, h })
const SW = 390
const SH = 844

// ───────── 화면 사건(각 휴대폰) ─────────
type Ev =
  | { t: number; k: "set"; img: Asset }
  | { t: number; k: "push" | "pop"; img: Asset; d?: number }
  | { t: number; k: "sheet" | "sheetDown"; img: Asset; top: number; d?: number }
  | { t: number; k: "wipe"; img: Asset; r: SR; d?: number }
  | { t: number; k: "scroll"; img: Asset; r: SR; delta: number; d?: number }
  | { t: number; k: "lift"; img: Asset; from: SR; to: SR; d?: number }

/**
 * 입력 중인 글자 가리개: 입력이 끝난 캡처(img)의 입력칸 글자 영역을 흰색으로 덮었다가 왼쪽부터 걷어 낸다(타이핑).
 * 가리개는 그 캡처 층이 화면에 있을 때만, 그 층과 같이 움직인다(펼침·밀기 중에도 입력칸 위에 붙어 있음).
 */
type Typing = { img: Asset; from: number; to: number; r: SR; until: number }
type Tap = { t: number; r: SR; drag?: { dy: number; d: number } }
type Ring = { from: number; to: number; r: SR; label?: string }

type PhoneScript = { base: Asset; events: Ev[]; typing: Typing[]; taps: Tap[]; rings: Ring[] }

// 소비자 화면: 같은 사용자 '민수'가 같은 예약 하나를 끝까지 따라간다
const CONSUMER: PhoneScript = {
  base: "h01-home",
  events: [
    { t: 9.3, k: "lift", img: "h02-typed1", from: R(14, 326, 362, 46), to: R(14, 68, 362, 46), d: 1.0 },
    { t: 13.0, k: "wipe", img: "h03-result1", r: R(0, 112, SW, SH - 112), d: 0.9 },
    // 결과 화면의 입력칸을 다시 눌러 두 번째 질문을 입력(입력이 끝난 캡처로 바꾼 뒤 글자를 가렸다가 드러낸다)
    { t: 15.0, k: "set", img: "h04-typed2" },
    { t: 17.5, k: "wipe", img: "h05-result2", r: R(0, 112, SW, SH - 112), d: 0.9 },
    { t: 22.5, k: "sheet", img: "h07-public-sheet", top: 96, d: 0.8 },
    { t: 27.9, k: "sheetDown", img: "h05-result2", top: 96, d: 0.6 },
    { t: 28.9, k: "scroll", img: "h08-own-row", r: R(10, 268, 370, 504), delta: 504, d: 0.9 },
    { t: 31.9, k: "push", img: "h09-own-detail" },
    { t: 40.35, k: "set", img: "h10-date" },
    { t: 43.45, k: "set", img: "h10b-party10" },
    { t: 44.35, k: "set", img: "h11-person-price" },
    { t: 47.15, k: "set", img: "h11b-back-a" },
    { t: 47.8, k: "scroll", img: "h12-party", r: R(0, 48, SW, 710), delta: 617, d: 1.0 },
    { t: 49.55, k: "set", img: "h13-slot" },
    { t: 52.75, k: "push", img: "h14-pending" },
    { t: 72.4, k: "pop", img: "h15-home-bell", d: 0.7 },
    { t: 73.6, k: "push", img: "h16-notifications" },
    { t: 75.8, k: "push", img: "h17-confirmed" },
    { t: 84.0, k: "set", img: "h20-completed" },
    { t: 85.3, k: "push", img: "h21-review-empty" },
    { t: 86.6, k: "wipe", img: "h22-review-filled", r: R(0, 196, SW, 520), d: 1.0 },
    { t: 88.3, k: "pop", img: "h23-review-posted" },
    { t: 90.9, k: "pop", img: "h24-home-tab" },
    { t: 92.35, k: "set", img: "h26-board" },
    { t: 93.7, k: "push", img: "h27-post" },
    { t: 95.6, k: "push", img: "h29-chat-typed" },
    { t: 98.35, k: "set", img: "h30-chat-sent" },
    { t: 112.0, k: "set", img: "h01-home" },
  ],
  typing: [
    // 입력칸 글자 영역: x 46~338(검색 아이콘 뒤 ~ 보내기 버튼 앞), y 76~106
    { img: "h02-typed1", from: 10.4, to: 12.3, r: R(46, 76, 292, 30), until: 13.0 },
    // 첫 결과 화면의 입력칸 안내 문구(Keep Challenging)는 검색어로 오해되지 않게 비워 둔다
    { img: "h03-result1", from: 900, to: 901, r: R(46, 76, 292, 30), until: 999 },
    { img: "h04-typed2", from: 15.2, to: 16.7, r: R(46, 76, 292, 30), until: 17.5 },
    { img: "h29-chat-typed", from: 96.5, to: 97.9, r: R(24, 772, 286, 64), until: 98.35 },
  ],
  taps: [
    { t: 8.9, r: R(50, 332, 284, 33) },
    { t: 12.8, r: R(342, 75, 34, 34) },
    { t: 14.9, r: R(50, 75, 284, 33) },
    { t: 17.3, r: R(342, 75, 34, 34) },
    { t: 22.2, r: R(24, 760, 342, 17) },
    { t: 27.6, r: R(160, 798, 70, 24) },
    { t: 28.9, r: R(195, 640, 1, 1), drag: { dy: -300, d: 0.9 } },
    { t: 31.6, r: R(24, 599, 342, 17) },
    { t: 40.2, r: R(89.7, 394, 16.5, 20) },
    ...[41.2, 41.5, 41.8, 42.1, 42.4, 42.7, 43.0, 43.3].map((t) => ({ t, r: R(208.7, 430, 32, 32) })),
    { t: 44.2, r: R(107.3, 474, 48.5, 20) },
    { t: 47.0, r: R(31, 474, 48.3, 20) },
    { t: 47.8, r: R(195, 680, 1, 1), drag: { dy: -360, d: 1.0 } },
    { t: 49.4, r: R(20, 392, 64, 24) },
    { t: 52.4, r: R(300.9, 784, 52.1, 20) },
    { t: 73.4, r: R(334, 16, 36, 36) },
    { t: 75.5, r: R(58, 207, 214.9, 24) },
    { t: 85.0, r: R(169, 800, 52.1, 20) },
    { t: 86.4, r: R(204, 222, 44, 44) },
    { t: 88.0, r: R(162.8, 800, 64.4, 20) },
    { t: 92.2, r: R(175.6, 826, 38.7, 16) },
    { t: 93.4, r: R(20, 189, 350, 24) },
    { t: 95.3, r: R(37, 296, 89, 20) },
    { t: 98.2, r: R(321, 783, 44, 44) },
  ],
  rings: [
    { from: 6.0, to: 8.7, r: R(10, 324, 370, 50) },
    { from: 18.6, to: 21.6, r: R(6, 162, 378, 34), label: "질문 두 개가 검색 블록으로 남아요" },
    { from: 24.0, to: 27.3, r: R(10, 440, 370, 150), label: "공공: 기관 예약 경로 안내" },
    { from: 29.9, to: 31.4, r: R(12, 592, 366, 64), label: "오운디 연결 시설: 앱에서 신청" },
    { from: 33.6, to: 38.6, r: R(10, 150, 370, 152), label: "결제는 현장, 승인 후 확정" },
    { from: 44.7, to: 46.7, r: R(10, 604, 370, 146), label: "같은 시설의 1인 가격 슬롯" },
    { from: 50.0, to: 52.2, r: R(8, 752, 374, 70) },
    { from: 54.4, to: 56.8, r: R(10, 186, 370, 30), label: "상태: 승인 대기" },
    { from: 56.9, to: 59.6, r: R(10, 458, 370, 118), label: "승인 마감 = 시작 + 30분" },
    { from: 76.9, to: 79.6, r: R(10, 186, 370, 30), label: "상태: 예약 확정" },
    { from: 89.2, to: 90.6, r: R(10, 680, 370, 96), label: "방문 인증 후기 게시" },
  ],
}

// 사장님 화면: 같은 예약을 처리한다(60–84). 100–112는 별도 샘플 시설(읽기 전용 샘플 모드)
const OWNER: PhoneScript = {
  base: "o03-list",
  events: [
    { t: 64.9, k: "push", img: "o04-detail" },
    { t: 68.55, k: "set", img: "o05-approved" },
    { t: 79.5, k: "set", img: "o07-usage" },
    { t: 82.55, k: "set", img: "o08-completed" },
    { t: 99.5, k: "set", img: "an-00" },
    { t: 103.6, k: "scroll", img: "an-01", r: R(0, 48, SW, SH - 48), delta: 650, d: 1.0 },
    { t: 107.0, k: "scroll", img: "an-02", r: R(0, 48, SW, SH - 48), delta: 650, d: 1.0 },
  ],
  typing: [],
  taps: [
    { t: 64.6, r: R(33, 486, 259.6, 20) },
    { t: 68.4, r: R(217.6, 800, 76.7, 20) },
    { t: 82.4, r: R(131.1, 474, 52.1, 20) },
    { t: 103.6, r: R(195, 680, 1, 1), drag: { dy: -320, d: 1.0 } },
    { t: 107.0, r: R(195, 680, 1, 1), drag: { dy: -320, d: 1.0 } },
  ],
  rings: [
    { from: 62.4, to: 64.4, r: R(10, 396, 370, 108), label: "같은 신청: 10/26 19:00 · 10명" },
    { from: 65.9, to: 68.1, r: R(10, 82, 370, 106), label: "자동 마감 규칙을 함께 안내" },
    { from: 69.0, to: 71.8, r: R(10, 148, 370, 26), label: "예약 확정" },
    { from: 82.8, to: 83.9, r: R(10, 440, 370, 70), label: "이용 완료 기록" },
    { from: 101.0, to: 103.3, r: R(10, 250, 370, 300), label: "매출 기록" },
    { from: 104.8, to: 106.8, r: R(10, 120, 370, 330), label: "가동률·취소율·이용 완료·노쇼" },
    { from: 108.2, to: 111.4, r: R(10, 40, 370, 460), label: "예약 퍼널(노출 → 확정)" },
  ],
}

// ───────── 배치 ─────────
type Mode = "wide" | "narrow"
const WORLD: Record<Mode, { W: number; H: number }> = { wide: { W: 1500, H: 900 }, narrow: { W: 440, H: 900 } }
/** 넓은 화면: 지금 다루는 휴대폰은 가운데, 다른 역할의 휴대폰은 작게 뒤쪽 옆(PEEK_X)에, 설명은 반대쪽 옆(CAP_GAP부터)에 */
const PEEK_X = 330
const PEEK_SCALE = 0.8
const CAP_GAP = 282
const CAP_W = 400
const BEZ = 14 // 베젤(앱 좌표)

type Slot = "c" | "l" | "r" | "outL" | "outR"
/** 시간 → 두 휴대폰의 자리(전환 구간은 둘 사이를 보간). 지금 다루는 쪽이 가운데, 이용자는 왼쪽 뒤·사장님은 오른쪽 뒤에서 기다린다 */
const ROLE_KEYS: { t: number; c: Slot; o: Slot; active: "c" | "o" }[] = [
  { t: 0, c: "c", o: "outR", active: "c" },
  { t: 60, c: "c", o: "outR", active: "c" },
  { t: 61.6, c: "l", o: "c", active: "o" },
  { t: 72.0, c: "l", o: "c", active: "o" },
  { t: 73.0, c: "c", o: "r", active: "c" },
  { t: 79.2, c: "c", o: "r", active: "c" },
  { t: 80.2, c: "l", o: "c", active: "o" },
  { t: 83.4, c: "l", o: "c", active: "o" },
  { t: 84.4, c: "c", o: "r", active: "c" },
  { t: 88.6, c: "c", o: "r", active: "c" },
  { t: 90.2, c: "c", o: "outR", active: "c" },
  { t: 99.0, c: "c", o: "outR", active: "c" },
  { t: 100.6, c: "outL", o: "c", active: "o" },
  { t: 111.6, c: "outL", o: "c", active: "o" },
  { t: 113.2, c: "c", o: "outR", active: "c" },
  { t: 120, c: "c", o: "outR", active: "c" },
]

// ───────── 카메라(필요한 부분만 확대) ─────────
type CamKey = { t: number; s: number; who?: "c" | "o"; at?: { x: number; y: number }; logo?: true }
const CAM: CamKey[] = [
  { t: 0, s: 1.25, who: "c", at: { x: 195, y: 330 }, logo: true },
  { t: 2.6, s: 1.25, who: "c", at: { x: 195, y: 330 }, logo: true },
  { t: 5.6, s: 1 },
  { t: 18.4, s: 1 },
  { t: 19.4, s: 1.7, who: "c", at: { x: 195, y: 230 } },
  { t: 21.4, s: 1.7, who: "c", at: { x: 195, y: 230 } },
  { t: 22.2, s: 1 },
  { t: 23.8, s: 1 },
  { t: 24.6, s: 1.5, who: "c", at: { x: 195, y: 520 } },
  { t: 27.2, s: 1.5, who: "c", at: { x: 195, y: 520 } },
  { t: 27.7, s: 1 },
  { t: 33.4, s: 1 },
  { t: 34.2, s: 1.55, who: "c", at: { x: 195, y: 230 } },
  { t: 38.4, s: 1.55, who: "c", at: { x: 195, y: 230 } },
  { t: 39.4, s: 1 },
  { t: 54.2, s: 1 },
  { t: 55.0, s: 1.45, who: "c", at: { x: 195, y: 380 } },
  { t: 59.4, s: 1.45, who: "c", at: { x: 195, y: 380 } },
  { t: 60.2, s: 1 },
  { t: 65.8, s: 1 },
  { t: 66.4, s: 1.35, who: "o", at: { x: 195, y: 300 } },
  { t: 71.6, s: 1.35, who: "o", at: { x: 195, y: 300 } },
  { t: 72.3, s: 1 },
  { t: 116.0, s: 1 },
  { t: 119.2, s: 1.25, who: "c", at: { x: 195, y: 330 }, logo: true },
  { t: 120, s: 1.25, who: "c", at: { x: 195, y: 330 }, logo: true },
]

// ───────── 무대 위 라벨 ─────────
const BOOKING_INFO = "10월 26일(월) 19:00 · 풋살장 A · 10명 · ₩30,000"
const STATUS_STEPS: [number, string][] = [
  [53.6, "승인 대기"],
  [68.55, "예약 확정"],
  [82.55, "이용 완료"],
]
const DATA_NODES = ["검색 대화·질문", "조건·후보·노출", "예약 신청·승인", "이용 완료·노쇼", "후기·사장님 답글", "운영 분석(재계산)"]

export type StoryOptions = { cta?: HTMLElement }

type PhoneEls = { root: HTMLDivElement; screen: HTMLDivElement; imgs: Map<Asset, HTMLImageElement[]>; dim: HTMLDivElement; covers: HTMLDivElement[]; role: HTMLDivElement; dot: HTMLDivElement; ripple: HTMLDivElement; rings: { el: HTMLDivElement; label: HTMLDivElement }[] }

function div(parent: HTMLElement, cls = "", text = ""): HTMLDivElement {
  const d = document.createElement("div")
  if (cls) d.className = cls
  if (text) d.textContent = text
  parent.appendChild(d)
  return d
}

export class Story {
  readonly beats = BEATS
  private stage: HTMLElement
  private cta: HTMLElement | null
  private world!: HTMLDivElement
  private worldClip!: HTMLDivElement
  private phones!: { c: PhoneEls; o: PhoneEls }
  private chip!: { root: HTMLDivElement; status: HTMLSpanElement[]; info: HTMLSpanElement }
  private diagram!: { root: HTMLDivElement; nodes: HTMLDivElement[]; line: HTMLDivElement; note: HTMLDivElement }
  private apkPill!: HTMLDivElement
  private capLayer!: HTMLDivElement
  private capGroups: { root: HTMLDivElement; kicker: HTMLDivElement; title: HTMLDivElement; body: HTMLDivElement; lead: HTMLDivElement; h: number; ctaY: number }[] = []
  private mode: Mode = "wide"
  private vw = 1
  private vh = 1
  private k = 1
  private origin = { x: 0, y: 0 }
  private capBox = { mode: "side" as "side" | "above", x: 0, y: 0, w: 0, h: 0 }
  private cam = { tx: 0, ty: 0, s: 1 }
  private decoded = new Map<Asset, Promise<void>>()
  private ready: Promise<void> | null = null

  constructor(stage: HTMLElement, opts: StoryOptions = {}) {
    this.stage = stage
    this.cta = opts.cta ?? null
  }

  warm(): Promise<void> {
    return Promise.resolve()
  }

  /** 자산을 실제로 불러온다(처음 한 번). 두 휴대폰의 같은 자산 img를 함께 */
  load(a: Asset): Promise<void> {
    let p = this.decoded.get(a)
    if (!p) {
      const list = [...(this.phones.c.imgs.get(a) ?? []), ...(this.phones.o.imgs.get(a) ?? [])]
      p = Promise.all(
        list.map((im) => {
          if (!im.getAttribute("src")) im.src = im.dataset.src!
          return im.decode().catch(() => undefined)
        }),
      ).then(() => undefined)
      this.decoded.set(a, p)
    }
    return p
  }

  async preloadRest(): Promise<void> {
    const order = Object.keys(ASSETS).sort((a, b) => ASSETS[a] - ASSETS[b])
    for (const a of order) await this.load(a)
    // 처음 화면에 나올 때 그리기 비용으로 프레임이 끊기지 않도록, 모든 캡처를 한 번씩 현재 화면 뒤에 그려 둔다
    this.warmQueue = order.filter((a) => a !== "h01-home")
    this.stage.dataset.warm = "running"
  }
  private warmNow: Asset | null = null
  /** 아직 한 번도 그리지 않은 캡처(프레임마다 하나씩 현재 화면 뒤에 그린다) */
  private warmQueue: Asset[] = []

  async init(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      await document.fonts.ready
      this.build()
      await this.load("h01-home")
      this.resize()
    })()
    return this.ready
  }

  // ───────── 만들기 ─────────
  private build(): void {
    const s = this.stage
    s.innerHTML = ""
    this.worldClip = div(s, "world-clip")
    this.world = div(this.worldClip, "world")
    const mkPhone = (who: "c" | "o"): PhoneEls => {
      const root = div(this.world, "phone el")
      const screen = div(root, "phone-screen")
      const imgs = new Map<Asset, HTMLImageElement[]>()
      const script = who === "c" ? CONSUMER : OWNER
      const used = new Set<Asset>([script.base, ...script.events.map((e) => e.img)])
      // 한 장면에서 같은 캡처가 두 층(스크롤 이동 층 + 고정 머리·바닥)에 쓰일 수 있어 2장씩 둔다
      for (const a of used) {
        const pair = [0, 1].map(() => {
          const im = document.createElement("img")
          im.alt = ""
          im.decoding = "async"
          im.draggable = false
          im.dataset.src = SHOT(a)
          im.className = "shot"
          screen.appendChild(im)
          return im
        })
        imgs.set(a, pair)
      }
      const dim = div(screen, "screen-dim")
      const covers = [0, 1, 2].map(() => div(screen, "screen-cover"))
      const rings = script.rings.map(() => {
        const el = div(screen, "ring")
        const label = div(root, "ring-label")
        return { el, label }
      })
      script.rings.forEach((r, i) => (rings[i].label.textContent = r.label ?? ""))
      const dot = div(screen, "touch")
      const ripple = div(screen, "touch-ripple")
      const role = div(this.world, "role-tag el", who === "c" ? "이용자 화면 · ownd customers" : "사장님 화면 · ownd partners")
      return { root, screen, imgs, dim, covers, role, dot, ripple, rings }
    }
    this.phones = { c: mkPhone("c"), o: mkPhone("o") }

    const chip = div(this.world, "bk-chip el")
    const st = div(chip, "bk-status")
    const status = STATUS_STEPS.map(([, label]) => {
      const sp = document.createElement("span")
      sp.textContent = label
      st.appendChild(sp)
      return sp
    })
    const info = document.createElement("span")
    info.className = "bk-info"
    info.textContent = BOOKING_INFO
    chip.appendChild(info)
    this.chip = { root: chip, status, info }

    const dg = div(this.world, "dgram el")
    div(dg, "dgram-title", "기록이 이어지는 순서")
    const line = div(dg, "dgram-line")
    const nodes = DATA_NODES.map((n, i) => {
      const node = div(dg, "dgram-node")
      div(node, "dgram-n", String(i + 1))
      div(node, "dgram-t", n)
      return node
    })
    const note = div(dg, "dgram-note", "원천 기록을 남겨 두고 분석은 다시 계산해요. 개인별 자동 추천 학습은 아직 하지 않아요.")
    this.diagram = { root: dg, nodes, line, note }

    this.apkPill = div(this.world, "apk-pill el", "Android 앱 받기 · APK")

    this.buildCaptions()
  }

  private buildCaptions(): void {
    this.capLayer = div(this.stage, "cap-layer")
    for (const c of CAPTIONS) {
      const lead = div(this.capLayer, `cap-lead cap-lead-${c.side}`)
      const root = div(this.capLayer, `cap cap-${c.side}`)
      const mask = (cls: string, text: string) => {
        const m = div(root, `mask ${cls}`)
        const sp = document.createElement("span")
        sp.textContent = text
        m.appendChild(sp)
        return m
      }
      const kicker = mask("cap-kicker", c.kicker)
      const title = mask("cap-title", c.title)
      const body = mask("cap-body", c.body)
      this.capGroups.push({ root, kicker, title, body, lead, h: 0, ctaY: 0 })
    }
  }

  // ───────── 크기 ─────────
  resize(): void {
    const r = this.stage.getBoundingClientRect()
    this.vw = Math.max(1, r.width)
    this.vh = Math.max(1, r.height)
    const vw = this.vw
    const vh = this.vh
    let area: Rect
    if (vw >= 900 && vw >= vh * 1.1) {
      // 가로 화면: 무대 전체를 시연에 쓰고, 설명은 휴대폰 옆 알맞은 높이에 띄운다
      area = { x: 0, y: 0, w: vw, h: vh }
      this.mode = "wide"
      this.k = Math.min(vw / WORLD.wide.W, vh / WORLD.wide.H)
      this.capBox = { mode: "side", x: 0, y: 0, w: Math.max(280, CAP_W * this.k), h: vh }
    } else {
      // 세로 화면: 설명은 휴대폰 위(아래에 두면 화면 밖으로 밀려 안 보일 수 있음). 높이는 가장 긴 설명에 맞춘다
      this.capBox = { mode: "above", x: 20, y: 0, w: vw - 40, h: 9999 }
      const need = this.layoutCaptions() + 24
      const capH = clamp(need, 110, vh * 0.36)
      area = { x: 0, y: capH, w: vw, h: vh - capH }
      this.capBox = { mode: "above", x: 20, y: 14, w: vw - 40, h: capH }
      this.mode = area.w >= 700 ? "wide" : "narrow"
      this.k = Math.min(area.w / WORLD[this.mode].W, area.h / WORLD[this.mode].H)
    }
    const { W, H } = WORLD[this.mode]
    this.origin = { x: area.x + (area.w - W * this.k) / 2, y: area.y + (area.h - H * this.k) / 2 }
    Object.assign(this.worldClip.style, { left: `${area.x}px`, top: `${area.y}px`, width: `${area.w}px`, height: `${area.h}px` })
    this.clipOrigin = { x: area.x, y: area.y }
    this.stage.dataset.mode = this.mode
    this.layoutCaptions()
  }
  private clipOrigin = { x: 0, y: 0 }

  private layoutCaptions(): number {
    const b = this.capBox
    this.capLayer.dataset.mode = b.mode
    this.capLayer.style.setProperty("--k", String(this.k))
    let maxH = 0
    // 숨겨진(display:none) 설명은 높이가 0으로 재지므로 잠깐 보이게 한 뒤 잰다(다음 apply가 다시 정리)
    for (const g of this.capGroups) for (const m of [g.root, g.kicker, g.title, g.body]) m.style.display = "block"
    this.capGroups.forEach((g, i) => {
      g.root.style.width = `${b.w}px`
      let y = 0
      for (const m of [g.kicker, g.title, g.body]) {
        m.style.width = `${b.w}px`
        m.dataset.y = String(y)
        y += m.offsetHeight + (m === g.kicker ? 6 : m === g.title ? 12 : 0)
      }
      if (CAPTIONS[i].cta && this.cta) {
        g.ctaY = y + 18
        y += this.cta.offsetHeight + 18
      }
      g.h = y
      maxH = Math.max(maxH, g.h)
    })
    return maxH
  }

  // ───────── 시간 → 장면 ─────────
  async seek(t: number, commit: () => boolean = () => true): Promise<void> {
    await this.init()
    const tt = ((t % BEATS) + BEATS) % BEATS
    const need = Object.keys(ASSETS).filter((a) => ASSETS[a] <= tt + 6)
    await Promise.all(need.map((a) => this.load(a)))
    if (!commit()) return
    this.apply(tt)
  }

  private apply(t: number): void {
    const { W, H } = WORLD[this.mode]
    const roles = this.roleAt(t)
    const cam = this.cameraAt(t, roles)
    // 카메라: 초점(fx, fy)이 무대 가운데에 오도록 확대
    const s = cam.s
    const tx = W / 2 - cam.fx * s
    const ty = H / 2 - cam.fy * s
    this.camS = s
    this.cam = { tx, ty, s }
    this.world.style.transform = `translate(${this.origin.x - this.clipOrigin.x + tx * this.k}px,${this.origin.y - this.clipOrigin.y + ty * this.k}px) scale(${this.k * s})`
    this.warmNow = this.warmQueue.shift() ?? null
    if (!this.warmNow && this.stage.dataset.warm === "running") this.stage.dataset.warm = "done"
    this.drawPhone("c", CONSUMER, t, roles)
    this.drawPhone("o", OWNER, t, roles)
    this.drawChips(t, roles)
    this.drawCaptions(t, roles)
    this.stage.dataset.t = t.toFixed(3)
  }
  private camS = 1

  // ── 배치 ──
  private slotPos(slot: Slot): { x: number; y: number } {
    const { W, H } = WORLD[this.mode]
    const cy = this.mode === "narrow" ? H / 2 - 30 : H / 2 - 8
    if (this.mode === "narrow") {
      const map: Record<Slot, number> = { c: W / 2, l: W / 2, r: W / 2, outL: -W * 1.6, outR: W * 2.6 }
      return { x: map[slot], y: cy }
    }
    const map: Record<Slot, number> = { c: W / 2, l: W / 2 - PEEK_X, r: W / 2 + PEEK_X, outL: -W * 0.4, outR: W * 1.4 }
    return { x: map[slot], y: cy }
  }
  /** 좁은 화면에서는 활성 휴대폰만 가운데에 둔다 */
  private narrowSlot(who: "c" | "o", slot: Slot, active: "c" | "o"): Slot {
    if (this.mode !== "narrow") return slot
    if (slot === "outL" || slot === "outR") return slot
    if (active === who) return "c"
    return who === "c" ? "outL" : "outR"
  }
  private roleAt(t: number): { c: { x: number; y: number; dim: number }; o: { x: number; y: number; dim: number }; active: "c" | "o" } {
    let i = 0
    while (i < ROLE_KEYS.length - 2 && t >= ROLE_KEYS[i + 1].t) i++
    const a = ROLE_KEYS[i]
    const b = ROLE_KEYS[i + 1]
    const p = ease.inOut(seg(t, a.t, b.t))
    const pos = (who: "c" | "o") => {
      const pa = this.slotPos(this.narrowSlot(who, a[who], a.active))
      const pb = this.slotPos(this.narrowSlot(who, b[who], b.active))
      return { x: lerp(pa.x, pb.x, p), y: lerp(pa.y, pb.y, p) }
    }
    const dimOf = (who: "c" | "o") => lerp(a.active === who ? 0 : 1, b.active === who ? 0 : 1, p)
    return { c: { ...pos("c"), dim: dimOf("c") }, o: { ...pos("o"), dim: dimOf("o") }, active: p < 0.5 ? a.active : b.active }
  }
  private phoneScale(): number {
    const { H } = WORLD[this.mode]
    // 좁은 화면은 휴대폰 아래 예약 칩 자리를 남긴다
    return (H - (this.mode === "narrow" ? 210 : 180)) / (SH + BEZ * 2)
  }
  /** 앱 화면 좌표 → 월드 좌표 */
  private toWorld(pos: { x: number; y: number }, p: { x: number; y: number }, scale = 1): { x: number; y: number } {
    const kp = this.phoneScale() * scale
    return { x: pos.x + (p.x - SW / 2) * kp, y: pos.y + (p.y - SH / 2) * kp }
  }

  private cameraAt(t: number, roles: ReturnType<Story["roleAt"]>): { s: number; fx: number; fy: number } {
    const { W, H } = WORLD[this.mode]
    const narrowCap = this.mode === "narrow" ? 0.72 : 1
    // 옆에 설명을 띄우는 넓은 화면에서는 휴대폰이 이미 크므로 중간 확대를 줄인다(설명을 덮지 않게). 처음·끝 로고 확대는 그대로
    const midCap = 0 // 중간 확대는 쓰지 않는다(휴대폰이 화면 밖으로 잘리지 않게). 강조는 테두리·라벨로
    const resolve = (k: CamKey) => {
      if (!k.who || !k.at || (!k.logo && midCap === 0)) return { s: 1, x: W / 2, y: H / 2 }
      const pos = roles[k.who]
      const w = this.toWorld(pos, k.at)
      const s0 = k.logo ? k.s : 1 + (k.s - 1) * midCap
      return { s: 1 + (s0 - 1) * narrowCap, x: w.x, y: w.y }
    }
    let i = 0
    while (i < CAM.length - 2 && t >= CAM[i + 1].t) i++
    const a = resolve(CAM[i])
    const b = resolve(CAM[i + 1])
    const p = ease.inOut(seg(t, CAM[i].t, CAM[i + 1].t))
    const s = Math.exp(lerp(Math.log(a.s), Math.log(b.s), p))
    // 두 열쇠 장면의 이동량(tx = W/2 − 초점×배율)을 보간한다 → 확대 시작·끝에서 위치가 튀지 않는다
    const txa = W / 2 - a.x * a.s
    const tya = H / 2 - a.y * a.s
    const txb = W / 2 - b.x * b.s
    const tyb = H / 2 - b.y * b.s
    // 배율 보간과 맞물리도록 같은 진행도(로그 배율 기준)를 쓴다
    const k = Math.abs(Math.log(b.s) - Math.log(a.s)) > 1e-6 ? (Math.log(s) - Math.log(a.s)) / (Math.log(b.s) - Math.log(a.s)) : p
    const tx = lerp(txa, txb, k)
    const ty = lerp(tya, tyb, k)
    // apply()는 초점을 받으므로 이동량에서 초점을 되돌려 구한다
    return { s, fx: (W / 2 - tx) / s, fy: (H / 2 - ty) / s }
  }

  // ── 휴대폰 한 대 그리기 ──
  private drawPhone(who: "c" | "o", sc: PhoneScript, t: number, roles: ReturnType<Story["roleAt"]>): void {
    const el = this.phones[who]
    const pos = roles[who]
    const kp = this.phoneScale()
    const dimScale = this.mode === "wide" ? lerp(1, PEEK_SCALE, pos.dim) : 1
    const pw = SW + BEZ * 2
    const ph = SH + BEZ * 2
    const k = kp * dimScale
    const visible = pos.x > -pw * k && pos.x < WORLD[this.mode].W + pw * k
    el.root.style.display = visible ? "block" : "none"
    el.role.style.display = visible ? "block" : "none"
    if (!visible) return
    el.root.style.transform = `translate(${pos.x - (pw * k) / 2}px,${pos.y - (ph * k) / 2}px) scale(${k})`
    el.root.style.setProperty("--dim", String(this.mode === "wide" ? pos.dim * 0.5 : 0))
    // 지금 다루는 휴대폰이 앞에
    el.root.style.zIndex = pos.dim < 0.5 ? "3" : "1"
    el.role.style.zIndex = pos.dim < 0.5 ? "3" : "1"
    // 역할 표시
    const roleY = pos.y - (ph * k) / 2 - 48
    el.role.style.transform = `translate(${pos.x}px,${roleY}px) translateX(-50%)`
    // 확대 중에는 역할 표시가 무대 위로 밀려 잘리므로 잠시 숨긴다
    el.role.style.opacity = String(clamp(1 - (this.camS - 1) / 0.12))
    el.role.classList.toggle("on", roles.active === who)

    // 화면 층
    const layers = this.screenLayers(sc, t)
    for (const [a, pair] of el.imgs) {
      const Ls = layers.filter((l) => l.img === a)
      pair.forEach((im, j) => {
        const L = Ls[j]
        if (!L) {
          // 미리 그리기: 현재 화면 맨 뒤(z 0)에 한 프레임 그려 둔다(위 화면이 불투명하게 덮음)
          if (j === 0 && a === this.warmNow && Ls.length === 0) {
            Object.assign(im.style, { display: "block", transform: "translate(0px,0px)", clipPath: "none", zIndex: "0" })
            return
          }
          im.style.display = "none"
          return
        }
        im.style.display = "block"
        im.style.transform = `translate(${L.x.toFixed(2)}px,${L.y.toFixed(2)}px)`
        im.style.clipPath = L.clip ?? "none"
        im.style.zIndex = String(L.z)
      })
    }
    const dimA = layers.reduce((m, l) => Math.max(m, l.dim ?? 0), 0)
    el.dim.style.display = dimA > 0.001 ? "block" : "none"
    el.dim.style.opacity = String(dimA)

    // 타이핑 가리개(입력이 끝난 캡처 층에 붙어 함께 움직인다)
    el.covers.forEach((c) => (c.style.display = "none"))
    let ci = 0
    for (const ty of sc.typing) {
      if (t >= ty.until) continue
      const p = seg(t, ty.from, ty.to)
      if (p >= 1) continue
      const L = layers.filter((l) => l.img === ty.img).sort((a, b) => b.z - a.z)[0]
      if (!L) continue
      const c = el.covers[ci++]
      if (!c) break
      Object.assign(c.style, { display: "block", left: `${L.x + ty.r.x + ty.r.w * p}px`, top: `${L.y + ty.r.y}px`, width: `${ty.r.w * (1 - p)}px`, height: `${ty.r.h}px`, zIndex: String(L.z + 1) })
      // 입력 위치 커서(깜빡임은 시간의 함수)
      c.classList.toggle("caret", Math.floor(t * 4) % 2 === 0 || (p > 0 && p < 1))
    }

    // 강조 테두리(조작 대상·결과를 짚는다)
    sc.rings.forEach((r, i) => {
      const { el: ring, label } = el.rings[i]
      if (t < r.from || t >= r.to) {
        ring.style.display = "none"
        label.style.display = "none"
        return
      }
      const inP = springStep(t - r.from, { freq: 1.6, damping: 0.78 })
      const outP = ease.in(seg(t, r.to - 0.3, r.to))
      const pad = 4 * (1 - inP)
      Object.assign(ring.style, { display: "block", left: `${r.r.x - pad}px`, top: `${r.r.y - pad}px`, width: `${r.r.w + pad * 2}px`, height: `${r.r.h + pad * 2}px`, opacity: String(clamp(inP) * (1 - outP)) })
      if (r.label) {
        // 라벨은 화면 밖(베젤 바깥) 아래쪽 또는 위쪽에 붙는다
        const below = r.r.y + r.r.h + 54 < SH
        const ly = below ? r.r.y + r.r.h + 8 : r.r.y - 40
        Object.assign(label.style, { display: "block", transform: `translate(${BEZ + r.r.x}px,${BEZ + ly}px) scale(${1 / Math.max(1, this.camS * 0.9)})`, opacity: String(clamp(inP) * (1 - outP)) })
      }
    })

    // 터치 점
    this.drawTouch(el, sc, t)
  }

  /** 화면에 보이는 캡처 층 목록. 사건 사이 전환은 실제 앱의 이동 방식(밀기·시트·스크롤·펼침)으로 */
  private screenLayers(sc: PhoneScript, t: number): { img: Asset; x: number; y: number; clip?: string; z: number; dim?: number }[] {
    let cur: Asset = sc.base
    let last: Ev | null = null
    let prev: Asset = sc.base
    for (const e of sc.events) {
      if (t < e.t) break
      prev = cur
      cur = e.img
      last = e
    }
    if (!last) return [{ img: cur, x: 0, y: 0, z: 1 }]
    const e = last
    const d = "d" in e && e.d ? e.d : e.k === "push" || e.k === "pop" ? 0.75 : 0.6
    const p = seg(t, e.t, e.t + d)
    if (e.k === "set" || p >= 1) {
      // 시트가 내려간 뒤에도 아래 화면 그대로
      return [{ img: cur, x: 0, y: 0, z: 1 }]
    }
    const q = ease.nav(p)
    switch (e.k) {
      case "push":
        return [
          { img: prev, x: -SW * 0.28 * q, y: 0, z: 1, dim: 0.18 * q },
          { img: cur, x: SW * (1 - q), y: 0, z: 3 },
        ]
      case "pop":
        return [
          { img: cur, x: -SW * 0.28 * (1 - q), y: 0, z: 1, dim: 0.18 * (1 - q) },
          { img: prev, x: SW * q, y: 0, z: 3 },
        ]
      case "sheet": {
        const top = e.top
        const off = (SH - top) * (1 - q)
        return [
          { img: prev, x: 0, y: 0, z: 1, dim: 0.0 },
          // 위쪽(어두워진 배경)은 실제 캡처의 어두운 부분을 쓰지 않고, 아래 화면 위에 같은 정도의 어두움만 얹는다
          { img: cur, x: 0, y: off, clip: `inset(${top}px 0 0 0)`, z: 3, dim: 0.42 * q },
        ]
      }
      case "sheetDown": {
        const top = e.top
        const off = (SH - top) * q
        return [
          { img: cur, x: 0, y: 0, z: 1, dim: 0.42 * (1 - q) },
          { img: prev, x: 0, y: off, clip: `inset(${top}px 0 0 0)`, z: 3 },
        ]
      }
      case "wipe": {
        const r = e.r
        const h = r.h * ease.out(p)
        return [
          { img: prev, x: 0, y: 0, z: 1 },
          { img: cur, x: 0, y: 0, z: 3, clip: `inset(0 0 ${SH - (r.y + h)}px 0)` },
        ]
      }
      case "scroll": {
        // 스크롤: 이전 화면 내용이 위로 올라가고, 같은 거리만큼 아래에서 다음 내용이 올라온다(영역 안에서만)
        // 같은 캡처가 두 층에 필요하므로 이전 화면은 고정 배경 + 이동 층으로 나눈다(이동 층은 별도 img)
        const r = e.r
        const dist = e.delta * ease.inOut(p)
        const shift = e.delta - dist
        return [
          { img: prev, x: 0, y: -dist, z: 2, clip: `inset(${r.y + dist}px 0 ${SH - r.y - r.h}px 0)` },
          { img: cur, x: 0, y: shift, z: 3, clip: `inset(${r.y}px 0 ${Math.max(0, SH - (r.y + r.h - shift))}px 0)` },
          { img: cur, x: 0, y: 0, z: 1, clip: `polygon(0 0, ${SW}px 0, ${SW}px ${r.y}px, 0 ${r.y}px, 0 ${r.y + r.h}px, ${SW}px ${r.y + r.h}px, ${SW}px ${SH}px, 0 ${SH}px)` },
        ]
      }
      case "lift": {
        // 검색칸이 위로 올라가며 검색 화면이 칸에서부터 펼쳐진다
        const a = e.from
        const b = e.to
        const ry = lerp(a.y, b.y, q)
        const grow = ease.inOut(seg(t, e.t + d * 0.25, e.t + d))
        const top = lerp(ry, 0, grow)
        const bottom = lerp(ry + b.h, SH, grow)
        const left = lerp(a.x, 0, grow)
        const right = lerp(a.x + a.w, SW, grow)
        return [
          { img: prev, x: 0, y: 0, z: 1 },
          { img: cur, x: 0, y: ry - b.y, z: 3, clip: `inset(${top - (ry - b.y)}px ${SW - right}px ${SH - bottom + (ry - b.y)}px ${left}px round ${lerp(20, 0, grow)}px)` },
        ]
      }
    }
    return [{ img: cur, x: 0, y: 0, z: 1 }]
  }

  private drawTouch(el: PhoneEls, sc: PhoneScript, t: number): void {
    const APPROACH = 0.7
    const AFTER = 0.45
    let g: Tap | null = null
    let gi = -1
    for (let i = 0; i < sc.taps.length; i++) {
      const tp = sc.taps[i]
      const end = tp.t + (tp.drag ? tp.drag.d : 0) + AFTER
      if (t >= tp.t - APPROACH && t < end) {
        g = tp
        gi = i
      }
    }
    el.dot.style.display = "none"
    el.ripple.style.display = "none"
    if (!g) return
    const target = { x: g.r.x + g.r.w / 2, y: g.r.y + g.r.h / 2 }
    // 출발점: 직전 조작 위치(1.4비트 안이면) 아니면 화면 아래 바깥
    const prevTap = gi > 0 ? sc.taps[gi - 1] : null
    const prevEnd = prevTap ? prevTap.t + (prevTap.drag ? prevTap.drag.d : 0) : -99
    const start = prevTap && g.t - prevEnd < 1.4 ? { x: prevTap.r.x + prevTap.r.w / 2, y: prevTap.r.y + prevTap.r.h / 2 + (prevTap.drag ? prevTap.drag.dy : 0) } : { x: target.x + 60, y: SH + 40 }
    const ap = ease.inOut(seg(t, g.t - APPROACH, g.t - 0.05))
    let x = lerp(start.x, target.x, ap)
    let y = lerp(start.y, target.y, ap)
    let pressed = t >= g.t - 0.05 && t < g.t + 0.12
    if (g.drag) {
      const dp = ease.inOut(seg(t, g.t, g.t + g.drag.d))
      y += g.drag.dy * dp
      pressed = t >= g.t - 0.05 && t < g.t + g.drag.d
    }
    const leave = seg(t, (g.drag ? g.t + g.drag.d : g.t) + 0.1, (g.drag ? g.t + g.drag.d : g.t) + AFTER)
    const sz = pressed ? 30 : 38
    Object.assign(el.dot.style, { display: "block", transform: `translate(${x - sz / 2}px,${y - sz / 2}px)`, width: `${sz}px`, height: `${sz}px`, opacity: String(1 - leave) })
    if (!g.drag && t >= g.t && t < g.t + 0.5) {
      const rp = ease.out(seg(t, g.t, g.t + 0.5))
      const rr = 18 + 26 * rp
      Object.assign(el.ripple.style, { display: "block", transform: `translate(${target.x - rr}px,${target.y - rr}px)`, width: `${rr * 2}px`, height: `${rr * 2}px`, opacity: String(1 - rp) })
    }
  }

  // ── 무대 라벨 ──
  private drawChips(t: number, roles: ReturnType<Story["roleAt"]>): void {
    const kp = this.phoneScale()
    const ph = (SH + BEZ * 2) * kp
    const hide = (e: HTMLElement) => (e.style.display = "none")
    // 같은 예약 표시: 신청 직후부터 후기 전까지, 지금 다루는 휴대폰 아래를 따라간다
    const chip = this.chip.root
    if (t >= 53.6 && t < 89.4) {
      const follow = (who: "c" | "o") => ({ x: roles[who].x, y: roles[who].y + ph / 2 + 16 })
      const holder: "c" | "o" = t < 60.6 ? "c" : t < 72.6 ? "o" : t < 79.8 ? "c" : t < 84.0 ? "o" : "c"
      const switches = [60.6, 72.6, 79.8, 84.0]
      let p = 1
      let from = follow(holder)
      for (const sw of switches) {
        if (t >= sw && t < sw + 1.2) {
          const prevHolder: "c" | "o" = holder === "c" ? "o" : "c"
          from = follow(prevHolder)
          p = springStep(t - sw, { freq: 1.4, damping: 0.8 })
        }
      }
      const to = follow(holder)
      const pos = { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) }
      const appear = springStep(t - 53.6, { freq: 1.6, damping: 0.76 }) * (1 - ease.in(seg(t, 89.0, 89.4)))
      // 카메라가 확대한 동안은 칩이 화면 밖으로 밀리므로 잠시 숨긴다(확대 장면에는 휴대폰 안 강조 라벨이 상태를 보여 줌)
      const zoomFade = clamp(1 - (this.camS - 1) / 0.12)
      Object.assign(chip.style, { display: zoomFade > 0.001 ? "flex" : "none", opacity: String(zoomFade), transform: `translate(${pos.x}px,${pos.y}px) translate(-50%,0) scale(${Math.max(0, appear)})` })
      // 상태 글자: 바뀌는 순간 아래에서 올라온다
      STATUS_STEPS.forEach(([at], i) => {
        const next = STATUS_STEPS[i + 1]?.[0] ?? 999
        const inP = ease.out(seg(t, at, at + 0.35))
        const outP = ease.in(seg(t, next, next + 0.3))
        const sp = this.chip.status[i]
        sp.style.transform = `translateY(${(1 - inP) * 110 - outP * 110}%)`
        sp.style.opacity = t >= at && t < next + 0.3 ? "1" : "0"
      })
    } else hide(chip)

    // 기록 흐름 그림(넓은 화면은 왼쪽, 좁은 화면은 휴대폰 위 아래쪽 카드)
    const dg = this.diagram
    // 좁은 화면에서는 휴대폰을 가리므로 그리지 않는다(같은 흐름은 자막과 아래 ‘데이터와 분석’ 절에 있다)
    if (t >= 100.4 && t < 112.4 && this.mode === "wide") {
      const a = ease.out(seg(t, 100.4, 101.2)) * (1 - ease.in(seg(t, 111.8, 112.4)))
      const { H } = WORLD[this.mode]
      if (this.mode === "wide") Object.assign(dg.root.style, { display: "block", transform: `translate(${WORLD.wide.W / 2 - CAP_GAP + 20 - 460}px,${H / 2 - 300}px)`, opacity: String(a), width: "460px" })
      else Object.assign(dg.root.style, { display: "block", transform: `translate(${20}px,${H - 300}px)`, opacity: String(a), width: "400px" })
      dg.root.dataset.mode = this.mode
      dg.nodes.forEach((n, i) => {
        const at = 101.2 + i * 1.3
        n.classList.toggle("lit", t >= at)
        n.classList.toggle("now", t >= at && t < at + 1.3)
      })
      dg.line.style.transform = `scaleY(${clamp((t - 101.2) / (DATA_NODES.length * 1.3 - 1.3))})`
    } else hide(dg.root)

    // 마지막: Android 앱 받기(무대 안 표시는 장식. 실제 링크는 자막 카드와 페이지에 있다)
    if (t >= 113.6 && t < 119.0 && this.mode === "wide") {
      const a = springStep(t - 113.6, { freq: 1.5, damping: 0.76 }) * (1 - ease.in(seg(t, 118.4, 119.0)))
      Object.assign(this.apkPill.style, { display: "block", transform: `translate(${roles.c.x + (SW * kp) / 2 + 30}px,${roles.c.y + 60}px) scale(${Math.max(0, a)})` })
    } else hide(this.apkPill)
  }

  // ── 설명 ──
  private drawCaptions(t: number, roles: ReturnType<Story["roleAt"]>): void {
    const cta = this.cta
    if (cta) cta.style.visibility = "hidden"
    const b = this.capBox
    // 처음·끝 로고 확대 중에는 설명을 잠시 숨긴다(확대된 휴대폰과 겹치지 않게)
    const zoomFade = b.mode === "side" ? clamp(1 - (this.camS - 1.25) / 0.15) : 1
    this.capLayer.style.opacity = String(zoomFade)
    const { W } = WORLD[this.mode]
    const kp = this.phoneScale()
    CAPTIONS.forEach((c, i) => {
      const g = this.capGroups[i]
      const wrap = i === CAPTIONS.length - 1 && t < 0.6
      const local = wrap ? t + BEATS : t
      const on = local >= c.from && local < c.to + 0.6
      g.root.style.display = on ? "block" : "none"
      g.lead.style.display = "none"
      if (!on) return
      let x = b.x
      let y = b.y + 10
      if (b.mode === "side") {
        // 휴대폰의 해당 높이(at)를 화면 좌표로(카메라 포함)
        const pos = roles[roles.active]
        const wy = pos.y + (c.at - SH / 2) * kp
        const ay = this.origin.y + this.k * (this.cam.ty + this.cam.s * wy)
        const dir = c.side === "r" ? 1 : -1
        const edgeW = pos.x + dir * (SW / 2 + BEZ) * kp
        const px = this.origin.x + this.k * (this.cam.tx + this.cam.s * edgeW)
        const inner = this.origin.x + (W / 2 + dir * CAP_GAP) * this.k
        x = c.side === "r" ? inner : inner - b.w
        y = clamp(ay - 12, 24, this.vh - g.h - 24)
        const ly = clamp(ay, y + 8, y + g.h - 8)
        // 가리키는 선: 설명 쪽에서 휴대폰 가장자리까지 자란다
        const a = c.side === "r" ? px + 6 : inner + 16
        const z = c.side === "r" ? inner - 16 : px - 6
        const len = z - a
        if (len > 8) {
          const inP = ease.out(seg(local, c.from + 0.2, c.from + 0.9))
          const outP = ease.in(seg(local, c.to, c.to + 0.4))
          const sc = inP * (1 - outP)
          Object.assign(g.lead.style, { display: sc > 0.001 ? "block" : "none", width: `${len}px`, transform: `translate(${a}px,${ly}px) scaleX(${sc})` })
        }
      }
      g.root.style.transform = `translate(${x}px,${y}px)`
      const parts: [HTMLDivElement, number][] = [[g.kicker, 0], [g.title, 0.08], [g.body, 0.16]]
      for (const [m, d] of parts) {
        const inP = seg(local, c.from + d, c.from + 0.4 + d)
        const outP = seg(local, c.to + d, c.to + 0.4 + d)
        m.style.display = "block"
        m.style.transform = `translate(0px,${Number(m.dataset.y ?? 0)}px)`
        const sp = m.firstElementChild as HTMLElement
        sp.style.transform = `translateY(${(1 - ease.inOut(inP)) * 105 - ease.inOut(outP) * 105}%)`
      }
      if (cta && c.cta && t >= c.from && t < c.to) {
        const sc = springStep(t - c.from - 0.45, { freq: 1.6, damping: 0.76 }) * (1 - ease.in(seg(t, c.to - 0.35, c.to)))
        cta.style.visibility = sc > 0.05 && zoomFade > 0.5 ? "visible" : "hidden"
        cta.style.opacity = String(zoomFade)
        // 설명 글 정렬에 맞춘다(왼쪽 설명은 오른쪽 정렬, 아래 설명은 가운데)
        const cw = cta.offsetWidth
        const cx = b.mode === "above" ? x + (b.w - cw) / 2 : c.side === "l" ? x + b.w - cw : x
        cta.style.transformOrigin = b.mode === "above" ? "50% 50%" : c.side === "l" ? "100% 50%" : "0 50%"
        cta.style.transform = `translate(${cx}px,${y + g.ctaY}px) scale(${Math.max(0, sc)})`
      }
    })
  }
}
