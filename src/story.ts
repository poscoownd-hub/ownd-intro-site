// 연출 무대. 1440 × 1440 논리 좌표, 54비트.
// seek(t)는 시간과 무대 크기만으로 모든 스타일을 다시 계산한다(프레임 사이 상태 없음).
// 무대 안의 버튼·커서·시트는 장식이다. 실제 예약·결제·이동을 하지 않는다.

import { BEATS, CAPTIONS, clamp, ease, lerp, lerpRect, rect, centered, center, seg, spring, springStep, type Rect } from "./timeline"
import { irisBlades } from "./iris"
import { detectQuality, glyphGlass, gooFilter, rectGlassFilter, warmGlass, type GlassQuality, type GlyphGlass } from "./glass"

const W = 1440
const CX = 720
const CY = 720
const SVG_NS = "http://www.w3.org/2000/svg"

const PHOTOS = { field: "/assets/photos/field.jpg", climbing: "/assets/photos/climbing.jpg", clay: "/assets/photos/clay-court.jpg", pool: "/assets/photos/pool.jpg" } as const
const SCREENS = { explore: "/assets/app/explore.png", search: "/assets/app/search.png", places: "/assets/app/places.png", map: "/assets/app/places-map.png", external: "/assets/app/place-external.png", own: "/assets/app/facility-own.png" } as const
type Asset = keyof typeof PHOTOS | keyof typeof SCREENS
const SRC: Record<Asset, string> = { ...PHOTOS, ...SCREENS }
/** 자산이 처음 필요한 비트(점진 로딩·seek 대기 기준) */
const FIRST_USE: Record<Asset, number> = { field: 4, climbing: 6, clay: 6, pool: 6, explore: 6, search: 6, places: 99, map: 6, external: 6, own: 6 }

type Bleed = "field" | "clay" | "pool" | "paper"
type BleedSpec = { x: number; y: number; w: number; h: number; clip?: string }

type Spec = {
  x: number
  y: number
  w?: number
  h?: number
  r?: number | string
  sx?: number
  sy?: number
  rot?: number
  o?: number
  clip?: string
  filter?: string | null
  origin?: string
  z?: number
}

type Cam = { s: number; tx: number; ty: number }
const IDENTITY: Cam = { s: 1, tx: 0, ty: 0 }
const camApply = (c: Cam, r: Rect): Rect => ({ x: c.tx + c.s * r.x, y: c.ty + c.s * r.y, w: r.w * c.s, h: r.h * c.s })
const camInv = (c: Cam, p: { x: number; y: number }) => ({ x: (p.x - c.tx) / c.s, y: (p.y - c.ty) / c.s })
const camLerp = (a: Cam, b: Cam, p: number): Cam => {
  const s = Math.exp(lerp(Math.log(a.s), Math.log(b.s), p))
  // 줌 중에도 화면 중심 기준점이 자연스럽게 움직이도록 "고정점"을 보간
  const fa = camInv(a, { x: CX, y: CY })
  const fb = camInv(b, { x: CX, y: CY })
  const f = { x: lerp(fa.x, fb.x, p), y: lerp(fa.y, fb.y, p) }
  return { s, tx: CX - s * f.x, ty: CY - s * f.y }
}

type Glass = { root: HTMLDivElement; clone: HTMLDivElement; layers: Record<Bleed, HTMLDivElement>; body: HTMLDivElement; tint: HTMLDivElement }
type Mask = { root: HTMLDivElement; span: HTMLSpanElement }
type Chip = { root: HTMLDivElement; border: SVGRectElement; svg: SVGSVGElement; fill: HTMLDivElement; text: HTMLSpanElement; w: number }
type Seg = { root: HTMLDivElement; paint: HTMLDivElement; on: HTMLSpanElement; w: number }

function div(parent: HTMLElement, cls = "", html = ""): HTMLDivElement {
  const d = document.createElement("div")
  if (cls) d.className = cls
  if (html) d.innerHTML = html
  parent.appendChild(d)
  return d
}

function svgEl<K extends keyof SVGElementTagNameMap>(parent: Element, tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v))
  parent.appendChild(e)
  return e
}

const ICONS = {
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="#111" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>`,
  sliders: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`,
  ball: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><circle cx="12" cy="12" r="8.5"/><path d="M5 7.5c4 1.5 6 5 6.5 13M19 7.5c-4 1.5-6 5-6.5 13"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 11v5M12 8h.01"/></svg>`,
  route: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="18" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/><circle cx="18" cy="6" r="2"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8 12.5l2.7 2.7L16 9.8"/></svg>`,
  ext: `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/></svg>`,
}

const icon = (svg: string) => svg.replace("<svg ", "<svg width=\"100%\" height=\"100%\" style=\"display:block\" ")

const CURSOR_SVG = `<svg viewBox="0 0 44 56" width="44" height="56"><path d="M4 3v40l10-9 7 16 7-3-7-15h14z" fill="#111" stroke="#fff" stroke-width="3" stroke-linejoin="round"/></svg>`

export type StoryOptions = { quality?: GlassQuality; cta?: HTMLElement }

export class Story {
  readonly beats = BEATS
  private cta: HTMLElement | null
  /** 유리 필터를 쉬는 시간에 미리 만든다(재생 중 멈칫함 방지) */
  warm(): Promise<void> {
    return warmGlass(this.quality)
  }
  private stage: HTMLElement
  private quality: GlassQuality
  private bleedLayer!: HTMLDivElement
  private world!: HTMLDivElement
  private top!: HTMLDivElement
  private all: Element[] = []
  private visible = new Set<Element>()
  private vw = 1
  private vh = 1
  private k = 1
  private B: Rect = rect(0, 0, W, W)
  private imgs = new Map<Asset, HTMLImageElement[]>()
  private decoded = new Map<Asset, Promise<void>>()
  private ready: Promise<void> | null = null

  // 요소
  private bleed = {} as Record<Bleed, HTMLDivElement>
  private letters: HTMLSpanElement[] = []
  private letterW: { samples: number[]; widths: number[] }[] = []
  private wdthSupported = true
  private mark = { fs: 260, top: 0, baseline: 0, dot: 58, gap: 16, dotX: 0, total: 0 }
  private pill!: HTMLDivElement
  private pillLabel!: Mask
  private iris1!: SVGSVGElement
  private iris1Paths: SVGPathElement[] = []
  private tiles: { root: HTMLDivElement; label: Mask | null; asset: Asset }[] = []
  private search!: Glass
  private searchIcon!: HTMLDivElement
  private searchText!: HTMLDivElement
  private searchCaret!: HTMLDivElement
  private searchShot!: HTMLImageElement
  private chips: Chip[] = []
  private badge1!: HTMLDivElement
  private glyphs: { root: HTMLDivElement; clone: HTMLDivElement; layers: Record<Bleed, HTMLDivElement>; tint: HTMLDivElement; rim: HTMLImageElement; glass: GlyphGlass; cx: number; cy: number; fallback: HTMLSpanElement }[] = []
  private gooSvg!: SVGSVGElement
  private gooDots: SVGCircleElement[] = []
  private gooDrop!: SVGCircleElement
  private drop!: Glass
  private adjIcon!: HTMLDivElement
  private track!: HTMLDivElement
  private knob!: HTMLDivElement
  private value!: Mask
  private demoCtl!: HTMLDivElement
  private lens!: Glass
  private lensShot!: HTMLImageElement
  private lensStatus!: HTMLDivElement
  private bezel!: HTMLDivElement
  private island!: HTMLDivElement
  private homebar!: HTMLDivElement
  private summary!: HTMLDivElement
  private summaryText!: Mask
  private badge2!: HTMLDivElement
  private goo2Svg!: SVGSVGElement
  private goo2Island!: SVGRectElement
  private goo2Blob!: SVGRectElement
  private win!: HTMLDivElement
  private winTab!: Mask
  private winTabNew!: Mask
  private winWall!: HTMLDivElement
  private winBrowser!: HTMLDivElement
  private dragCard!: HTMLDivElement
  private dragThumb!: HTMLDivElement
  private dragText!: HTMLDivElement
  private press!: SVGSVGElement
  private pressArc!: SVGCircleElement
  private page!: HTMLDivElement
  private pg = {} as {
    hero: HTMLDivElement; frame: HTMLDivElement; mat: HTMLDivElement; info: Mask[]; tag: HTMLDivElement
    groups: { label: HTMLDivElement; segs: Seg[]; pick: number; at: number }[]
    nav1: HTMLDivElement; nav: HTMLDivElement; navText: Mask; actText: Mask; actIcon: HTMLDivElement
    sheet: HTMLDivElement; sheetText: Mask[]; header: HTMLDivElement
  }
  private flood!: HTMLDivElement
  private jIcons: HTMLDivElement[] = []
  private jLabels: Mask[] = []
  private jBar!: HTMLDivElement
  private jBarTrack!: HTMLDivElement
  private route!: SVGSVGElement
  private routePath!: SVGPathElement
  private routePin!: SVGGElement
  private routeCap!: Mask
  private checkSvg!: SVGSVGElement
  private checkCircle!: SVGCircleElement
  private checkTick!: SVGPathElement
  private jCaption!: Mask
  private wallLines!: SVGSVGElement
  private wallL!: SVGPathElement
  private wallR!: SVGPathElement
  private wallNail!: SVGCircleElement
  private frame!: HTMLDivElement
  private matInner!: HTMLDivElement
  private wallPhoto!: HTMLDivElement
  private iris2!: SVGSVGElement
  private iris2Paths: SVGPathElement[] = []
  private iris2Clip!: SVGRectElement
  private quiet: Mask[] = []
  private cursor!: HTMLDivElement

  constructor(stage: HTMLElement, opts: StoryOptions = {}) {
    this.stage = stage
    this.quality = opts.quality ?? detectQuality()
    this.cta = opts.cta ?? null
    this.stage.dataset.glass = this.quality
  }

  // ---------- 준비 ----------

  private img(parent: HTMLElement, a: Asset, cls = ""): HTMLImageElement {
    const im = document.createElement("img")
    im.alt = ""
    im.decoding = "async"
    im.draggable = false
    if (cls) im.className = cls
    im.dataset.src = SRC[a]
    parent.appendChild(im)
    const list = this.imgs.get(a) ?? []
    list.push(im)
    this.imgs.set(a, list)
    return im
  }

  /** 자산을 실제로 불러온다(처음 한 번). 같은 자산을 쓰는 복제 img도 함께 */
  load(a: Asset): Promise<void> {
    let p = this.decoded.get(a)
    if (!p) {
      const list = this.imgs.get(a) ?? []
      p = Promise.all(
        list.map((im) => {
          if (!im.src) im.src = im.dataset.src!
          return im.decode().catch(() => undefined)
        }),
      ).then(() => undefined)
      this.decoded.set(a, p)
    }
    return p
  }

  /** 나머지 자산을 순서대로 미리 불러온다 */
  async preloadRest(): Promise<void> {
    const order = (Object.keys(FIRST_USE) as Asset[]).sort((a, b) => FIRST_USE[a] - FIRST_USE[b])
    for (const a of order) await this.load(a)
  }

  async init(): Promise<void> {
    if (this.ready) return this.ready
    this.ready = (async () => {
      await Promise.all([
        document.fonts.load('800 260px "Archivo Variable"', "OWND"),
        document.fonts.load('800 220px "Pretendard Variable"', "가까운 운동"),
        document.fonts.load('700 30px "Pretendard Variable"', "내 주변 스포츠, 오운디 인천 연수구 필수 공공 민간 함께 종목 아무거나 거리 가까운 곳"),
      ]).catch(() => undefined)
      await document.fonts.ready
      this.build()
      // 한글 글꼴은 글자 범위별로 나눠 받는다. 무대에 나오는 모든 글자를 미리 받아
      // 처음 지나가는 프레임과 다시 보는 프레임이 같은 글꼴로 그려지게 한다.
      const chars = Array.from(new Set(`${this.stage.textContent ?? ""}${this.query}반경0123456789.km`)).join("")
      await Promise.all([
        document.fonts.load('700 30px "Pretendard Variable"', chars),
        document.fonts.load('600 30px "Geist Variable"', chars),
      ]).catch(() => undefined)
      await document.fonts.ready
      this.resize()
    })()
    return this.ready
  }

  private track_(e: Element): void {
    this.all.push(e)
  }

  private mkMask(parent: HTMLElement, text: string, style: string): Mask {
    const root = div(parent, "mask el")
    const span = document.createElement("span")
    span.textContent = text
    span.setAttribute("style", style)
    root.appendChild(span)
    return { root, span }
  }

  private mkGlass(parent: HTMLElement): Glass {
    const root = div(parent, "glass el")
    const clone = div(root, "g-clone")
    const layers = {} as Record<Bleed, HTMLDivElement>
    for (const b of ["field", "clay", "pool"] as const) {
      const l = div(clone, "")
      this.img(l, b)
      layers[b] = l
    }
    layers.paper = div(clone, "")
    layers.paper.style.background = "var(--canvas)"
    const tint = div(root, "g-tint")
    const body = div(root, "g-body")
    return { root, clone, layers, body, tint }
  }

  private measure(text: string, style: string): number {
    const m = document.createElement("span")
    m.setAttribute("style", `position:absolute;visibility:hidden;white-space:nowrap;left:0;top:0;${style}`)
    m.textContent = text
    this.stage.appendChild(m)
    const w = m.getBoundingClientRect().width / 1 // 무대 밖(변환 없음)에서 잰다
    m.remove()
    return w
  }

