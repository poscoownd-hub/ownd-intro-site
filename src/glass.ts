// 리퀴드 글래스. Chromium의 backdrop-filter:url()은 변위 맵을 잘못 읽으므로
// 각 유리 요소가 뒤 장면의 복제본을 들고, 그 복제본에 SVG 필터를 건다.
//  - 둥근 사각형 거리장으로 만든 변위 맵(feImage)
//  - 채널별로 살짝 다른 세기의 feDisplacementMap 3개 → 가장자리 색수차
//  - 테두리 하이라이트는 CSS 안쪽 그림자(.g-tint)로만 둔다(빛 번짐 효과 아님)
// 글자 유리는 글자마다 캔버스 거리장으로 변위 맵·마스크·하이라이트를 만든다.

const SVG_NS = "http://www.w3.org/2000/svg"

export type GlassQuality = "full" | "lite" | "off"

export function detectQuality(): GlassQuality {
  const ua = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] }; deviceMemory?: number }
  const chromium = !!ua.userAgentData?.brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge/.test(b.brand))
  if (!chromium) return "off" // 다른 엔진은 HTML 요소의 feImage 필터가 불안정 → 선명한 대체 유리
  const constrained = (ua.hardwareConcurrency ?? 8) <= 4 || (ua.deviceMemory ?? 8) <= 4 || window.matchMedia("(max-width: 640px)").matches
  return constrained ? "lite" : "full"
}

let defs: SVGDefsElement | null = null
function ensureDefs(): SVGDefsElement {
  if (defs) return defs
  const svg = document.createElementNS(SVG_NS, "svg")
  svg.setAttribute("width", "0")
  svg.setAttribute("height", "0")
  svg.setAttribute("aria-hidden", "true")
  svg.style.position = "absolute"
  defs = document.createElementNS(SVG_NS, "defs")
  svg.appendChild(defs)
  document.body.appendChild(svg)
  return defs
}

/** 둥근 사각형(가로세로비 aspect, 모서리 비율 rr = r / 짧은 변의 절반)의 변위 맵 데이터 URL */
function roundedRectMap(aspect: number, rr: number, band: number): string {
  const H = 128
  const W = Math.max(16, Math.round(H * aspect))
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const ctx = c.getContext("2d")!
  const img = ctx.createImageData(W, H)
  const hw = W / 2
  const hh = H / 2
  const r = rr * Math.min(hw, hh)
  const bandPx = band * Math.min(W, H)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const px = x + 0.5 - hw
      const py = y + 0.5 - hh
      // 둥근 사각형 부호 거리
      const qx = Math.abs(px) - (hw - r)
      const qy = Math.abs(py) - (hh - r)
      const ox = Math.max(qx, 0)
      const oy = Math.max(qy, 0)
      const d = Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
      // 기울기(바깥 방향 법선)
      let gx: number
      let gy: number
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(ox, oy) || 1
        gx = (ox / l) * Math.sign(px)
        gy = (oy / l) * Math.sign(py)
      } else if (qx > qy) {
        gx = Math.sign(px)
        gy = 0
      } else {
        gx = 0
        gy = Math.sign(py)
      }
      const depth = -d
      const m = depth <= 0 ? 0 : depth >= bandPx ? 0 : Math.pow(1 - depth / bandPx, 2)
      const i = (y * W + x) * 4
      img.data[i] = 128 - gx * m * 127
      img.data[i + 1] = 128 - gy * m * 127
      img.data[i + 2] = 128
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL()
}

