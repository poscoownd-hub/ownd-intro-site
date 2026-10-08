// 데스크톱·모바일 전체 페이지 스크린샷
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
const URL_ = process.env.SITE_URL || "http://localhost:5180/"
const OUT = fileURLToPath(new URL("../verify-output/pages/", import.meta.url))
mkdirSync(OUT, { recursive: true })
const b = await chromium.launch()
for (const [name, vp, extra] of [["desktop", { width: 1440, height: 900 }, {}], ["mobile", { width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const p = await b.newPage({ viewport: vp, ...extra })
  await p.goto(URL_, { waitUntil: "load" })
  await p.evaluate(() => window.owndStory.ready)
  await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}${name}-top.png` })
  for (const id of ["discover", "map", "status"]) {
    await p.evaluate((i) => document.getElementById(i).scrollIntoView({ behavior: "instant" }), id)
    await p.waitForTimeout(500)
    await p.screenshot({ path: `${OUT}${name}-${id}.png` })
  }
  await p.close()
}
await b.close()