  private build(): void {
    const s = this.stage
    s.innerHTML = ""
    this.bleedLayer = div(s, "bleed-layer")
    // 화면 속 UI 요소(폰·타일·창·커서)는 영상 영역 안에서만 보이게 한다(자막 카드·재생 막대와 겹치지 않음)
    this.worldClip = div(s, "world-clip")
    this.world = div(this.worldClip, "world")
    this.top = div(s, "top-layer")

    // 전면 사진 층(무대 전체를 덮는다)
    for (const b of ["field", "clay", "pool"] as const) {
      const d = div(this.bleedLayer, "ph el")
      this.img(d, b)
      this.bleed[b] = d
      this.track_(d)
    }
    this.bleed.paper = div(this.bleedLayer, "el")
    this.bleed.paper.style.background = "var(--canvas)"
    this.track_(this.bleed.paper)

    this.buildOpen()
    this.buildBuild()
    this.buildGlass()
    this.buildStage()
    this.buildDetail()
    this.buildJourney()
    this.buildWall()

    this.cursor = div(this.world, "cursor el", CURSOR_SVG)
    this.cursor.style.zIndex = "60"
    this.press = svgEl(this.cursor, "svg", { viewBox: "0 0 120 120", width: 120, height: 120 })
    this.press.setAttribute("style", "position:absolute;left:-58px;top:-58px;overflow:visible")
    this.pressArc = svgEl(this.press, "circle", { cx: 60, cy: 60, r: 46, fill: "none", stroke: "#111", "stroke-width": 6, "stroke-linecap": "round", transform: "rotate(-90 60 60)" })
    this.track_(this.cursor)

    this.buildCaptions()

    for (const e of this.all) (e as HTMLElement).classList?.add("st-hide")
  }

  private buildOpen(): void {
    const fs = this.mark.fs
    const font = `font-family:var(--font-mark);font-weight:800;font-size:${fs}px;line-height:${fs}px;`
    this.wdthSupported = CSS.supports("font-variation-settings", '"wdth" 100')
    const samples = [62, 75, 87.5, 100, 112.5, 125]
    for (const ch of "OWND") {
      const widths = samples.map((v) => this.measure(ch, `${font}font-variation-settings:"wdth" ${this.wdthSupported ? v : 100}, "wght" 800;`))
      this.letterW.push({ samples, widths })
    }
    // 기준선: 캔버스 글꼴 지표로 계산(line-height = 글자 크기)
    const c = document.createElement("canvas").getContext("2d")!
    c.font = `800 ${fs}px "Archivo Variable"`
    const mt = c.measureText("O")
    const asc = mt.fontBoundingBoxAscent || fs * 0.88
    const desc = mt.fontBoundingBoxDescent || fs * 0.21
    const cap = mt.actualBoundingBoxAscent || fs * 0.72
    const baselineFromTop = (fs - (asc + desc)) / 2 + asc
    const baseline = CY + cap / 2
    const wide = this.letterW.reduce((a, l) => a + l.widths[l.widths.length - 1], 0)
    const total = wide + this.mark.gap + this.mark.dot
    this.mark = { ...this.mark, top: baseline - baselineFromTop, baseline, total, dotX: CX - total / 2 + wide + this.mark.gap }
    for (const ch of "OWND") {
      const sp = document.createElement("span")
      sp.className = "el"
      sp.textContent = ch
      sp.setAttribute("style", `${font}color:#111;white-space:nowrap;`)
      this.world.appendChild(sp)
      this.letters.push(sp)
      this.track_(sp)
    }

    // 점 → 알약(같은 요소)
    this.pill = div(this.world, "el")
    this.pill.style.background = "#111"
    this.pill.style.overflow = "hidden"
    this.pill.style.zIndex = "6"
    this.pillLabel = this.mkMask(this.pill, "내 주변 스포츠, 오운디", "font-family:var(--font-ko);font-weight:700;font-size:64px;line-height:90px;color:#fff;white-space:nowrap;text-align:center")
    this.pillLabel.root.style.position = "absolute"
    this.track_(this.pill)

    // 조리개 1
    this.iris1 = svgEl(this.world, "svg", { width: W, height: W, viewBox: `0 0 ${W} ${W}` })
    this.iris1.classList.add("el")
    this.iris1.style.zIndex = "8"
    this.iris1.style.overflow = "visible"
    for (let i = 0; i < 6; i++) this.iris1Paths.push(svgEl(this.iris1, "path", { fill: i % 2 ? "#161616" : "#1d1d1d", stroke: "#3a3a3a", "stroke-width": 2, "stroke-linejoin": "round" }))
    this.track_(this.iris1)

    // 3×3 격자 → 벤토
    const grid: [Asset, string | null][] = [
      ["explore", null], ["pool", "공공 체육시설"], ["map", "위치와 이동"],
      ["climbing", "민간 스포츠시설"], ["field", "종목별 탐색"], ["clay", null],
      ["search", null], ["external", "예약 경로"], ["own", "시설 정보"],
    ]
    grid.forEach(([a, label], i) => {
      const isScreen = a in SCREENS
      const root = div(this.world, `ph el${isScreen ? " screen" : ""}`)
      this.img(root, a)
      if (isScreen) root.style.background = "#fff"
      let m: Mask | null = null
      if (label) {
        m = this.mkMask(root, label, "font-family:var(--font-ko);font-weight:700;font-size:30px;line-height:58px;padding:0 24px;color:#fff;background:#111;border-radius:29px;white-space:nowrap")
        m.root.style.position = "absolute"
        m.root.style.borderRadius = "29px"
      }
      this.tiles.push({ root, label: m, asset: a })
      this.track_(root)
      void i
    })
  }

  private buildBuild(): void {
    this.search = this.mkGlass(this.world)
    this.search.root.style.zIndex = "12"
    this.searchShot = this.img(this.search.body, "search")
    this.searchShot.setAttribute("style", "position:absolute;left:0;top:0;width:100%;height:100%;object-fit:cover;object-position:top center;background:#fff")
    this.track_(this.search.root)
    this.searchIcon = div(this.world, "el", icon(ICONS.search))
    this.searchIcon.style.zIndex = "13"
    this.track_(this.searchIcon)
    this.searchText = div(this.world, "el")
    this.searchText.setAttribute("style", "z-index:13;font-family:var(--font-ko);font-weight:600;font-size:46px;line-height:60px;color:#111;white-space:nowrap")
    this.track_(this.searchText)
    this.searchCaret = div(this.world, "el")
    this.searchCaret.setAttribute("style", "z-index:13;background:#111;border-radius:2px")
    this.track_(this.searchCaret)
    for (let n = 0; n <= this.query.length; n++) this.measureCached(this.query.slice(0, n))

    const chipStyle = "font-family:var(--font-ko);font-weight:650;font-size:30px;"
    for (const label of ["인천 연수구 · 필수", "공공·민간 함께", "종목 · 아무거나", "거리 · 가까운 곳"]) {
      const w = Math.ceil(this.measure(label, chipStyle)) + 64
      const root = div(this.world, "el")
      root.style.zIndex = "12"
      const svg = svgEl(root, "svg", { width: w, height: 76, viewBox: `0 0 ${w} 76` })
      svg.setAttribute("style", "position:absolute;left:0;top:0;overflow:visible")
      const border = svgEl(svg, "rect", { x: 1.5, y: 1.5, width: w - 3, height: 73, rx: 36.5, fill: "none", stroke: "#fff", "stroke-width": 3 })
      const fill = div(root, "")
      fill.setAttribute("style", "position:absolute;inset:0;background:#111;border-radius:38px;transform-origin:0 50%")
      const text = document.createElement("span")
      text.textContent = label
      text.setAttribute("style", `${chipStyle}position:absolute;left:32px;top:0;line-height:76px;color:#fff;white-space:nowrap`)
      root.appendChild(text)
      this.chips.push({ root, border, svg, fill, text, w })
      this.track_(root)
    }
    this.badge1 = div(this.world, "el", "시연 화면")
    this.badge1.setAttribute("style", "z-index:14;font-family:var(--font-ko);font-weight:700;font-size:24px;line-height:44px;padding:0 16px;border-radius:8px;background:#E7F3F8;color:#245F80;white-space:nowrap")
    this.track_(this.badge1)
  }

  private buildGlass(): void {
    const word = ["가", "까", "운", "운", "동"]
    const size = 300
    const font = `800 220px "Pretendard Variable"`
    // 글자 위치: "가까운 운동"(공백 하나)
    const adv = 212
    const space = 70
    const totalW = adv * 5 + space
    let x = CX - totalW / 2 + adv / 2
    word.forEach((ch, i) => {
      const gg = glyphGlass(ch, font, size, this.quality === "off" ? "off" : this.quality, i)
      const root = div(this.world, "el")
      root.style.zIndex = "12"
      root.style.width = `${size}px`
      root.style.height = `${size}px`
      const maskCss = `-webkit-mask-image:url(${gg.mask});mask-image:url(${gg.mask});-webkit-mask-size:100% 100%;mask-size:100% 100%;`
      const holder = div(root, "")
      holder.setAttribute("style", `position:absolute;inset:0;${maskCss}`)
      const clone = div(holder, "")
      clone.setAttribute("style", "position:absolute;left:0;top:0;width:1440px;height:1440px;transform-origin:0 0")
      const layers = {} as Record<Bleed, HTMLDivElement>
      for (const b of ["field", "clay", "pool"] as const) {
        const l = div(clone, "")
        l.style.position = "absolute"
        l.style.overflow = "hidden"
        const im = this.img(l, b)
        im.setAttribute("style", "position:absolute;width:100%;height:100%;object-fit:cover")
        layers[b] = l
      }
      layers.paper = div(clone, "")
      if (gg.filter) clone.style.filter = gg.filter
      const tint = div(root, "")
      tint.setAttribute("style", `position:absolute;inset:0;background:rgba(255,255,255,${this.quality === "off" ? 0.42 : 0.22});${maskCss}`)
      const rim = document.createElement("img")
      rim.src = gg.rim
      rim.alt = ""
      rim.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%")
      root.appendChild(rim)
      const fallback = document.createElement("span")
      fallback.textContent = ""
      root.appendChild(fallback)
      this.glyphs.push({ root, clone, layers, tint, rim, glass: gg, cx: x, cy: 600, fallback })
      this.track_(root)
      x += adv + (i === 2 ? space : 0)
    })

    // 녹아 합쳐지는 물방울(goo)
    const goo = gooFilter("goo-milk", 16)
    this.gooSvg = svgEl(this.world, "svg", { width: W, height: W, viewBox: `0 0 ${W} ${W}` })
    this.gooSvg.classList.add("el")
    this.gooSvg.style.zIndex = "13"
    const g = svgEl(this.gooSvg, "g")
    g.setAttribute("style", `filter:${goo}`)
    g.setAttribute("fill", "#fff")
    for (let i = 0; i < 5; i++) this.gooDots.push(svgEl(g, "circle", { cx: 0, cy: 0, r: 0 }))
    this.gooDrop = svgEl(g, "circle", { cx: CX, cy: 600, r: 0 })
    this.track_(this.gooSvg)

    this.drop = this.mkGlass(this.world)
    this.drop.root.style.zIndex = "12"
    this.track_(this.drop.root)
    this.adjIcon = div(this.world, "el", icon(ICONS.sliders))
    this.adjIcon.style.zIndex = "13"
    this.track_(this.adjIcon)
    this.track = div(this.world, "el")
    this.track.setAttribute("style", "z-index:13;background:rgba(255,255,255,0.9);border-radius:5px")
    this.track_(this.track)
    this.knob = div(this.world, "el")
    this.knob.setAttribute("style", "z-index:14;background:#fff;border-radius:50%;box-shadow:inset 0 0 0 3px #111")
    this.track_(this.knob)
    this.value = this.mkMask(this.world, "1.0km", "font-family:var(--font-ui);font-weight:600;font-size:34px;line-height:50px;color:#fff;white-space:nowrap")
    this.value.root.style.zIndex = "13"
    this.track_(this.value.root)
    this.demoCtl = div(this.world, "el", "시연 컨트롤 · 실제 기능 아님")
    this.demoCtl.setAttribute("style", "z-index:13;font-family:var(--font-ko);font-weight:650;font-size:24px;line-height:46px;padding:0 18px;border-radius:23px;background:#111;color:#fff;white-space:nowrap")
    this.track_(this.demoCtl)

    this.lens = this.mkGlass(this.world)
    this.lens.root.style.zIndex = "16"
    this.lensStatus = div(this.lens.body, "")
    this.lensStatus.setAttribute("style", "position:absolute;left:0;top:0;width:100%;background:#fff")
    const clock = div(this.lensStatus, "", "9:41")
    clock.setAttribute("style", "position:absolute;left:34px;top:10px;font-family:var(--font-ui);font-weight:650;font-size:22px;line-height:26px;color:#111")
    this.lensShot = this.img(this.lens.body, "external")
    this.lensShot.setAttribute("style", "position:absolute;left:0;width:100%;object-fit:cover;object-position:top center;background:#fff")
    this.track_(this.lens.root)
  }

