// 실제 자동 재생을 돌리며 프레임 간격(ms)과 긴 작업을 기록. 어느 재생 시점(초)에서 끊기는지 찾는다.
import { chromium } from "playwright"
const URL_ = process.env.SITE_URL || "http://localhost:5180/"
const [VW, VH] = (process.env.VP || "1440x900").split("x").map(Number)
const SECS = Number(process.env.SECS || 60)
const b = await chromium.launch({ args: ["--enable-gpu-rasterization", "--ignore-gpu-blocklist"] })
const p = await b.newPage({ viewport: { width: VW, height: VH } })
await p.goto(URL_, { waitUntil: "load" })
await p.evaluate(() => window.owndStory.ready)
const data = await p.evaluate(async (secs) => {
  const frames = []
  const longs = []
  new PerformanceObserver((l) => l.getEntries().forEach((e) => longs.push({ at: e.startTime, d: e.duration }))).observe({ type: "longtask", buffered: true })
  const wrap = document.getElementById("stage-wrap")
  let last = performance.now()
  await new Promise((done) => {
    const end = last + secs * 1000
    const f = (now) => {
      frames.push({ dt: now - last, sec: Number(wrap.dataset.sec), t: Number(document.getElementById("stage").dataset.t) })
      last = now
      if (now < end) requestAnimationFrame(f)
      else done()
    }
    requestAnimationFrame(f)
  })
  return { frames, longs }
}, SECS)
const fr = data.frames.slice(5)
const dts = fr.map((f) => f.dt).sort((a, b) => a - b)
const q = (x) => dts[Math.floor(dts.length * x)].toFixed(1)
console.log(`frames ${fr.length}, median ${q(0.5)}ms, p95 ${q(0.95)}ms, p99 ${q(0.99)}ms, max ${dts[dts.length - 1].toFixed(1)}ms`)
const bad = fr.filter((f) => f.dt > 40)
const buckets = {}
for (const f of bad) { const k = Math.floor(f.t); buckets[k] = (buckets[k] || 0) + 1 }
console.log("slow frames (>40ms) by beat:", JSON.stringify(buckets))
console.log("worst:", fr.slice().sort((a, b) => b.dt - a.dt).slice(0, 12).map((f) => `${f.dt.toFixed(0)}ms@beat${f.t.toFixed(2)}`).join(" "))
console.log("long tasks:", data.longs.length, data.longs.slice(0, 10).map((l) => l.d.toFixed(0)).join(","))
await b.close()
