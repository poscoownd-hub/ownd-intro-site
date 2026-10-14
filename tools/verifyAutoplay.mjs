// 설정과 무관한 소개 영상 자동 재생 및 수동 제어 회귀 검사.
// 사용: SITE_URL=http://localhost:5180/ node tools/verifyAutoplay.mjs
import assert from "node:assert/strict"
import { chromium } from "playwright"

const browser = await chromium.launch()
try {
  for (const reducedMotion of ["reduce", "no-preference"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion })
    const errors = []
    page.on("pageerror", (e) => errors.push(e.message))
    await page.goto(process.env.SITE_URL || "http://localhost:5180/", { waitUntil: "load" })
    await page.evaluate(() => window.owndStory.ready)
    const sec = () => page.evaluate(() => Number(document.getElementById("stage-wrap").dataset.sec))
    await page.waitForTimeout(200)
    const first = await sec()
    await page.waitForTimeout(1000)
    assert.ok((await sec()) > first + 0.5, `${reducedMotion}: 자동 재생이 진행되어야 함`)
    assert.equal(await page.locator("#ctl-play, #ctl-replay").count(), 0, "재생 제어 버튼 없음")
    await page.evaluate(() => window.owndStory.pause())
    const paused = await sec()
    await page.waitForTimeout(300)
    assert.equal(await sec(), paused, "일시정지 유지")
    await page.click(".chap >> nth=3")
    await page.waitForTimeout(200)
    assert.equal(Number(await page.locator("#stage").getAttribute("data-t")), 34, "장 시작으로 이동")
    await page.reload({ waitUntil: "load" })
    await page.evaluate(() => window.owndStory.ready)
    await page.waitForTimeout(700)
    assert.ok((await sec()) > 0.3, "새로고침 후 자동 재생")
    await page.evaluate(() => document.getElementById("status").scrollIntoView({ behavior: "instant" }))
    await page.waitForTimeout(200)
    const outside = await sec()
    await page.waitForTimeout(300)
    assert.equal(await sec(), outside, "화면 밖에서 정지")
    assert.deepEqual(errors, [], "브라우저 실행 오류 없음")
    console.log(`PASS ${reducedMotion}: 자동 재생, 제어 버튼 없음, 장 이동, 새로고침 후 재생, 화면 밖 정지`)
    await page.close()
  }
} finally {
  await browser.close()
}