  private buildStage(): void {
    this.bezel = div(this.world, "el")
    this.bezel.style.background = "#111"
    this.bezel.style.zIndex = "15"
    this.track_(this.bezel)
    this.island = div(this.world, "el")
    this.island.setAttribute("style", "z-index:17;background:#111")
    this.track_(this.island)
    this.homebar = div(this.world, "el")
    this.homebar.setAttribute("style", "z-index:17;background:#111")
    this.track_(this.homebar)
    this.summary = div(this.world, "el")
    this.summary.setAttribute("style", "z-index:17;background:#111;overflow:hidden")
    const thumb = div(this.summary, "")
    thumb.setAttribute("style", "position:absolute;left:14px;top:14px;width:68px;height:68px;border-radius:14px;overflow:hidden")
    const ti = this.img(thumb, "clay")
    ti.setAttribute("style", "width:100%;height:100%;object-fit:cover")
    this.summaryText = this.mkMask(this.summary, "가상 연수 테니스장", "font-family:var(--font-ko);font-weight:700;font-size:26px;line-height:34px;color:#fff;white-space:nowrap")
    this.summaryText.root.style.position = "absolute"
    const sub = div(this.summary, "", "공공 · 기관 사이트에서 예약")
    sub.setAttribute("style", "position:absolute;left:100px;top:52px;font-family:var(--font-ko);font-size:19px;line-height:26px;color:rgba(255,255,255,0.7);white-space:nowrap")
    this.track_(this.summary)
    this.badge2 = div(this.world, "el", "시연 화면")
    this.badge2.setAttribute("style", "z-index:18;font-family:var(--font-ko);font-weight:700;font-size:22px;line-height:40px;padding:0 14px;border-radius:8px;background:#E7F3F8;color:#245F80;white-space:nowrap")
    this.track_(this.badge2)

    // 다이내믹 아일랜드가 늘어나 끊어지는 goo(검정)
    const goo = gooFilter("goo-ink", 12)
    this.goo2Svg = svgEl(this.world, "svg", { width: 2400, height: 1600, viewBox: "0 0 2400 1600" })
    this.goo2Svg.classList.add("el")
    this.goo2Svg.style.zIndex = "17"
    this.goo2Svg.style.overflow = "visible"
    const g = svgEl(this.goo2Svg, "g")
    g.setAttribute("style", `filter:${goo}`)
    this.goo2Island = svgEl(g, "rect", { fill: "#111" })
    this.goo2Blob = svgEl(g, "rect", { fill: "#111" })
    this.track_(this.goo2Svg)

    // 데스크톱 창
    this.win = div(this.world, "el")
    this.win.setAttribute("style", "z-index:18;background:#111;overflow:hidden")
    const dots = div(this.win, "", `<i></i><i></i><i></i>`)
    dots.setAttribute("style", "position:absolute;left:22px;top:24px;display:flex;gap:10px")
    dots.querySelectorAll("i").forEach((i) => i.setAttribute("style", "display:block;width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,0.35)"))
    const tab = div(this.win, "")
    tab.setAttribute("style", "position:absolute;left:110px;top:12px;height:40px;width:420px;border-radius:10px;background:rgba(255,255,255,0.12)")
    this.winTab = this.mkMask(tab, "새 탭", "font-family:var(--font-ko);font-size:20px;line-height:40px;color:rgba(255,255,255,0.85);padding-left:16px;white-space:nowrap")
    this.winTab.root.style.position = "absolute"
    this.winTabNew = this.mkMask(tab, "가상 연수 테니스장 · OWND", "font-family:var(--font-ko);font-size:20px;line-height:40px;color:#fff;padding-left:16px;white-space:nowrap")
    this.winTabNew.root.style.position = "absolute"
    this.winBrowser = div(this.win, "")
    this.winBrowser.setAttribute("style", "position:absolute;left:0;top:64px;right:0;bottom:0;background:var(--paper);overflow:hidden")
    for (let i = 0; i < 4; i++) {
      const b = div(this.winBrowser, "")
      b.setAttribute("style", `position:absolute;left:40px;top:${60 + i * 54}px;height:22px;width:${[520, 380, 460, 300][i]}px;border-radius:11px;background:rgba(17,17,17,0.08)`)
    }
    this.winWall = div(this.win, "")
    this.winWall.setAttribute("style", "position:absolute;left:0;top:64px;right:0;bottom:0;overflow:hidden")
    const wi = this.img(this.winWall, "pool")
    wi.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;object-fit:cover")
    const slats = div(this.winWall, "")
    slats.setAttribute("style", "position:absolute;inset:0;background:repeating-linear-gradient(to bottom, transparent 0 58px, rgba(17,17,17,0.55) 58px 62px)")
    this.track_(this.win)

    this.dragCard = div(this.world, "el")
    this.dragCard.setAttribute("style", "z-index:24;background:#111;overflow:hidden")
    this.dragThumb = div(this.dragCard, "")
    this.dragThumb.setAttribute("style", "position:absolute;overflow:hidden")
    const dti = this.img(this.dragThumb, "clay")
    dti.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;object-fit:cover")
    this.dragText = div(this.dragCard, "", "가상 연수 테니스장")
    this.dragText.setAttribute("style", "position:absolute;left:100px;top:0;line-height:96px;font-family:var(--font-ko);font-weight:700;font-size:26px;color:#fff;white-space:nowrap;transform-origin:0 50%")
    this.track_(this.dragCard)
  }

  private mkSeg(parent: HTMLElement, label: string): Seg {
    const style = "font-family:var(--font-ko);font-weight:600;font-size:17px;"
    const w = Math.ceil(this.measure(label, style)) + 32
    const root = div(parent, "")
    root.setAttribute("style", `position:absolute;height:40px;width:${w}px;border-radius:20px;border:1.5px solid rgba(17,17,17,0.22);overflow:hidden`)
    const off = document.createElement("span")
    off.textContent = label
    off.setAttribute("style", `${style}position:absolute;left:14.5px;top:0;line-height:37px;color:#111;white-space:nowrap`)
    root.appendChild(off)
    const paint = div(root, "")
    paint.setAttribute("style", "position:absolute;inset:-2px;background:#111;overflow:hidden")
    const on = document.createElement("span")
    on.textContent = label
    on.setAttribute("style", `${style}position:absolute;left:16.5px;top:2px;line-height:37px;color:#fff;white-space:nowrap`)
    paint.appendChild(on)
    return { root, paint, on, w }
  }

  private buildDetail(): void {
    this.page = div(this.world, "el")
    this.page.setAttribute("style", "z-index:20;background:var(--paper);overflow:hidden")
    const p = this.page
    const header = div(p, "")
    header.setAttribute("style", "position:absolute;left:0;top:0;right:0;height:56px;border-bottom:1px solid rgba(17,17,17,0.1)")
    const wm = div(header, "", "OWND")
    wm.setAttribute("style", "position:absolute;left:24px;top:12px;font-family:var(--font-mark);font-weight:800;font-variation-settings:'wdth' 125;font-size:24px;line-height:32px;color:#111")
    const nav1 = div(header, "", "시설 정보")
    nav1.setAttribute("style", "position:absolute;right:146px;top:12px;height:32px;line-height:29px;padding:0 14px;border:1.5px solid rgba(17,17,17,0.22);border-radius:16px;font-family:var(--font-ko);font-size:15px;color:#111;white-space:nowrap")
    const frame = div(p, "")
    frame.setAttribute("style", "position:absolute;background:#111")
    const mat = div(p, "")
    mat.setAttribute("style", "position:absolute;background:#fff")
    const hero = div(p, "")
    hero.setAttribute("style", "position:absolute;overflow:hidden")
    const hi = this.img(hero, "clay")
    hi.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;object-fit:cover")
    const info = [
      this.mkMask(p, "가상 연수 테니스장", "font-family:var(--font-ko);font-weight:800;font-size:32px;line-height:42px;color:#111;white-space:nowrap"),
      this.mkMask(p, "인천 연수구 · 테니스 · 공공", "font-family:var(--font-ko);font-weight:500;font-size:18px;line-height:28px;color:#3d3b37;white-space:nowrap"),
      this.mkMask(p, "출처 공유누리(행정안전부) · 확인 시각 표시", "font-family:var(--font-ko);font-size:15px;line-height:24px;color:#6b6862;white-space:nowrap"),
      this.mkMask(p, "‘사용 가능’ 표시는 실시간 빈자리가 아니에요", "font-family:var(--font-ko);font-size:15px;line-height:24px;color:#6b6862;white-space:nowrap"),
    ]
    info.forEach((m) => (m.root.style.position = "absolute"))
    const tag = div(p, "", "시연 데이터")
    tag.setAttribute("style", "position:absolute;font-family:var(--font-ko);font-weight:700;font-size:14px;line-height:28px;padding:0 10px;border-radius:5px;background:#E7F3F8;color:#245F80;white-space:nowrap;transform-origin:0 50%")
    const groupsDef: [string, string[], number, number][] = [
      ["종목", ["테니스", "탁구", "수영"], 0, 36.3],
      ["위치", ["연수구", "송도"], 0, 36.95],
      ["유형", ["공공", "민간"], 0, 37.6],
    ]
    const groups = groupsDef.map(([label, opts, pick, at]) => {
      const l = div(p, "", label)
      l.setAttribute("style", "position:absolute;font-family:var(--font-ko);font-weight:600;font-size:14px;line-height:20px;color:#6b6862")
      const segs = opts.map((o) => this.mkSeg(p, o))
      return { label: l, segs, pick, at }
    })
    const nav = div(p, "")
    nav.setAttribute("style", "position:absolute;background:#111;overflow:hidden")
    const navText = this.mkMask(nav, "예약 안내", "font-family:var(--font-ko);font-weight:600;font-size:15px;line-height:32px;color:#fff;white-space:nowrap;text-align:center")
    navText.root.style.position = "absolute"
    const actText = this.mkMask(nav, "공식 예약 페이지 확인", "font-family:var(--font-ko);font-weight:700;font-size:19px;line-height:56px;color:#fff;white-space:nowrap")
    actText.root.style.position = "absolute"
    const actIcon = div(nav, "", icon(ICONS.ext))
    actIcon.setAttribute("style", "position:absolute;width:22px;height:22px;transform-origin:50% 50%")
    const sheet = div(p, "")
    sheet.setAttribute("style", "position:absolute;background:#111;border-radius:22px 22px 0 0;overflow:hidden")
    const sheetText = [
      this.mkMask(sheet, "잠깐, 아직 예약 전이에요", "font-family:var(--font-ko);font-weight:800;font-size:26px;line-height:38px;color:#fff;white-space:nowrap"),
      this.mkMask(sheet, "기관 사이트로 이동해도 예약이 끝난 건 아니에요.", "font-family:var(--font-ko);font-size:18px;line-height:28px;color:rgba(255,255,255,0.8);white-space:nowrap"),
      this.mkMask(sheet, "예약은 기관 사이트에서 마무리해 주세요.", "font-family:var(--font-ko);font-size:18px;line-height:28px;color:rgba(255,255,255,0.8);white-space:nowrap"),
    ]
    sheetText.forEach((m, i) => {
      m.root.style.position = "absolute"
      m.root.style.left = "32px"
      m.root.style.top = `${30 + i * 40 + (i > 0 ? 8 : 0)}px`
    })
    this.pg = { hero, frame, mat, info, tag, groups, nav1, nav, navText, actText, actIcon, sheet, sheetText, header }
    this.track_(this.page)
  }

  private buildJourney(): void {
    this.flood = div(this.top, "el")
    this.flood.setAttribute("style", "background:#111;z-index:30")
    this.track_(this.flood)
    const icons = [ICONS.pin, ICONS.ball, ICONS.info, ICONS.route, ICONS.check]
    const labels = ["지역 선택", "종목 선택", "시설 정보 확인", "예약 경로 확인", "운동 준비"]
    icons.forEach((svg) => {
      const d = div(this.top, "el", icon(svg))
      d.style.zIndex = "31"
      d.style.transformOrigin = "50% 50%"
      this.jIcons.push(d)
      this.track_(d)
    })
    labels.forEach((l) => {
      const m = this.mkMask(this.top, l, "font-family:var(--font-ko);font-weight:750;font-size:56px;line-height:80px;color:#fff;white-space:nowrap")
      m.root.style.zIndex = "31"
      this.jLabels.push(m)
      this.track_(m.root)
    })
    this.jBarTrack = div(this.top, "el")
    this.jBarTrack.setAttribute("style", "z-index:31;background:rgba(255,255,255,0.22);border-radius:3px")
    this.track_(this.jBarTrack)
    this.jBar = div(this.top, "el")
    this.jBar.setAttribute("style", "z-index:32;background:#fff;border-radius:3px")
    this.track_(this.jBar)

    this.route = svgEl(this.top, "svg", { width: W, height: W, viewBox: `0 0 ${W} ${W}` })
    this.route.classList.add("el")
    this.route.style.zIndex = "31"
    const grid = svgEl(this.route, "path", { d: "", stroke: "rgba(255,255,255,0.1)", "stroke-width": 2, fill: "none" })
    let gd = ""
    for (let i = 0; i <= 6; i++) gd += `M${360 + i * 120} 560V860M360 ${560 + i * 50}H1080`
    grid.setAttribute("d", gd)
    svgEl(this.route, "circle", { cx: 400, cy: 820, r: 14, fill: "#fff" })
    this.routePath = svgEl(this.route, "path", { d: "M400 820 C520 820 560 700 700 700 S900 640 1000 610", stroke: "#fff", "stroke-width": 7, fill: "none", "stroke-linecap": "round", "stroke-dasharray": "2 18" })
    this.routePin = svgEl(this.route, "g", {})
    this.routePin.innerHTML = `<path d="M1000 610c-22 0-38 16-38 36 0 28 38 60 38 60s38-32 38-60c0-20-16-36-38-36z" transform="translate(0 -96)" fill="#fff"/><circle cx="1000" cy="550" r="13" fill="#111"/>`
    this.routeCap = this.mkMask(this.top, "위치 탐색 시연 — 실제 지도 연동 준비 중", "font-family:var(--font-ko);font-weight:600;font-size:24px;line-height:34px;color:rgba(255,255,255,0.75);white-space:nowrap")
    this.routeCap.root.style.zIndex = "31"
    this.track_(this.route)
    this.track_(this.routeCap.root)

    this.checkSvg = svgEl(this.top, "svg", { width: 220, height: 220, viewBox: "0 0 220 220" })
    this.checkSvg.classList.add("el")
    this.checkSvg.style.zIndex = "31"
    this.checkCircle = svgEl(this.checkSvg, "circle", { cx: 110, cy: 110, r: 96, fill: "none", stroke: "#fff", "stroke-width": 10, "stroke-linecap": "round", transform: "rotate(-90 110 110)" })
    this.checkTick = svgEl(this.checkSvg, "path", { d: "M68 114l30 30 56-62", fill: "none", stroke: "#fff", "stroke-width": 12, "stroke-linecap": "round", "stroke-linejoin": "round" })
    this.track_(this.checkSvg)
    this.jCaption = this.mkMask(this.top, "공식 사이트에서 예약 진행", "font-family:var(--font-ko);font-weight:700;font-size:40px;line-height:58px;color:#fff;white-space:nowrap")
    this.jCaption.root.style.zIndex = "31"
    this.track_(this.jCaption.root)
  }

