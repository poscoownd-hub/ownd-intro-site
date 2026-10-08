// 지정한 비트들의 무대 프레임을 PNG로 저장(눈으로 확인용). 사용: node tools/frames.mjs 0 4.3 9.8 ...
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const URL_ = process.env.SITE_URL || "http://localhost:5180/"
const OUT = fileURLToPath(new URL(`../verify-output/${process.env.BATCH || "frames"}/`, import.meta.url))
mkdirSync(OUT, { recursive: true })
const beats = process.argv.slice(2).map(Number)
const browser = await chromium.launch()
const [VW, VH] = (process.env.VP || "1440x900").split("x").map(Number)
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 })
const logs = []
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(m.text()) })
page.on("pageerror", (e) => logs.push("PAGEERROR " + e.message))
await page.goto(URL_, { waitUntil: "load" })
await page.evaluate(() => window.owndStory.ready)
await page.waitForTimeout(150)
await page.evaluate(() => window.owndStory.pause())
const stage = page.locator("#stage")
for (const b of beats) {
  await page.evaluate((t) => window.owndStory.seek(t), b)
  await page.waitForTimeout(60)
  await stage.screenshot({ path: `${OUT}b${String(b).padStart(5, "0")}.png` })
}
console.log(logs.join("\n") || "no console errors")
await browser.close()
