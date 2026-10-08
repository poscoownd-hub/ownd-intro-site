// 무대 요소 상태(보이는 요소의 style·속성·글자)를 1/30초마다 비교해 "아무것도 안 바뀌는" 구간을 정확히 찾는다.
import { chromium } from "playwright"
const FPS = 30
const br = await chromium.launch()
const p = await br.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto(process.env.SITE_URL || "http://localhost:5180/", { waitUntil: "load" })
await p.evaluate(() => window.owndStory.ready)
await p.waitForTimeout(200)
await p.evaluate(() => window.owndStory.pause())
const res = await p.evaluate(async (FPS) => {
  const st = () => {
    const out = []
    document.querySelectorAll("#stage *, #film-cta").forEach((e) => {
      if (e.closest(".st-hide") || !e.checkVisibility({ visibilityProperty: true })) return
      out.push([...e.attributes].filter((a) => a.name !== "class").map((a) => a.value).join("|") + (e.childNodes[0]?.nodeType === 3 ? e.textContent : ""))
    })
    return out.join("\n")
  }
  const dur = window.owndStory.duration
  const n = Math.floor(dur * FPS)
  let prev = null
  const same = []
  const beats = []
  for (let k = 0; k <= n; k++) {
    const b = window.owndStory.beatAt(k / FPS)
    await window.owndStory.seek(b)
    const s = st()
    beats.push(b)
    same.push(prev !== null && s === prev)
    prev = s
  }
  return { same, beats, dur }
}, FPS)
const runs = []
let r = null
res.same.forEach((v, i) => { if (v) { r = r ?? { a: i - 1, b: i }; r.b = i } else { if (r) runs.push(r); r = null } })
if (r) runs.push(r)
const long = runs.filter((x) => (x.b - x.a) / FPS >= 0.2)
console.log(`duration ${res.dur.toFixed(1)}s`)
console.log("완전 정지(≥0.2초):", long.map((x) => `${(x.a / FPS).toFixed(2)}–${(x.b / FPS).toFixed(2)}s (beat ${res.beats[x.a].toFixed(2)}–${res.beats[x.b].toFixed(2)}, ${((x.b - x.a) / FPS).toFixed(2)}s)`).join("\n") || "없음")
await br.close()