  private buildWall(): void {
    this.wallLines = svgEl(this.top, "svg", { width: W, height: W, viewBox: `0 0 ${W} ${W}` })
    this.wallLines.classList.add("el")
    this.wallLines.style.zIndex = "33"
    this.wallL = svgEl(this.wallLines, "path", { stroke: "#111", "stroke-width": 2.5, fill: "none" })
    this.wallR = svgEl(this.wallLines, "path", { stroke: "#111", "stroke-width": 2.5, fill: "none" })
    this.wallNail = svgEl(this.wallLines, "circle", { cx: CX, cy: 250, r: 0, fill: "#111" })
    this.track_(this.wallLines)
    this.frame = div(this.top, "el")
    this.frame.setAttribute("style", "z-index:34;background:#111")
    this.track_(this.frame)
    this.matInner = div(this.top, "el")
    this.matInner.setAttribute("style", "z-index:35;background:#fbfaf7")
    this.track_(this.matInner)
    this.wallPhoto = div(this.top, "ph el")
    this.wallPhoto.style.zIndex = "36"
    this.img(this.wallPhoto, "climbing")
    this.track_(this.wallPhoto)
    this.iris2 = svgEl(this.top, "svg", { width: W, height: W, viewBox: `0 0 ${W} ${W}` })
    this.iris2.classList.add("el")
    this.iris2.style.zIndex = "37"
    const defs = svgEl(this.iris2, "defs")
    const cp = svgEl(defs, "clipPath", { id: "iris2clip" })
    this.iris2Clip = svgEl(cp, "rect", {})
    const g = svgEl(this.iris2, "g", { "clip-path": "url(#iris2clip)" })
    for (let i = 0; i < 6; i++) this.iris2Paths.push(svgEl(g, "path", { fill: i % 2 ? "#161616" : "#1d1d1d", stroke: "#3a3a3a", "stroke-width": 2, "stroke-linejoin": "round" }))
    this.track_(this.iris2)
    for (const line of ["찾는 시간은 짧게,", "운동하는 시간은 길게."]) {
      const m = this.mkMask(this.top, line, "font-family:var(--font-ko);font-weight:800;font-size:66px;line-height:88px;color:#111;white-space:nowrap;letter-spacing:-1px")
      m.root.style.zIndex = "33"
      this.quiet.push(m)
      this.track_(m.root)
    }
  }

  // ---------- 크기 ----------

  /** 무대 크기가 바뀌면 다시 계산. 같은 크기·같은 t → 같은 결과 */
  resize(): void {
    const r = this.stage.getBoundingClientRect()
    this.vw = Math.max(1, r.width)
    this.vh = Math.max(1, r.height)
    const vw = this.vw
    const vh = this.vh
    const ctl = this.ctlH
    let size: number
    let ox: number
    let oy: number
    // 가로 화면: 왼쪽에 자막 카드, 오른쪽에 영상. 세로 화면: 위에 영상, 아래에 자막 카드.
    const landscape = vw >= 900 && vw >= vh * 1.1
    if (landscape) {
      const capW = clamp(vw * 0.34, 340, 540)
      const aw = vw - capW - 24
      const ah = vh - ctl
      size = Math.min(aw, ah)
      ox = capW + (aw - size) / 2
      oy = (ah - size) / 2
      this.capBox = { mode: "side", x: 40, y: 0, w: capW - 64, h: ah }
      this.clipBase = rect(capW - 8, 0, vw - capW + 8, ah)
    } else {
      const capH = clamp(vh * 0.27, 180, 270)
      const ah = vh - ctl - capH
      size = Math.min(vw, ah)
      ox = (vw - size) / 2
      oy = (ah - size) / 2
      this.capBox = { mode: "below", x: 16, y: ah, w: vw - 32, h: capH }
      this.clipBase = rect(0, 0, vw, ah)
    }
    this.k = size / W
    this.layoutCaptions()
    this.B = rect(-ox / this.k, -oy / this.k, this.vw / this.k, this.vh / this.k)
    const base = `translate(${ox}px,${oy}px) scale(${this.k})`
    this.bleedLayer.style.transform = base
    this.top.style.transform = base
    this.baseT = { ox, oy }
  }
  private baseT = { ox: 0, oy: 0 }
  /** 하단 재생 막대 높이(무대 위에 겹쳐 놓임) */
  private readonly ctlH = 76
  private capBox = { mode: "side" as "side" | "below", x: 0, y: 0, w: 0, h: 0 }
  private capLayer!: HTMLDivElement
  private capCard!: HTMLDivElement
  private capGroups: { kicker: Mask; title: Mask; body: Mask; tag: HTMLDivElement | null; h: number; ctaY: number }[] = []
  private capCardH = 0

  private buildCaptions(): void {
    this.capLayer = div(this.stage, "cap-layer")
    this.capCard = div(this.capLayer, "el cap-card")
    this.track_(this.capCard)
    for (const c of CAPTIONS) {
      const kicker = this.mkMask(this.capCard, c.kicker, "")
      kicker.root.classList.add("cap-kicker")
      const title = this.mkMask(this.capCard, c.title, "")
      title.root.classList.add("cap-title")
      const body = this.mkMask(this.capCard, c.body, "")
      body.root.classList.add("cap-body")
      let tag: HTMLDivElement | null = null
      if (c.tag) {
        tag = div(this.capCard, `cap-tag cap-tag-${c.tag}`, c.tagText ?? "")
      }
      this.capGroups.push({ kicker, title, body, tag, h: 0, ctaY: 0 })
    }
  }

  /** 자막 카드 크기: 가장 긴 자막이 들어가는 높이로 고정(장면마다 카드가 출렁이지 않게) */
  private layoutCaptions(): void {
    const b = this.capBox
    this.capLayer.dataset.mode = b.mode
    this.capCard.style.width = `${b.w}px`
    const pad = b.mode === "side" ? 32 : 20
    let maxH = 0
    for (const g of this.capGroups) {
      let y = pad
      for (const m of [g.kicker, g.title, g.body]) {
        m.root.style.width = `${b.w - pad * 2}px`
        m.root.dataset.y = String(y)
        y += m.root.offsetHeight + (m === g.kicker ? 8 : 12)
      }
      if (g.tag) {
        g.tag.dataset.y = String(y + 2)
        y += g.tag.offsetHeight + 4
      }
      if (CAPTIONS[this.capGroups.indexOf(g)].cta && this.cta) {
        g.ctaY = y + 6
        y += this.cta.offsetHeight + 10
      }
      g.h = y + pad - 12
      maxH = Math.max(maxH, g.h)
    }
    this.capCardH = Math.min(maxH, b.h - 16)
  }

  /** 영상 안 자막: 장면에 맞춰 글자가 마스크에서 올라오고 빠진다 */
  private sceneCaptions(t: number): void {
    const cta = this.cta
    if (cta) cta.style.visibility = "hidden"
    // 자막 카드가 보이는 두 구간: 본편(1.6–48.2), 끝 장면(50.3–52.5)
    const win = t >= 1.6 && t < 48.2 ? [1.6, 48.2] : t >= 50.3 && t < 52.5 ? [50.3, 52.5] : null
    if (!win) return
    const b = this.capBox
    const appear = ease.out(seg(t, win[0], win[0] + 0.5))
    const vanish = ease.in(seg(t, win[1] - 0.35, win[1]))
    // 카드 높이는 자막에 맞춰 모양을 바꾼다(앞 자막 높이 → 지금 자막 높이)
    const cap = (i: number) => Math.min(this.capGroups[i].h, b.h - 16)
    const idx = Math.max(0, CAPTIONS.findIndex((c) => t >= c.from - 0.01 && t < c.to))
    const joined = idx > 0 && CAPTIONS[idx - 1].to === CAPTIONS[idx].from
    const H = joined ? lerp(cap(idx - 1), cap(idx), ease.inOut(seg(t, CAPTIONS[idx].from, CAPTIONS[idx].from + 0.45))) : cap(idx)
    const h = H * appear * (1 - vanish)
    const y0 = b.mode === "side" ? b.y + (b.h - H) / 2 : b.y + 4
    const cardY = y0 + (H - h)
    // 처음엔 아래 가장자리에서 위로 자라나고, 끝에서 다시 접힌다
    this.put(this.capCard, { x: b.x, y: cardY, w: b.w, h, r: b.mode === "side" ? 22 : 18 })
    const pad = b.mode === "side" ? 32 : 20
    const c = CAPTIONS[idx]
    if (cta && c.cta && t >= c.from) {
      // 실제 링크(무대 밖 요소). 카드 안 자리에 놓고 스프링으로 튀어나온다
      const sc = springStep(t - c.from - 0.45, { freq: 1.6, damping: 0.76 }) * (1 - ease.in(seg(t, c.to - 0.35, c.to)))
      cta.style.visibility = sc > 0.05 ? "visible" : "hidden"
      cta.style.transform = `translate(${b.x + pad}px,${cardY + this.capGroups[idx].ctaY}px) scale(${Math.max(0, sc)})`
    }
    CAPTIONS.forEach((c, i) => {
      const g = this.capGroups[i]
      const next = CAPTIONS[i + 1]
      const rollOut = !!next && next.from === c.to // 다음 자막과 이어짐
      const on = t >= c.from - 0.01 && t < c.to + (rollOut ? 0.6 : 0)
      const parts: [Mask | HTMLDivElement | null, number][] = [[g.kicker, 0], [g.title, 0.08], [g.body, 0.16], [g.tag, 0.24]]
      for (const [m, d] of parts) {
        if (!m) continue
        const el = "span" in m ? m.root : m
        if (!on) {
          el.style.display = "none"
          continue
        }
        el.style.display = "block"
        const first = i === 0 || CAPTIONS[i - 1].to !== c.from
        const inP = first ? seg(t, c.from + 0.4 + d, c.from + 0.9 + d) : seg(t, c.from + d, c.from + 0.4 + d)
        const outP = rollOut ? seg(t, c.to + d, c.to + 0.4 + d) : seg(t, c.to - 0.35, c.to)
        const yy = Number(el.dataset.y ?? 0) // 카드 안 좌표
        if ("span" in m) {
          Object.assign(m.root.style, { left: "0", top: "0", transform: `translate(${pad}px,${yy}px)` })
          const off = (1 - ease.inOut(clamp(inP))) * 105 - ease.inOut(clamp(outP)) * 105
          m.span.style.transform = `translateY(${off}%)`
        } else {
          const tagOut = rollOut ? ease.inOut(seg(t, c.to, c.to + 0.2)) : ease.in(clamp(outP))
          const sc = springStep(t - c.from - (first ? 0.64 : 0.25), { freq: 1.8, damping: 0.76 }) * (1 - tagOut)
          Object.assign(m.style, { left: "0", top: "0", transform: `translate(${pad}px,${yy}px) scale(${sc})`, transformOrigin: "0 50%" })
        }
      }
    })
  }

  // ---------- 그리기 도구 ----------

  private put(e: Element, s: Spec): void {
    this.visible.add(e)
    const st = (e as HTMLElement).style
    const sx = s.sx ?? 1
    const sy = s.sy ?? 1
    st.transform = `translate(${s.x}px,${s.y}px)${s.rot ? ` rotate(${s.rot}rad)` : ""}${sx !== 1 || sy !== 1 ? ` scale(${sx},${sy})` : ""}`
    if (s.w !== undefined) st.width = `${Math.max(0, s.w)}px`
    if (s.h !== undefined) st.height = `${Math.max(0, s.h)}px`
    st.borderRadius = typeof s.r === "string" ? s.r : `${s.r ?? 0}px`
    st.opacity = String(s.o ?? 1)
    st.clipPath = s.clip ?? "none"
    st.transformOrigin = s.origin ?? "0 0"
    if (s.filter !== undefined) st.filter = s.filter ?? "none"
    if (s.z !== undefined) st.zIndex = String(s.z)
  }

