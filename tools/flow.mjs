// 장면이 넘어가는 흐름 검사: 실제 재생 시간 1/30초 간격으로 프레임 변화량을 재서
//  - 멈춤: 0.25초 넘게 아무것도 안 움직이는 구간
//  - 튐: 한 프레임만 변화가 이웃의 2.5배 넘게 큰 곳(요소 바꿔치기·잘림)
//  - 급출발: 거의 정지 상태에서 다음 프레임에 큰 변화
import { chromium } from "playwright"
import { writeFileSync, mkdirSync } from "node:fs"
const URL_ = process.env.SITE_URL || "http://localhost:5180/"
const FPS = Number(process.env.FPS || 30)
mkdirSync(`verify-output/${process.env.FLOWDIR || "flow"}`, { recursive: true })
const br = await chromium.launch()
const p = await br.newPage({ viewport: { width: 960, height: 600 } })
await p.goto(URL_, { waitUntil: "load" })
await p.evaluate(() => window.owndStory.ready)
await p.waitForTimeout(200)
await p.evaluate(() => window.owndStory.pause())
await p.waitForTimeout(2500)
const dur = await p.evaluate(() => window.owndStory.duration)
const N = Math.floor(dur * FPS)
// 다른 탭에서 한 장씩 축소해 직전 프레임과 비교(메모리에는 축소본 하나만)
const calc = await br.newPage()
await calc.evaluate(() => {
  const W = 120, H = 75
  const c = new OffscreenCanvas(W, H), g = c.getContext("2d", { willReadFrequently: true })
  let prev = null
  window.__diff = async (b64) => {
    const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob())
    g.drawImage(bmp, 0, 0, W, H)
    const d = g.getImageData(0, 0, W, H).data
    let s = -1
    if (prev) { s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); s /= W * H * 3 * 255 }
    prev = d
    return s
  }
})
const shots = []
const diffs = []
const keep = new Map()
for (let k = 0; k <= N; k++) {
  const beat = await p.evaluate((s) => window.owndStory.beatAt(s), k / FPS)
  await p.evaluate((t) => window.owndStory.seek(t), beat)
  const png = (await p.locator("#stage-wrap").screenshot()).toString("base64")
  const d = await calc.evaluate((x) => window.__diff(x), png)
  if (d >= 0) diffs.push(d)
  shots.push({ k, beat })
  keep.set(k, png)
  keep.delete(k - 3)
  // 튐 후보는 바로 저장
  if (diffs.length >= 2) {
    const i = diffs.length - 2
    const nb = Math.max(diffs[i - 1] ?? 0, diffs[i + 1])
    if (diffs[i] > 0.004 && diffs[i] > 2.5 * nb) {
      writeFileSync(`verify-output/${process.env.FLOWDIR || "flow"}/pop-${shots[i + 1].beat.toFixed(2)}-a.png`, Buffer.from(keep.get(i) ?? "", "base64"))
      writeFileSync(`verify-output/${process.env.FLOWDIR || "flow"}/pop-${shots[i + 1].beat.toFixed(2)}-b.png`, Buffer.from(keep.get(i + 1) ?? "", "base64"))
    }
  }
}
const beatOf = (i) => shots[i].beat.toFixed(2)
const STILL = 0.0004
const dead = []
let run = null
diffs.forEach((d, i) => {
  if (d < STILL) { run = run ?? { from: i, to: i }; run.to = i }
  else { if (run && (run.to - run.from + 1) / FPS > 0.25) dead.push(run); run = null }
})
const pops = []
const starts = []
for (let i = 1; i < diffs.length - 1; i++) {
  const nb = Math.max(diffs[i - 1], diffs[i + 1])
  if (diffs[i] > 0.004 && diffs[i] > 2.5 * nb) pops.push(i)
  const before = Math.max(diffs[i - 1], diffs[i - 2] ?? 0)
  if (before < STILL && diffs[i] > 0.006) starts.push(i)
}
console.log(`duration ${dur.toFixed(1)}s, frames ${diffs.length}`)
console.log("멈춤:", dead.map((r) => `${(r.from / FPS).toFixed(2)}s~${((r.to + 1) / FPS).toFixed(2)}s (beat ${beatOf(r.from)}~${beatOf(r.to + 1)})`).join(" | ") || "없음")
console.log("튐:", pops.map((i) => `${((i + 1) / FPS).toFixed(2)}s beat ${beatOf(i + 1)} (${diffs[i].toFixed(4)} vs ${Math.max(diffs[i - 1], diffs[i + 1]).toFixed(4)})`).join(" | ") || "없음")
console.log("급출발:", starts.map((i) => `${((i + 1) / FPS).toFixed(2)}s beat ${beatOf(i + 1)} (${diffs[i].toFixed(4)})`).join(" | ") || "없음")
writeFileSync("verify-output/flow.json", JSON.stringify({ FPS, diffs, beats: shots.map((s) => s.beat) }))
await br.close()