function chromaticFilter(id: string, href: string, scale: number, units: "objectBoundingBox" | "userSpaceOnUse", size: { w: number; h: number } | null, quality: GlassQuality): SVGFilterElement {
  const f = document.createElementNS(SVG_NS, "filter")
  f.setAttribute("id", id)
  f.setAttribute("color-interpolation-filters", "sRGB")
  if (units === "objectBoundingBox") {
    f.setAttribute("filterUnits", "objectBoundingBox")
    f.setAttribute("primitiveUnits", "objectBoundingBox")
    f.setAttribute("x", "0")
    f.setAttribute("y", "0")
    f.setAttribute("width", "1")
    f.setAttribute("height", "1")
  } else {
    f.setAttribute("filterUnits", "userSpaceOnUse")
    f.setAttribute("primitiveUnits", "userSpaceOnUse")
    f.setAttribute("x", "0")
    f.setAttribute("y", "0")
    f.setAttribute("width", String(size!.w))
    f.setAttribute("height", String(size!.h))
  }
  const fe = document.createElementNS(SVG_NS, "feImage")
  fe.setAttribute("href", href)
  fe.setAttribute("x", "0")
  fe.setAttribute("y", "0")
  fe.setAttribute("width", units === "objectBoundingBox" ? "1" : String(size!.w))
  fe.setAttribute("height", units === "objectBoundingBox" ? "1" : String(size!.h))
  fe.setAttribute("preserveAspectRatio", "none")
  fe.setAttribute("result", "map")
  f.appendChild(fe)
  const scales = quality === "full" ? [scale * 0.92, scale, scale * 1.08] : [scale]
  const channels = ["R", "G", "B"]
  if (scales.length === 1) {
    const d = document.createElementNS(SVG_NS, "feDisplacementMap")
    d.setAttribute("in", "SourceGraphic")
    d.setAttribute("in2", "map")
    d.setAttribute("scale", String(scale))
    d.setAttribute("xChannelSelector", "R")
    d.setAttribute("yChannelSelector", "G")
    f.appendChild(d)
    return f
  }
  scales.forEach((s, i) => {
    const d = document.createElementNS(SVG_NS, "feDisplacementMap")
    d.setAttribute("in", "SourceGraphic")
    d.setAttribute("in2", "map")
    d.setAttribute("scale", String(s))
    d.setAttribute("xChannelSelector", "R")
    d.setAttribute("yChannelSelector", "G")
    d.setAttribute("result", `d${i}`)
    f.appendChild(d)
    const m = document.createElementNS(SVG_NS, "feColorMatrix")
    m.setAttribute("in", `d${i}`)
    m.setAttribute("type", "matrix")
    // 이 변위 결과에서 채널 i만 남긴다
    const pick = channels.map((_, ch) => {
      const r = new Array(5).fill(0)
      if (ch === i) r[ch] = 1
      return r.join(" ")
    })
    m.setAttribute("values", `${pick[0]} ${pick[1]} ${pick[2]} 0 0 0 1 0`)
    m.setAttribute("result", `c${i}`)
    f.appendChild(m)
  })
  const b1 = document.createElementNS(SVG_NS, "feBlend")
  b1.setAttribute("in", "c0")
  b1.setAttribute("in2", "c1")
  b1.setAttribute("mode", "screen")
  b1.setAttribute("result", "c01")
  f.appendChild(b1)
  const b2 = document.createElementNS(SVG_NS, "feBlend")
  b2.setAttribute("in", "c01")
  b2.setAttribute("in2", "c2")
  b2.setAttribute("mode", "screen")
  f.appendChild(b2)
  return f
}

const rectCache = new Map<string, string>()
/** 비율은 로그 눈금(한 옥타브에 6칸), 모서리는 1/4 단위로 묶는다 */
function bucket(aspect: number, rr: number) {
  const a = Math.min(12, Math.max(1 / 12, aspect))
  return { aspect: Math.round(Math.pow(2, Math.round(Math.log2(a) * 6) / 6) * 1000) / 1000, rr: Math.round(Math.min(1, Math.max(0, rr)) * 4) / 4 }
}
const filterKey = (aspect: number, rr: number, q: GlassQuality) => `g-${aspect}-${rr}-${q}`.replace(/\./g, "_")
function makeRectFilter(aspect: number, rr: number, quality: GlassQuality): void {
  const key = filterKey(aspect, rr, quality)
  if (rectCache.has(key)) return
  ensureDefs().appendChild(chromaticFilter(key, roundedRectMap(aspect, rr, 0.28), 0.07, "objectBoundingBox", null, quality))
  rectCache.set(key, key)
}

/** 재생 중 처음 쓰일 때 만들면 프레임이 멈칫하므로, 쉬는 시간에 미리 만들어 둔다 */
export async function warmGlass(quality: GlassQuality): Promise<void> {
  if (quality === "off") return
  const jobs: [number, number][] = []
  for (let l = Math.round(Math.log2(0.4) * 6); l <= Math.round(Math.log2(9) * 6); l++)
    for (const rr of [1, 0.75, 0.5, 0.25]) jobs.push([Math.round(Math.pow(2, l / 6) * 1000) / 1000, rr])
  const idle = () => new Promise<void>((r) => ("requestIdleCallback" in window ? requestIdleCallback(() => r(), { timeout: 200 }) : setTimeout(r, 16)))
  while (jobs.length) {
    await idle()
    for (const [a, rr] of jobs.splice(0, 3)) makeRectFilter(a, rr, quality)
  }
}
/** 크기에 맞는 둥근 사각형 유리 필터 id. 비율·모서리를 구간으로 묶어 캐시(같은 입력 → 같은 출력) */
export function rectGlassFilter(w: number, h: number, radius: number, quality: GlassQuality): string | null {
  if (quality === "off" || w < 4 || h < 4) return null
  const { aspect, rr } = bucket(w / h, radius / (Math.min(w, h) / 2))
  const key = filterKey(aspect, rr, quality)
  if (!rectCache.has(key)) {
    makeRectFilter(aspect, rr, quality)
  }
  return `url(#${key})`
}