  private putRect(e: Element, r: Rect, radius: number | string = 0, extra: Partial<Spec> = {}): void {
    this.put(e, { x: r.x, y: r.y, w: r.w, h: r.h, r: radius, ...extra })
  }

  /** 마스크 안 글자: p=0 아래에 숨음, 1 제자리, 2 위로 빠짐 */
  private maskAt(m: Mask, x: number, y: number, inP: number, outP = 0, extra: Partial<Spec> = {}): void {
    this.put(m.root, { x, y, ...extra })
    const off = (1 - ease.inOut(clamp(inP))) * 105 - ease.inOut(clamp(outP)) * 105
    m.span.style.transform = `translateY(${off}%)`
  }

  private bleedSpecs: Partial<Record<Bleed, BleedSpec>> = {}
  private putBleed(b: Bleed, spec: BleedSpec): void {
    this.bleedSpecs[b] = spec
    this.put(this.bleed[b], { x: spec.x, y: spec.y, w: spec.w, h: spec.h, clip: spec.clip })
  }

  /** 유리 요소: 뒤 장면 복제본을 정렬하고 필터를 건다 */
  /** mag > 1이면 렌즈처럼 뒤 장면을 확대해 보여 준다(중심 기준) */
  private putGlass(g: Glass, r: Rect, radius: number, extra: Partial<Spec> = {}, mag = 1): void {
    this.putRect(g.root, r, radius, extra)
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    g.clone.style.transformOrigin = "0 0"
    g.clone.style.transform = `translate(${r.w / 2 - mag * cx}px,${r.h / 2 - mag * cy}px) scale(${mag})`
    g.clone.style.width = `${W}px`
    g.clone.style.height = `${W}px`
    g.clone.style.filter = rectGlassFilter(r.w, r.h, radius, this.quality) ?? "none"
    this.syncClone(g.layers)
  }

  private syncClone(layers: Record<Bleed, HTMLDivElement>): void {
    for (const b of ["field", "clay", "pool", "paper"] as const) {
      const sp = this.bleedSpecs[b]
      const l = layers[b]
      if (!sp) {
        l.style.display = "none"
        continue
      }
      l.style.display = "block"
      l.style.position = "absolute"
      l.style.left = `${sp.x}px`
      l.style.top = `${sp.y}px`
      l.style.width = `${sp.w}px`
      l.style.height = `${sp.h}px`
      l.style.clipPath = sp.clip ?? "none"
      if (b === "paper") l.style.background = "var(--canvas)"
    }
  }

  private worldClip!: HTMLDivElement
  private clipBase: Rect = rect(0, 0, 1, 1)

  private camT(c: Cam, t: number): void {
    const { ox, oy } = this.baseT
    const k = this.k
    // 보이는 영역: 평소엔 영상 영역, 타일 줌(10.5–12) 동안만 무대 전체로 넓혀 전면 사진으로 이어지게
    const full = rect(0, 0, this.vw, this.vh)
    const clip = t >= 10.5 && t < 12 ? lerpRect(this.clipBase, full, ease.inOut(seg(t, 10.5, 12))) : this.clipBase
    Object.assign(this.worldClip.style, { left: `${clip.x}px`, top: `${clip.y}px`, width: `${clip.w}px`, height: `${clip.h}px` })
    // 무대 기본 배치(k, ox, oy) 위에 카메라를 얹는다(보이는 영역의 원점만큼 빼서)
    this.world.style.transform = `translate(${ox + k * c.tx - clip.x}px,${oy + k * c.ty - clip.y}px) scale(${k * c.s})`
  }

  // ---------- 시간 → 장면 ----------

  async seek(t: number, commit: () => boolean = () => true): Promise<void> {
    await this.init()
    const tt = ((t % BEATS) + BEATS) % BEATS
    const need = (Object.keys(FIRST_USE) as Asset[]).filter((a) => FIRST_USE[a] <= tt + 1.5)
    await Promise.all(need.map((a) => this.load(a)))
    if (!commit()) return
    this.apply(tt)
  }

  private apply(t: number): void {
    this.visible.clear()
    this.bleedSpecs = {}
    const cam = this.camera(t)
    this.camT(cam, t)
    this.sceneOpen(t, cam)
    this.sceneBuild(t)
    this.sceneGlass(t)
    this.sceneStage(t)
    this.sceneDetail(t)
    this.sceneJourney(t, cam)
    this.sceneWall(t)
    this.sceneCursor(t)
    this.sceneCaptions(t)
    for (const e of this.all) e.classList.toggle("st-hide", !this.visible.has(e))
    this.stage.dataset.t = t.toFixed(3)
  }

  // 화면 안 좌표들
  private readonly S = centered(CX, CY, 470, 1061) // 폰 화면
  private readonly C1: Cam = { s: 0.7, tx: 430 - 0.7 * CX, ty: 760 - 0.7 * CY }
  private winRect(): Rect {
    const c = this.C1
    const a = camInv(c, { x: 690, y: 330 })
    const b = camInv(c, { x: 1370, y: 830 })
    return rect(a.x, a.y, b.x - a.x, b.y - a.y)
  }
  private contentRect(): Rect {
    const w = this.winRect()
    return rect(w.x, w.y + 64, w.w, w.h - 64)
  }
  private C2(): Cam {
    const c = this.contentRect()
    const s = 1300 / c.w
    return { s, tx: 70 - s * c.x, ty: 300 - s * c.y }
  }
  private bentoA = rect(120, 150, 600, 560)
  private zoomEnd(): { cam: Cam; tile: Rect } {
    const B = this.B
    const a = this.bentoA
    const c = center(a)
    const tile = centered(c.x, c.y, a.h * (B.w / B.h), a.h)
    const s = B.h / a.h
    const bc = center(B)
    return { cam: { s, tx: bc.x - s * c.x, ty: bc.y - s * c.y }, tile }
  }

  private camera(t: number): Cam {
    if (t < 10.5) return IDENTITY
    if (t < 12) {
      const e = ease.inOut(seg(t, 10.5, 12))
      const { cam } = this.zoomEnd()
      // 타일 중심이 화면 중심으로 오며 확대
      const c = center(this.bentoA)
      const s = Math.exp(lerp(0, Math.log(cam.s), e))
      const bc = center(this.B)
      const fx = lerp(c.x, bc.x, e)
      const fy = lerp(c.y, bc.y, e)
      return { s, tx: fx - s * c.x, ty: fy - s * c.y }
    }
    if (t < 26.6) return IDENTITY
    if (t < 27.4) return camLerp(IDENTITY, this.C1, ease.inOut(seg(t, 26.6, 27.4)))
    if (t < 32.5) return this.C1
    if (t < 34) return camLerp(this.C1, this.C2(), ease.inOut(seg(t, 32.5, 34)))
    if (t < 42.6) return this.C2()
    return IDENTITY
  }

  // ===== OPEN (0–12) + 마지막 귀환(53.25–54) =====

  private letterSqueeze(s: number): void {
    const m = this.mark
    let xr = m.dotX - m.gap * s
    const n = this.letters.length
    for (let i = n - 1; i >= 0; i--) {
      const lw = this.letterW[i]
      const wide = lw.widths[lw.widths.length - 1]
      const narrow = lw.widths[0]
      const want = wide * s
      let wdth = 62
      let scaleX = 1
      if (want >= narrow && this.wdthSupported) {
        // 표본 사이를 선형 보간해 원하는 폭에 맞는 wdth 값을 찾는다
        for (let j = 1; j < lw.widths.length; j++) {
          if (want <= lw.widths[j] || j === lw.widths.length - 1) {
            const p = clamp((want - lw.widths[j - 1]) / (lw.widths[j] - lw.widths[j - 1] || 1))
            wdth = lerp(lw.samples[j - 1], lw.samples[j], p)
            break
          }
        }
        const actual = this.wdthW(i, wdth)
        scaleX = actual > 0 ? want / actual : 0
      } else {
        scaleX = narrow > 0 ? want / narrow : 0
        wdth = this.wdthSupported ? 62 : 100
      }
      const x = xr - want
      xr = x
      const el = this.letters[i]
      if (want < 0.5) continue
      this.put(el, { x, y: m.top, sx: scaleX })
      el.style.fontVariationSettings = `"wdth" ${wdth.toFixed(2)}, "wght" 800`
    }
  }
  private wdthW(i: number, wdth: number): number {
    const lw = this.letterW[i]
    for (let j = 1; j < lw.samples.length; j++) {
      if (wdth <= lw.samples[j] || j === lw.samples.length - 1) {
        const p = clamp((wdth - lw.samples[j - 1]) / (lw.samples[j] - lw.samples[j - 1]))
        return lerp(lw.widths[j - 1], lw.widths[j], p)
      }
    }
    return lw.widths[lw.widths.length - 1]
  }
  private dotRect(): Rect {
    const m = this.mark
    return rect(m.dotX, m.baseline - m.dot, m.dot, m.dot)
  }
  private readonly pillRect = centered(CX, CY, 900, 170)

  private sceneOpen(t: number, cam: Cam): void {
    // 글자 접힘 / 다시 펼침
    let s = -1
    if (t < 1.6) s = 1 - ease.inOut(seg(t, 0.35, 1.6))
    else if (t >= 53.55) s = ease.back(seg(t, 53.55, 54))
    if (s > 0) this.letterSqueeze(s)

    // 점 → 알약 → (조리개 아래로) / 마지막: 알약 → 점
    if (t < 1.6 || t >= 53.55) {
      this.putRect(this.pill, this.dotRect(), this.mark.dot / 2)
      this.maskAt(this.pillLabel, 0, 0, 0, 0, { w: 780, h: 90 })
    } else if (t < 4.6) {
      const p = springStep(t - 1.6, { freq: 1.1, damping: 0.75 })
      const r = lerpRect(this.dotRect(), this.pillRect, p)
      this.putRect(this.pill, r, r.h / 2)
      const lr = this.pillRect
      this.maskAt(this.pillLabel, (r.w - (lr.w - 120)) / 2, (r.h - 90) / 2, seg(t, 2.5, 3.2), 0, { w: lr.w - 120, h: 90 })
    }

    // 조리개 1: 알약 위로 닫혔다가 사진 위로 열림
    if (t >= 4.1 && t < 5.4) {
      const R = 470
      const a = t < 4.6 ? R * (1 - ease.inOut(seg(t, 4.1, 4.6))) : R * ease.out(seg(t, 4.6, 5.4))
      const blades = irisBlades(CX, CY, R, a, 0.6 * (1 - a / R))
      blades.forEach((b, i) => this.iris1Paths[i].setAttribute("d", b.d))
      this.put(this.iris1, { x: 0, y: 0 })
    }

    // 격자 타일
    if (t >= 4.6 && t < 12) this.tilesAt(t, cam)
  }

  private gridRect(r: number, c: number): Rect {
    return rect(186 + c * 364, 186 + r * 364, 340, 340)
  }
  private bentoRect(i: number): Rect {
    // grid 순서: 0 explore,1 pool,2 map,3 climbing,4 field,5 clay,6 search,7 external,8 own
    const B: Record<number, Rect> = {
      4: this.bentoA,
      1: rect(740, 150, 580, 270),
      3: rect(740, 440, 580, 270),
      2: rect(120, 730, 390, 560),
      8: rect(530, 730, 390, 560),
      7: rect(940, 730, 380, 560),
      5: rect(740, 150, 580, 270), // 수영장 아래로 숨음
      0: rect(120, 730, 390, 560), // 위치와 이동 아래로
      6: rect(530, 730, 390, 560), // 시설 정보 아래로
    }
    return B[i]
  }

  private tilesAt(t: number, cam: Cam): void {
    void cam
    const centerTile = this.gridRect(1, 1)
    const disc = centered(CX, CY, 940, 940)
    const zoom = seg(t, 10.5, 12)
    const ze = ease.inOut(zoom)
    const bento = ease.inOut(seg(t, 8, 9))
    this.tiles.forEach((tile, i) => {
      const r = Math.floor(i / 3)
      const c = i % 3
      let rr: Rect
      let rad = 26
      let z = 2
      if (i === 4) {
        // 가운데: 원(사진) → 둥근 사각형 → 격자 칸
        if (t < 5.4) {
          rr = disc
          rad = 470
        } else {
          const p = ease.inOut(seg(t, 5.4, 6.2))
          rr = lerpRect(disc, centerTile, p)
          rad = lerp(470, 26, p)
        }
        z = 4
      } else {
        const plus = r === 1 || c === 1
        const born = plus ? 6.2 : 6.8
        if (t < born) return
        const from = plus ? centerTile : this.gridRect(r, 1)
        const p = springStep(t - born, { freq: 1.4, damping: 0.72 })
        rr = lerpRect(from, this.gridRect(r, c), p)
        z = plus ? 3 : 2
        if ([0, 5, 6].includes(i)) z = 1
      }
      if (t >= 8) rr = lerpRect(rr, this.bentoRect(i), bento)
      if ([0, 5, 6].includes(i) && t >= 9.05) return // 덮인 여분 칸
      if (i === 4 && t >= 10.5) {
        const { tile: end } = this.zoomEnd()
        rr = lerpRect(this.bentoA, end, ze)
        rad = 26 * (1 - ze)
        z = 9
      }
      this.putRect(tile.root, rr, rad, { z })
      if (tile.label) {
        const order = [4, 1, 3, 2, 8, 7].indexOf(i)
        this.maskAt(tile.label, 22, rr.h - 80, seg(t, 8.8 + order * 0.07, 9.2 + order * 0.07), ze * 2)
      }
    })
  }

