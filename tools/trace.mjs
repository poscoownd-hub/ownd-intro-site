// 실제 화면에 나간 프레임 기준으로 끊김(드롭 프레임)을 찾는다. Chromium 트레이싱 사용.
import { chromium } from "playwright"
import { readFileSync, writeFileSync } from "node:fs"
const URL_ = process.env.SITE_URL || "http://localhost:5180/"
const SECS = Number(process.env.SECS || 58)
const OUT = "verify-output/trace.json"
const b = await chromium.launch({ headless: true })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
await p.goto(URL_, { waitUntil: "load" })
await p.evaluate(() => window.owndStory.ready)
await p.evaluate(() => window.owndStory.pause())
await p.waitForTimeout(3000) // 미리 불러오기·유리 필터 준비
// 시간→비트 기록용
await p.evaluate(() => { window.__marks = []; const w = document.getElementById("stage-wrap"); const f = () => { window.__marks.push([performance.now(), Number(document.getElementById("stage").dataset.t)]); requestAnimationFrame(f) }; requestAnimationFrame(f) })
await b.startTracing(p, { path: OUT, categories: ["disabled-by-default-devtools.timeline.frame", "devtools.timeline", "disabled-by-default-devtools.timeline", "benchmark", "cc", "viz"] })
await p.click(".chap >> nth=0")
await p.click("#ctl-play")
await p.waitForTimeout(SECS * 1000)
await b.stopTracing()
const marks = await p.evaluate(() => window.__marks)
await b.close()
const ev = JSON.parse(readFileSync(OUT, "utf8")).traceEvents ?? JSON.parse(readFileSync(OUT, "utf8"))
// 드롭·지연 프레임
const names = {}
for (const e of ev) if (/Frame|Drop|Pipeline/i.test(e.name)) names[e.name] = (names[e.name] || 0) + 1
console.log(JSON.stringify(names))
const dropped = ev.filter((e) => e.name === "DroppedFrame" || (e.name === "PipelineReporter" && e.args?.chrome_frame_reporter?.state === "STATE_DROPPED"))
// 렌더러 메인 스레드 긴 작업(페인트·레이아웃·스크립트)
const heavy = ev.filter((e) => e.ph === "X" && e.dur > 20000 && /Paint|Layout|FunctionCall|RasterTask|UpdateLayerTree|Layerize|Composite/.test(e.name))
const toBeat = (tsMs) => { let best = null; for (const [t, beat] of marks) { if (t <= tsMs) best = beat; else break } return best }
// trace ts(µs) ↔ performance.now(ms) 기준 맞추기: 첫 rAF 마크 이후 시작이라 근사로 상대 위치만 사용
const t0 = Math.min(...ev.filter((e) => e.ts > 0).map((e) => e.ts))
console.log("dropped:", dropped.length)
const byName = {}
for (const e of heavy) { byName[e.name] = byName[e.name] || []; byName[e.name].push(Math.round(e.dur / 1000)) }
for (const [n, d] of Object.entries(byName)) console.log(n, d.length, "max", Math.max(...d), "ms")
const dropTimes = dropped.map((e) => ((e.ts - t0) / 1e6).toFixed(2))
writeFileSync("verify-output/drops.json", JSON.stringify({ dropTimes, heavy: heavy.map((e) => [e.name, ((e.ts - t0) / 1e6).toFixed(2), Math.round(e.dur / 1000)]) }, null, 1))
console.log("drop seconds (from trace start):", dropTimes.slice(0, 60).join(" "))
console.log("heavy at:", heavy.slice(0, 40).map((e) => `${e.name}@${((e.ts - t0) / 1e6).toFixed(1)}s/${Math.round(e.dur / 1000)}ms`).join(" "))