export type GlyphGlass = { mask: string; rim: string; filter: string | null; size: number }

/** 글자 하나의 거리장 → 변위 맵, 마스크(글자 모양), 테두리 하이라이트 */
export function glyphGlass(ch: string, font: string, size: number, quality: GlassQuality, idx: number): GlyphGlass {
  const c = document.createElement("canvas")
  c.width = size
  c.height = size
  const ctx = c.getContext("2d", { willReadFrequently: true })!
  ctx.font = font
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#fff"
  ctx.fillText(ch, size / 2, size / 2 + size * 0.04)
  const src = ctx.getImageData(0, 0, size, size)
  const mask = c.toDataURL()
  const N = size * size
  const INF = 1e9
  // 안쪽 거리(가장 가까운 바깥 픽셀까지) — 2패스 챔퍼(3-4)
  const dist = new Float32Array(N)
  for (let i = 0; i < N; i++) dist[i] = src.data[i * 4 + 3] > 127 ? INF : 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? 0 : dist[y * size + x])
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      if (dist[i] === 0) continue
      dist[i] = Math.min(dist[i], at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4)
    }
  for (let y = size - 1; y >= 0; y--)
    for (let x = size - 1; x >= 0; x--) {
      const i = y * size + x
      if (dist[i] === 0) continue
      dist[i] = Math.min(dist[i], at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4)
    }
  const band = size * 0.075 * 3
  const map = ctx.createImageData(size, size)
  const rim = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const d = dist[i]
      const o = i * 4
      map.data[o + 2] = 128
      map.data[o + 3] = 255
      if (d === 0) {
        map.data[o] = 128
        map.data[o + 1] = 128
        continue
      }
      // 거리 증가 방향(안쪽)의 반대 = 바깥 법선
      const gx = at(x + 1, y) - at(x - 1, y)
      const gy = at(x, y + 1) - at(x, y - 1)
      const l = Math.hypot(gx, gy) || 1
      const nx = -gx / l
      const ny = -gy / l
      const m = d >= band ? 0 : Math.pow(1 - d / band, 2)
      map.data[o] = 128 - nx * m * 127
      map.data[o + 1] = 128 - ny * m * 127
      // 위·왼쪽을 향한 가장자리에만 얇은 하이라이트
      if (d <= 7) {
        const facing = Math.max(0, -nx * 0.5 - ny * 0.85)
        const edge = 1 - d / 7
        rim.data[o] = rim.data[o + 1] = rim.data[o + 2] = 255
        rim.data[o + 3] = Math.round(255 * Math.min(1, 0.25 + facing) * edge * 0.9)
      }
    }
  ctx.putImageData(map, 0, 0)
  const mapUrl = c.toDataURL()
  ctx.putImageData(rim, 0, 0)
  const rimUrl = c.toDataURL()
  let filter: string | null = null
  if (quality !== "off") {
    const id = `glyph-${idx}-${quality}`
    ensureDefs().appendChild(chromaticFilter(id, mapUrl, quality === "full" ? 34 : 28, "userSpaceOnUse", { w: size, h: size }, quality))
    filter = `url(#${id})`
  }
  return { mask, rim: rimUrl, filter, size }
}

/** 고(goo) 필터: 흐림 + 알파 문턱으로 도형을 합치고, 원본을 그 위에 선명하게 얹는다 */
export function gooFilter(id: string, blur: number): string {
  const f = document.createElementNS(SVG_NS, "filter")
  f.setAttribute("id", id)
  f.setAttribute("x", "-20%")
  f.setAttribute("y", "-20%")
  f.setAttribute("width", "140%")
  f.setAttribute("height", "140%")
  f.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="b"/>` +
    `<feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g"/>` +
    `<feComposite in="SourceGraphic" in2="g" operator="atop"/>`
  ensureDefs().appendChild(f)
  return `url(#${id})`
}