  // ===== BUILD (12–18) =====

  private readonly searchRect = centered(CX, 520, 1000, 124)
  private readonly query = "연수구에서 운동할 곳 찾기"

  private sceneBuild(t: number): void {
    const B = this.B
    // 전면 축구장 사진(줌 끝에서 이어받음), 18–18.8에 왼쪽으로 밀려남
    const push = ease.inOut(seg(t, 18, 18.8))
    if (t >= 12 && t < 18.8) this.putBleed("field", { x: B.x - push * B.w, y: B.y, w: B.w, h: B.h })
    if (t < 12 || t >= 18.8) return

    // 검색 유리판
    let r: Rect
    let rad = 62
    if (t < 16.8) {
      const pop = springStep(t - 12, { freq: 1.6, damping: 0.76 })
      const stretch = ease.out(seg(t, 12.35, 12.9))
      const w = lerp(124 * pop, 1000, stretch)
      r = centered(CX, 520, w, 124 * pop)
    } else {
      const p = ease.inOut(seg(t, 16.8, 17.8))
      r = lerpRect(this.searchRect, this.S, p)
      rad = lerp(62, 56, p)
    }
    r = { ...r, x: r.x - push * B.w }
    this.putGlass(this.search, r, rad)
    const reveal = ease.out(seg(t, 17.0, 17.8))
    this.searchShot.style.clipPath = `inset(${((1 - reveal) * 50).toFixed(2)}% 0 round ${rad}px)`
    this.searchShot.style.display = reveal > 0 ? "block" : "none"

    // 아이콘·글자·커서(줄로 접힘)
    const collapse = ease.in(seg(t, 16.5, 17.0))
    if (t >= 12.9 && collapse < 1) {
      const sy = 1 - collapse
      const ip = springStep(t - 12.9, { freq: 1.8, damping: 0.74 })
      this.put(this.searchIcon, { x: 280 - push * B.w, y: 520 - 26, w: 52, h: 52, sx: ip, sy: ip * sy, origin: "50% 50%" })
      const n = Math.floor(seg(t, 13, 15) * this.query.length + 1e-6)
      this.searchText.textContent = this.query.slice(0, n)
      this.put(this.searchText, { x: 352 - push * B.w, y: 520 - 30, sy, origin: "0 50%" })
      const caretOn = t < 16.4 && Math.floor(t * 2) % 2 === 0
      if (caretOn) {
        const textW = this.measureCached(this.query.slice(0, n))
        this.put(this.searchCaret, { x: 352 + textW + 6 - push * B.w, y: 520 - 28, w: 4, h: 56, sy })
      }
    }

    // 조건 칩: 테두리를 그리고, 검정이 칠해지고, 글자가 올라옴 → 줄로 접혀 화면에 흡수
    const gap = 18
    const total = this.chips.reduce((a, c) => a + c.w, 0) + gap * (this.chips.length - 1)
    let x = CX - total / 2
    this.chips.forEach((chip, i) => {
      const born = 15 + i * 0.18
      const cx = x
      x += chip.w + gap
      if (t < born || t >= 17.3) return
      const draw = ease.out(seg(t, born, born + 0.35))
      const fill = springStep(t - born - 0.25, { freq: 1.6, damping: 0.7 })
      const per = 2 * (chip.w - 3 + 73)
      chip.border.setAttribute("stroke-dasharray", `${per}`)
      chip.border.setAttribute("stroke-dashoffset", `${per * (1 - draw)}`)
      chip.fill.style.transform = `scaleX(${clamp(fill, 0, 1.06)})`
      chip.text.style.clipPath = `inset(0 ${(1 - clamp(fill)) * 100}% 0 0)`
      const cy = lerp(626, 720, collapse)
      this.put(chip.root, { x: cx, y: cy, w: chip.w, h: 76, sy: 1 - collapse * 0.94, origin: "50% 50%", r: 38 })
    })

    if (t >= 17.3) {
      const bp = springStep(t - 17.3, { freq: 1.8, damping: 0.74 })
      this.put(this.badge1, { x: this.S.x + this.S.w - 168 - push * B.w, y: this.S.y + 64, sx: bp, sy: bp, origin: "100% 0" })
    }
  }
  private textW = new Map<string, number>()
  private measureCached(s: string): number {
    let w = this.textW.get(s)
    if (w === undefined) {
      w = this.measure(s, "font-family:var(--font-ko);font-weight:600;font-size:46px;")
      this.textW.set(s, w)
    }
    return w
  }

  // ===== GLASS (18–24.4) =====

  private readonly toolbar = centered(CX, 940, 1040, 150)
  private readonly trackX = [330, 1060] as const

  private knobK(t: number): number {
    return lerp(0.15, 0.85, ease.inOut(seg(t, 22.4, 23.4)))
  }
  private knobPos(t: number) {
    return { x: lerp(this.trackX[0], this.trackX[1], this.knobK(t)), y: 940 }
  }

  private sceneGlass(t: number): void {
    const B = this.B
    if (t < 18 || t >= 27.0) return
    const push = ease.inOut(seg(t, 18, 18.8))
    // 클레이 코트 사진이 오른쪽에서 밀려 들어옴
    this.putBleed("clay", { x: B.x + B.w * (1 - push), y: B.y, w: B.w, h: B.h })
    // 거리 슬라이더를 따라 수영장 사진이 가장자리부터 칠해짐(밝기 변화 아님)
    if (t >= 22.4) {
      const f = (this.knobK(t) - 0.15) / 0.7
      this.putBleed("pool", { x: B.x, y: B.y, w: B.w, h: B.h, clip: `inset(0 ${((1 - clamp(f)) * 100).toFixed(3)}% 0 0)` })
    }
    // 종이 면이 아래에서 밀려 올라와 사진을 덮음(26.3–27.0)
    if (t >= 26.3) {
      const p = ease.inOut(seg(t, 26.3, 27.0))
      this.putBleed("paper", { x: B.x, y: B.y + B.h * (1 - p), w: B.w, h: B.h })
    }

    // 유리 글자 "가까운 운동"
    if (t >= 18.9 && t < 21.0) {
      const melt = ease.in(seg(t, 20.4, 21.0))
      this.glyphs.forEach((g, i) => {
        const born = 18.9 + i * 0.18
        if (t < born) return
        const pop = springStep(t - born, { freq: 1.7, damping: 0.72 })
        const sc = Math.max(0.001, pop * lerp(1, 0.02, melt))
        const cx = lerp(g.cx, CX, melt)
        const cy = lerp(g.cy, 600, melt)
        const size = g.glass.size
        const x = cx - size / 2
        const y = cy - size / 2
        this.put(g.root, { x, y, sx: sc, sy: sc, origin: "50% 50%", filter: null })
        // 복제본 정렬: 요소가 중심 기준 sc배일 때 캔버스 좌표가 제자리에 오도록
        const c = size / 2
        const L = { x: c - (c + x) / sc, y: c - (c + y) / sc }
        g.clone.style.transform = `translate(${L.x}px,${L.y}px) scale(${1 / sc})`
        this.syncClone(g.layers)
      })
    }
    if (t >= 20.4 && t < 21.2) {
      const melt = ease.in(seg(t, 20.4, 21.0))
      this.glyphs.forEach((g, i) => {
        const c = this.gooDots[i]
        c.setAttribute("cx", String(lerp(g.cx, CX, melt)))
        c.setAttribute("cy", String(lerp(g.cy, 600, melt)))
        c.setAttribute("r", String(lerp(70, 30, melt) * ease.out(seg(t, 20.4, 20.65)) * (1 - ease.in(seg(t, 20.85, 21.05)))))
      })
      this.gooDrop.setAttribute("r", String(120 * ease.out(seg(t, 20.6, 21.1))))
      this.put(this.gooSvg, { x: 0, y: 0, o: 0.5 })
    }

    // 물방울 → 유리 툴바 → (손잡이 렌즈로 들어 올린 뒤) 접힘
    if (t >= 21.1 && t < 24.0) {
      let r: Rect
      let rad: number
      if (t < 21.9) {
        const p = ease.inOut(seg(t, 21.2, 21.9))
        r = lerpRect(centered(CX, 600, 240, 240), this.toolbar, p)
        rad = lerp(120, 75, p)
      } else {
        const p = ease.in(seg(t, 23.5, 24.0))
        r = centered(CX, 940, this.toolbar.w * (1 - p), this.toolbar.h * (1 - p * 0.6))
        rad = lerp(75, 30, p)
      }
      this.putGlass(this.drop, r, rad)
    }
    if (t >= 21.8 && t < 23.5) {
      const ip = springStep(t - 21.8, { freq: 1.8, damping: 0.76 })
      const morph = ease.in(seg(t, 22.0, 22.3))
      this.put(this.adjIcon, { x: 240, y: 940 - 30, w: 60, h: 60, sx: ip * (1 - morph), sy: ip * (1 - morph), origin: "50% 50%" })
      const draw = ease.out(seg(t, 22.05, 22.45))
      this.put(this.track, { x: this.trackX[0], y: 940 - 5, w: this.trackX[1] - this.trackX[0], h: 10, sx: Math.max(0.0001, draw), r: 5 })
      const kv = 0.5 + this.knobK(t) * 4.5
      this.value.span.textContent = `반경 ${kv.toFixed(1)}km`
      this.maskAt(this.value, 1080, 940 - 25, seg(t, 22.2, 22.6), 0)
      const dp = springStep(t - 22.0, { freq: 1.6, damping: 0.7 })
      this.put(this.demoCtl, { x: this.toolbar.x, y: this.toolbar.y - 70, sx: dp, sy: dp, origin: "0 100%" })
    }
    // 손잡이 → 유리 렌즈 → 구슬 → 폰 화면
    if (t >= 22.25 && t < 23.4) {
      const kp = springStep(t - 22.25, { freq: 1.8, damping: 0.74 })
      const k = this.knobPos(t)
      const d = 56 * kp
      this.put(this.knob, { x: k.x - d / 2, y: k.y - d / 2, w: d, h: d, r: "50%" })
    }
    if (t >= 23.4 && t < 27.0) this.lensAt(t)
  }

  private lensAt(t: number): void {
    const k = this.knobPos(23.4)
    let r: Rect
    let rad: number
    if (t < 24.0) {
      const p = ease.inOut(seg(t, 23.4, 24.0))
      const d = lerp(56, 300, p)
      r = centered(lerp(k.x, CX, p), lerp(k.y, 560, p), d, d)
      rad = d / 2
    } else {
      const p = ease.inOut(seg(t, 24.4, 25.4))
      r = lerpRect(centered(CX, 560, 300, 300), this.S, p)
      rad = lerp(150, 56, p)
    }
    // 흰 손잡이가 안쪽부터 비워져 고리가 되고, 뒤를 확대해 보여 주는 렌즈가 된다(바꿔치기 없이 이어짐)
    const open = ease.out(seg(t, 23.9, 24.4))
    const phone = ease.inOut(seg(t, 24.4, 25.4))
    const hollow = ease.inOut(seg(t, 23.4, 23.75))
    const ring = lerp(r.w / 2, 4, hollow)
    const dark = lerp(3, 0, ease.inOut(seg(t, 23.6, 23.9)))
    this.lens.tint.style.boxShadow = phone > 0 ? "" : `inset 0 0 0 ${ring.toFixed(2)}px #fff, inset 0 0 0 ${(ring + dark).toFixed(2)}px #111, inset 0 4px 3px -2px rgba(255,255,255,0.8)`
    this.lens.tint.style.background = phone > 0 ? "" : "rgba(255,255,255,0.08)"
    this.putGlass(this.lens, r, rad, {}, lerp(lerp(1, 1.35, hollow), 1, phone))
    const status = 44 * phone
    this.lensStatus.style.height = `${status}px`
    this.lensStatus.style.display = phone > 0 ? "block" : "none"
    this.lensShot.style.top = `${status}px`
    this.lensShot.style.height = `${r.h - status}px`
    this.lensShot.style.clipPath = phone > 0 ? "none" : `circle(${(open * 72).toFixed(2)}% at 50% 50%)`
    this.lensShot.style.display = open > 0 ? "block" : "none"
  }

  // ===== STAGE (24.4–34) =====

  private summaryRect(): Rect {
    return rect(this.S.x + 16, this.S.y + this.S.h - 122, this.S.w - 32, 96)
  }

  private sceneStage(t: number): void {
    this.sceneStageInner(t)
    // 브라우저로 줌인하는 동안(32.6–34) 폰은 왼쪽으로 빠져나가고, 그 뒤엔 그리지 않는다(영상 영역 가장자리에 잘린 폰이 남지 않게)
    const phoneParts: HTMLElement[] = [this.lens.root, this.bezel, this.island, this.homebar, this.summary, this.badge2]
    if (t >= 34) for (const e of phoneParts) this.visible.delete(e)
    else if (t >= 32.6) {
      const dx = -1100 * ease.in(seg(t, 32.6, 33.9))
      for (const e of phoneParts) if (this.visible.has(e)) e.style.transform = `translate(${dx}px,0px) ${e.style.transform}`
    }
  }

  private sceneStageInner(t: number): void {
    // 폰·창은 범람이 덮을 때(42.6)까지 남긴다. 가로 화면에선 영상 왼쪽 영역도 보이므로 중간에 사라지면 튄다
    if (t < 24.4 || t >= 42.6) return
    const S = this.S
    if (t >= 27.0) this.lensAt(Math.min(t, 26.99)) // 폰 화면 유지
    // 시연 배지
    if (t >= 25.2) {
      const bp = springStep(t - 25.2, { freq: 1.8, damping: 0.74 })
      this.put(this.badge2, { x: S.x + S.w - 150, y: S.y + 110, sx: bp, sy: bp, origin: "100% 0" })
    }
    // 홈 바 → 요약 바
    if (t >= 25.0) {
      const hp = springStep(t - 25.0, { freq: 1.8, damping: 0.78 })
      const home = centered(CX, S.y + S.h - 20, 140 * hp, 9)
      const p = ease.inOut(seg(t, 25.6, 26.3))
      if (p <= 0) this.putRect(this.homebar, home, 5)
      else {
        const r = lerpRect(home, this.summaryRect(), p)
        this.putRect(this.summary, r, lerp(5, 22, p))
        this.maskAt(this.summaryText, 100, 16, seg(t, 25.9, 26.3), 0)
      }
    }
    // 베젤이 화면 가장자리에서 자라남
    if (t >= 26.6) {
      const bw = 24 * ease.out(seg(t, 26.6, 27.4))
      this.putRect(this.bezel, rect(S.x - bw, S.y - bw, S.w + bw * 2, S.h + bw * 2), 56 + bw)
    }
    // 다이내믹 아일랜드: 늘어나고 → 끊어지고 → 건너가서 → 데스크톱 창이 됨
    const iy = S.y + 10
    const ih = 34
    const win = this.winRect()
    if (t >= 27.2 && t < 27.6) {
      const ip = ease.out(seg(t, 27.2, 27.5))
      this.putRect(this.island, centered(CX, iy + ih / 2, 120, ih * ip), ih / 2)
    }
    if (t >= 27.6 && t < 28.8) {
      const stretch = ease.inOut(seg(t, 27.6, 28.0))
      const back = ease.inOut(seg(t, 28.0, 28.35))
      const right = CX + 60 + 340 * stretch - 340 * back
      this.goo2Island.setAttribute("x", String(CX - 60))
      this.goo2Island.setAttribute("y", String(iy))
      this.goo2Island.setAttribute("width", String(Math.max(120, right - (CX - 60))))
      this.goo2Island.setAttribute("height", String(ih))
      this.goo2Island.setAttribute("rx", String(ih / 2))
      // 오른쪽 끝 방울: 끝에 붙어 있다가 떨어져 창으로 이동·성장
      const blobStart = centered(CX + 60 + 340 - 30, iy + ih / 2, 60, 60)
      const travel = ease.inOut(seg(t, 28.2, 28.8))
      const br = lerpRect(blobStart, win, travel)
      const bshow = seg(t, 27.85, 28.0)
      this.goo2Blob.setAttribute("x", String(br.x))
      this.goo2Blob.setAttribute("y", String(br.y))
      this.goo2Blob.setAttribute("width", String(br.w * (bshow > 0 ? 1 : 0)))
      this.goo2Blob.setAttribute("height", String(br.h))
      this.goo2Blob.setAttribute("rx", String(lerp(30, 24, travel)))
      this.put(this.goo2Svg, { x: 0, y: 0 })
    }
    if (t >= 28.35) this.putRect(this.island, centered(CX, iy + ih / 2, 120, ih), ih / 2)
    // 창: 벽지가 열리고 → 블라인드처럼 말려 올라가 브라우저가 드러남
    if (t >= 28.8) {
      this.putRect(this.win, win, 24)
      const open = ease.out(seg(t, 28.8, 29.3))
      const roll = ease.inOut(seg(t, 29.3, 29.9))
      const ins = (1 - open) * 50
      this.winWall.style.clipPath = `inset(${ins}% ${ins}% ${Math.max(ins, roll * 100)}% ${ins}%)`
      this.winWall.style.display = roll >= 1 ? "none" : "block"
      // 창 안은 블라인드가 걷히기 전까지 검정(벽지가 가운데서 열림)
      this.winBrowser.style.display = t >= 29.3 ? "block" : "none"
      const tabSwap = seg(t, 31.7, 32.1)
      this.maskAt(this.winTab, 0, 0, 1, tabSwap)
      this.maskAt(this.winTabNew, 0, 0, tabSwap, 0)
    }
    // 길게 눌러 카드를 들어 브라우저 탭으로 끌어다 놓음(시연)
    const sum = this.summaryRect()
    if (t >= 26.5 && t < 30.8) {
      // 요약 바는 그대로 남아 있음
      this.putRect(this.summary, sum, 22)
      this.maskAt(this.summaryText, 100, 16, 1, 0)
    }
    if (t >= 30.8 && t < 32.6) {
      const lift = springStep(t - 30.8, { freq: 1.6, damping: 0.76 })
      const cur = this.cursorAt(t)
      const drop = ease.inOut(seg(t, 31.6, 32.5))
      const held = centered(cur.x - 40 + sum.w / 2, cur.y - 20 + sum.h / 2, sum.w, sum.h)
      const from = t < 31.1 ? lerpRect(sum, held, ease.out(seg(t, 30.8, 31.1))) : held
      const hero = this.heroRectWorld()
      const r = lerpRect(from, hero, drop)
      this.putRect(this.dragCard, r, lerp(22, 0, drop), { sx: 1 + 0.04 * lift * (1 - drop), sy: 1 + 0.04 * lift * (1 - drop), origin: "50% 50%" })
      // 썸네일이 카드 전체로 커지며 히어로 사진이 됨
      const thumb = lerpRect(rect(14, 14, 68, 68), rect(0, 0, r.w, r.h), drop)
      Object.assign(this.dragThumb.style, { left: `${thumb.x}px`, top: `${thumb.y}px`, width: `${thumb.w}px`, height: `${thumb.h}px`, borderRadius: `${lerp(14, 0, drop)}px` })
      this.dragText.style.transform = `scale(${1 - drop})`
    }
    if (t >= 30.8) {
      // 요약 바는 남겨 두고, 들려 나간 것은 복사본 카드
      this.putRect(this.summary, sum, 22)
      this.maskAt(this.summaryText, 100, 16, 1, 0)
    }
  }

  private heroRectWorld(): Rect {
    const c = this.contentRect()
    return rect(c.x, c.y + 56, c.w, 300)
  }

  // ===== DETAIL (31.6–42.6) =====

  private sceneDetail(t: number): void {
    if (t < 31.6 || t >= 42.6) return
    const c = this.contentRect()
    const push = ease.inOut(seg(t, 31.6, 32.5))
    this.putRect(this.page, rect(c.x + c.w * (1 - push), c.y, c.w, c.h), "0 0 24px 24px")
    const pg = this.pg
    const set = (e: HTMLElement, r: Rect, rad = 0) => Object.assign(e.style, { display: "block", transform: `translate(${r.x}px,${r.y}px)`, width: `${r.w}px`, height: `${r.h}px`, borderRadius: `${rad}px`, left: "0", top: "0" })
    const hide = (e: HTMLElement) => (e.style.display = "none")

    // 히어로 사진 → 액자 속 사진(매트·프레임이 사진 가장자리에서 자람)
    const heroLocal = rect(0, 56, c.w, 300)
    const framed = rect(28, 84, 360, 270)
    const fp = ease.inOut(seg(t, 34, 35.2))
    const grow = ease.out(seg(t, 34.8, 35.5))
    const img = lerpRect(heroLocal, framed, fp)
    if (t >= 32.5) set(pg.hero, img)
    else hide(pg.hero)
    const m = 14 * grow
    const f = 8 * grow
    if (grow > 0) {
      set(pg.mat, rect(img.x - m, img.y - m, img.w + 2 * m, img.h + 2 * m))
      set(pg.frame, rect(img.x - m - f, img.y - m - f, img.w + 2 * (m + f), img.h + 2 * (m + f)), 2)
    } else {
      hide(pg.mat)
      hide(pg.frame)
    }
    // 정보 글자
    const ix = 430
    pg.info.forEach((mk, i) => {
      const y = [92, 140, 178, 204][i]
      this.maskAtLocal(mk, ix, y, seg(t, 34.6 + i * 0.1, 35.1 + i * 0.1))
    })
    const tp = springStep(t - 35.0, { freq: 1.8, damping: 0.76 })
    Object.assign(pg.tag.style, { display: t >= 35.0 ? "block" : "none", transform: `translate(${ix}px,244px) scale(${tp})` })

    // 조건 선택: 고른 칸이 왼쪽부터 칠해짐
    let gx = 28
    pg.groups.forEach((g) => {
      const born = 35.0
      const lp = seg(t, born, born + 0.4)
      Object.assign(g.label.style, { display: lp > 0 ? "block" : "none", transform: `translate(${gx}px,${388 + (1 - ease.out(lp)) * 12}px)`, clipPath: `inset(0 0 ${(1 - ease.out(lp)) * 100}% 0)` })
      let sx = gx
      g.segs.forEach((sg, j) => {
        const sp = springStep(t - born - 0.1 - j * 0.06, { freq: 1.8, damping: 0.7 })
        Object.assign(sg.root.style, { display: t >= born ? "block" : "none", transform: `translate(${sx}px,418px) scale(${sp})`, transformOrigin: "0 50%" })
        const paint = j === g.pick ? ease.out(seg(t, g.at, g.at + 0.35)) : 0
        sg.paint.style.clipPath = `inset(0 ${(1 - paint) * 100}% 0 0)`
        sx += sg.w + 8
      })
      gx = sx + 26
    })

    // 머리글 내비 버튼이 아래로 내려와 실제 다음 행동 버튼이 됨
    pg.nav1.style.display = "block"
    const navFrom = rect(c.w - 24 - 110, 12, 110, 32)
    const navTo = rect(c.w - 28 - 330, c.h - 28 - 56, 330, 56)
    const tv = ease.inOut(seg(t, 38.2, 39.4))
    const nr = { x: lerp(navFrom.x, navTo.x, ease.out(tv)), y: lerp(navFrom.y, navTo.y, ease.in(tv)), w: lerp(navFrom.w, navTo.w, tv), h: lerp(navFrom.h, navTo.h, tv) }
    set(pg.nav, nr, nr.h / 2)
    const swap = seg(t, 38.9, 39.4)
    this.maskAtLocal(pg.navText, 0, 0, 1, swap, nr.w)
    this.maskAtLocal(pg.actText, 28, 0, swap, 0)
    const ap = springStep(t - 39.0, { freq: 1.8, damping: 0.76 })
    Object.assign(pg.actIcon.style, { display: t >= 39.0 ? "block" : "none", transform: `translate(${nr.w - 50}px,${(nr.h - 22) / 2}px) scale(${ap})` })
    // 누름 효과
    const press = t >= 39.85 && t < 40.05 ? 0.96 : 1
    pg.nav.style.transform += ` scale(${press})`

    // 안내 시트(밀려 올라옴)
    const sh = 230
    const sp = ease.out(seg(t, 40.1, 40.7))
    if (sp > 0) {
      set(pg.sheet, rect(0, c.h - sh * sp, c.w, sh))
      pg.sheetText.forEach((mk, i) => this.maskAtLocal(mk, 32, 30 + i * 40 + (i > 0 ? 8 : 0), seg(t, 40.4 + i * 0.1, 40.9 + i * 0.1)))
    } else hide(pg.sheet)
  }

  private maskAtLocal(m: Mask, x: number, y: number, inP: number, outP = 0, w?: number): void {
    Object.assign(m.root.style, { display: "block", left: "0", top: "0", transform: `translate(${x}px,${y}px)`, width: w ? `${w}px` : "" })
    const off = (1 - ease.inOut(clamp(inP))) * 105 - ease.inOut(clamp(outP)) * 105
    m.span.style.transform = `translateY(${off}%)`
  }

  // ===== JOURNEY (42–48.2) + 범람 =====
  // 넓이 ∝ 크기² 이므로, 커질 때는 √, 줄어들 때는 1-√(1-p)로 진행해 프레임당 바뀌는 면적을 고르게 한다
  private grow = (p: number) => Math.sqrt(clamp(p))
  private shrink = (p: number) => 1 - Math.sqrt(1 - clamp(p))

  private floodRect(): Rect {
    const B = this.B
    const R = (Math.hypot(B.w, B.h) / 2) * 1.12
    const bc = center(B)
    return centered(bc.x, bc.y, R * 2, R * 2)
  }
  private readonly jPill = centered(CX, CY, 860, 170)
  private readonly jCard = centered(CX, 700, 1000, 560)
  private readonly jSt = [43.0, 43.95, 44.9, 45.85, 46.8]

  private sceneJourney(t: number, cam: Cam): void {
    if (t < 42 || t >= 54) return
    // 하나의 검은 도형
    let r: Rect | null = null
    let rad = 0
    const F = this.floodRect()
    if (t < 42.6) {
      const c = this.contentRect()
      const sheet = camApply(cam, rect(c.x, c.y + c.h - 230, c.w, 230))
      const p = this.grow(ease.inOut(seg(t, 42, 42.6)))
      r = lerpRect(sheet, F, p)
      rad = lerp(20, F.w / 2, p)
    } else if (t < 45.85) {
      const p = this.shrink(ease.inOut(seg(t, 42.6, 43.2)))
      r = lerpRect(F, this.jPill, p)
      rad = lerp(F.w / 2, 85, p)
    } else if (t < 47.7) {
      const p = ease.inOut(seg(t, 45.85, 46.3))
      r = lerpRect(this.jPill, this.jCard, p)
      rad = lerp(85, 48, p)
    } else if (t < 48.2) {
      const p = ease.inOut(seg(t, 47.7, 48.2))
      r = lerpRect(this.jCard, centered(CX, CY, 300, 300), p)
      rad = lerp(48, 150, p)
    } else if (t < 49.8) {
      const p = this.grow(ease.inOut(seg(t, 48.2, 48.8)))
      r = lerpRect(centered(CX, CY, 300, 300), F, p)
      rad = lerp(150, F.w / 2, p)
    } else if (t >= 52.5) {
      // 액자 → 범람 → 알약 → 점
      const FR = this.frameRect()
      if (t < 52.85) {
        const p = this.grow(ease.inOut(seg(t, 52.5, 52.85)))
        r = lerpRect(FR, F, p)
        rad = lerp(4, F.w / 2, p)
      } else if (t < 53.25) {
        const p = this.shrink(ease.inOut(seg(t, 52.85, 53.25)))
        r = lerpRect(F, this.pillRect, p)
        rad = lerp(F.w / 2, 85, p)
      } else if (t < 53.55) {
        const p = ease.inOut(seg(t, 53.25, 53.55))
        r = lerpRect(this.pillRect, this.dotRect(), p)
        rad = r.h / 2
      }
    }
    if (r) this.putRect(this.flood, r, rad)

    if (t < 43.0 || t >= 48.2) return
    // 단계 표시: 글자 교체(각자 마스크), 아이콘 등장·퇴장, 진행 막대
    const shape = t < 45.85 ? this.jPill : t < 47.7 ? lerpRect(this.jPill, this.jCard, ease.inOut(seg(t, 45.85, 46.3))) : this.jCard
    const collapse = ease.in(seg(t, 47.7, 48.0))
    const top = shape.y + (t >= 45.85 ? 40 : 45)
    this.jSt.forEach((st, i) => {
      const next = this.jSt[i + 1] ?? 99
      if (t < st - 0.05 || t >= next + 0.35) return
      const inP = seg(t, st, st + 0.3)
      const outP = Math.max(seg(t, next, next + 0.3), collapse)
      this.maskAt(this.jLabels[i], shape.x + 170, top, inP, outP)
      const s = springStep(t - st - (i === 0 ? 0 : 0.12), { freq: 1.8, damping: 0.74 }) * (1 - ease.inOut(seg(t, next - 0.1, next + 0.1))) * (1 - collapse)
      this.put(this.jIcons[i], { x: shape.x + 50, y: top + 5, w: 80, h: 80, sx: s, sy: s, origin: "50% 50%" })
    })
    const prog = clamp((t - 43.0) / (this.jSt.length * 0.95))
    const barW = shape.w - 100
    const by = shape.y + shape.h - 26
    this.put(this.jBarTrack, { x: shape.x + 50, y: by, w: barW * (1 - collapse), h: 6 })
    this.put(this.jBar, { x: shape.x + 50, y: by, w: Math.max(0, barW * prog * (1 - collapse)), h: 6 })

    // 예약 경로 확인: 경로가 그려지고 시설 핀이 등장(시연)
    if (t >= 45.95 && t < 47.1) {
      const draw = ease.inOut(seg(t, 46.1, 46.8))
      this.routePath.style.clipPath = `inset(0 ${((1 - draw) * 100).toFixed(2)}% 0 0)`
      const pin = springStep(t - 46.6, { freq: 1.8, damping: 0.74 })
      this.routePin.setAttribute("transform", `translate(1000 610) scale(${pin}) translate(-1000 -610)`)
      // 경로는 카드 안(560–860)에 그려지고, 운동 준비 단계에서 가운데로 접힘
      const rs = 1 - ease.inOut(seg(t, 46.8, 47.05))
      this.put(this.route, { x: CX * (1 - rs), y: 710 * (1 - rs), sx: rs, sy: rs })
      this.maskAt(this.routeCap, shape.x + 50, shape.y + shape.h - 84, seg(t, 46.2, 46.6), seg(t, 46.8, 47.05))
    }
    // 운동 준비: 체크 표시가 그려지고 "공식 사이트에서 예약 진행"
    if (t >= 47.05) {
      const per = 2 * Math.PI * 96
      const cp = ease.out(seg(t, 47.05, 47.35))
      const tk = ease.out(seg(t, 47.25, 47.55))
      this.checkCircle.setAttribute("stroke-dasharray", `${per}`)
      this.checkCircle.setAttribute("stroke-dashoffset", `${per * (1 - cp)}`)
      this.checkTick.setAttribute("stroke-dasharray", "140")
      this.checkTick.setAttribute("stroke-dashoffset", `${140 * (1 - tk)}`)
      const s = 1 - collapse
      this.put(this.checkSvg, { x: CX - 110, y: 570, sx: s, sy: s, origin: "50% 50%" })
      this.maskAt(this.jCaption, CX - 230, 815, seg(t, 47.3, 47.62), collapse * 2)
    }
  }

  // ===== WALL (48.2–54) =====

  private frameRect(): Rect {
    return centered(CX, 610, 660, 480)
  }

  private sceneWall(t: number): void {
    if (t < 49.8 || t >= 52.5) return
    const FR = this.frameRect()
    const F = this.floodRect()
    // 검정이 액자 크기로 수축
    const p = this.shrink(ease.inOut(seg(t, 49.8, 50.4)))
    const r = lerpRect(F, FR, p)
    this.putRect(this.frame, r, lerp(F.w / 2, 4, p))
    // 못과 줄
    const lines = ease.out(seg(t, 50.2, 50.6)) * (1 - ease.in(seg(t, 52.05, 52.4)))
    if (lines > 0) {
      const nail = { x: CX, y: 250 }
      const l = { x: lerp(nail.x, FR.x + 60, lines), y: lerp(nail.y, FR.y + 2, lines) }
      const rr = { x: lerp(nail.x, FR.x + FR.w - 60, lines), y: lerp(nail.y, FR.y + 2, lines) }
      this.wallL.setAttribute("d", `M${nail.x} ${nail.y}L${l.x} ${l.y}`)
      this.wallR.setAttribute("d", `M${nail.x} ${nail.y}L${rr.x} ${rr.y}`)
      this.wallNail.setAttribute("r", String(8 * lines))
      this.put(this.wallLines, { x: 0, y: 0 })
    }
    if (t < 50.4) return
    // 매트: 프레임 안쪽 가장자리에서 자라남(안쪽 검정이 줄어듦), 끝에서 다시 덮음
    const border = 20
    const matGrow = ease.out(seg(t, 50.4, 50.8)) * (1 - ease.inOut(seg(t, 52.18, 52.47)))
    const inner = rect(FR.x + border, FR.y + border, FR.w - 2 * border, FR.h - 2 * border)
    const mat = 30 * matGrow
    const imgR = rect(inner.x + mat, inner.y + mat, inner.w - 2 * mat, inner.h - 2 * mat)
    this.putRect(this.matInner, inner, 0)
    this.putRect(this.wallPhoto, imgR, 0)
    // 조리개 2: 사진 위로 열렸다가 닫힘
    const R = Math.hypot(imgR.w, imgR.h) / 2 + 4
    const open = ease.out(seg(t, 50.8, 51.5)) * (1 - ease.inOut(seg(t, 51.7, 52.22)))
    const a = R * open
    const ic = center(imgR)
    irisBlades(ic.x, ic.y, R, a, 0.6 * (1 - open)).forEach((b, i) => this.iris2Paths[i].setAttribute("d", b.d))
    this.iris2Clip.setAttribute("x", String(imgR.x))
    this.iris2Clip.setAttribute("y", String(imgR.y))
    this.iris2Clip.setAttribute("width", String(imgR.w))
    this.iris2Clip.setAttribute("height", String(imgR.h))
    this.put(this.iris2, { x: 0, y: 0 })
    // 조용한 문구
    this.quiet.forEach((m, i) => {
      const y = FR.y + FR.h + 70 + i * 92
      const w = i === 0 ? 520 : 640
      this.maskAt(m, CX - w / 2, y, seg(t, 50.9 + i * 0.15, 51.4 + i * 0.15), seg(t, 52.05, 52.4))
    })
  }

  // ===== 커서(카메라와 함께 커짐·작아짐) =====

  private cursorKeys(): { t: number; x: number; y: number }[][] {
    const C1 = this.C1
    const w1 = (x: number, y: number) => camInv(C1, { x, y })
    const sum = this.summaryRect()
    const win = this.winRect()
    const c = this.contentRect()
    const k0 = this.knobPos(22.4)
    const k1 = this.knobPos(23.4)
    // DETAIL 좌표(페이지 → 월드)
    const P = (x: number, y: number) => ({ x: c.x + x, y: c.y + y })
    const segX = (gi: number) => {
      let gx = 28
      for (let i = 0; i < gi; i++) gx += this.pg.groups[i].segs.reduce((a, s) => a + s.w + 8, 0) + 26
      return gx + this.pg.groups[gi].segs[0].w / 2
    }
    return [
      [ { t: 3.2, x: 1560, y: 1560 }, { t: 3.9, x: 760, y: 770 }, { t: 4.2, x: 790, y: 800 }, { t: 4.6, x: 1600, y: 1500 } ],
      [ { t: 9.6, x: 1560, y: 1400 }, { t: 10.15, x: 430, y: 450 }, { t: 10.45, x: 440, y: 470 }, { t: 10.95, x: 900, y: 1250 } ],
      [ { t: 21.9, x: 1500, y: 1350 }, { t: 22.35, x: k0.x, y: k0.y }, { t: 22.4, x: k0.x, y: k0.y }, { t: 23.4, x: k1.x, y: k1.y }, { t: 23.65, x: k1.x + 140, y: k1.y + 220 } ],
      [ { t: 29.8, ...w1(1100, 1400) }, { t: 30.2, x: sum.x + 40, y: sum.y + 20 }, { t: 30.8, x: sum.x + 40, y: sum.y + 20 }, { t: 31.55, x: win.x + 300, y: win.y + 32 }, { t: 31.65, x: win.x + 300, y: win.y + 32 }, { t: 32.2, ...w1(1250, 1300) } ],
      [ { t: 35.9, ...P(c.w - 40, c.h - 20) }, { t: 36.25, ...P(segX(0), 438) }, { t: 36.4, ...P(segX(0), 438) }, { t: 36.9, ...P(segX(1), 438) }, { t: 37.05, ...P(segX(1), 438) }, { t: 37.55, ...P(segX(2), 438) }, { t: 37.7, ...P(segX(2), 438) }, { t: 39.75, ...P(c.w - 28 - 165, c.h - 28 - 28) }, { t: 40.2, ...P(c.w - 28 - 165, c.h - 28 - 28) }, { t: 40.5, ...P(c.w + 40, c.h + 60) } ],
    ]
  }

  private cursorAt(t: number): { x: number; y: number } {
    for (const path of this.cursorKeys()) {
      if (t < path[0].t || t > path[path.length - 1].t) continue
      for (let i = 1; i < path.length; i++) {
        if (t <= path[i].t) {
          const a = path[i - 1]
          const b = path[i]
          const p = ease.inOut(seg(t, a.t, b.t))
          return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) }
        }
      }
    }
    return { x: -999, y: -999 }
  }

  private sceneCursor(t: number): void {
    const paths = this.cursorKeys()
    const active = paths.find((p) => t >= p[0].t && t <= p[p.length - 1].t)
    if (!active) return
    const pos = this.cursorAt(t)
    const clicks = [4.0, 10.3, 36.35, 37.0, 37.65, 39.95]
    const holds: [number, number][] = [[22.37, 23.4], [30.2, 31.6]]
    let s = 1
    for (const c of clicks) if (Math.abs(t - c) < 0.09) s = 0.8
    for (const [a, b] of holds) if (t >= a && t <= b) s = 0.86
    // 카메라와 함께 크기가 변하도록 월드 안에 둔다. 확대 구간에서는 원래 크기의 일정 비율 유지
    this.put(this.cursor, { x: pos.x - 4, y: pos.y - 3, sx: s, sy: s, origin: "4px 3px" })
    // 길게 누름 진행 원
    if (t >= 30.2 && t < 30.8) {
      const p = seg(t, 30.2, 30.8)
      const per = 2 * Math.PI * 46
      this.pressArc.setAttribute("stroke-dasharray", `${per}`)
      this.pressArc.setAttribute("stroke-dashoffset", `${per * (1 - p)}`)
      this.press.style.display = "block"
    } else this.press.style.display = "none"
  }
}
