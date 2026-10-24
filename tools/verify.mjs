// 소개 웹사이트 검증. 개발 서버(기본 http://localhost:5180)가 떠 있어야 한다.
// 사용: node tools/verify.mjs   → verify-output/report.md, verify-output/beats/*.png
import { chromium } from "playwright"
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { irisBlades, bladeCentroidsOutside } from "../src/iris.ts"

const SITE = process.env.SITE_URL || "http://localhost:5180/"
const ROOT = fileURLToPath(new URL("..", import.meta.url))
const OUT = join(ROOT, "verify-output")
mkdirSync(join(OUT, "beats"), { recursive: true })
const results = []
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`)
}

// 1) 조리개: 모든 열림 정도에서 짧은 호만 쓰고 날이 구멍 밖에 있는지
{
  let bad = 0
  for (let i = 0; i <= 400; i++) {
    const a = (470 * i) / 400
    const rot = 0.6 * (1 - a / 470)
    if (irisBlades(720, 720, 470, a, rot).some((b) => b.largeArc !== 0 || !/A[\d.]+ [\d.]+ 0 0 0 /.test(b.d))) bad++
    if (!bladeCentroidsOutside(720, 720, 470, a, rot)) bad++
  }
  ok("조리개 날 6개: 짧은 호만 사용, 긴 호 뒤집힘 없음(401단계)", bad === 0, bad ? `${bad}건` : "")
}

// 2) 소스·빌드 결과에 비밀값 형태가 없는지
{
  const pats = [/AIza[0-9A-Za-z_\-]{20,}/, /sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["'][^"']{8,}["']/i]
  const hits = []
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      if (["node_modules", "verify-output", ".git"].includes(f)) continue
      const p = join(d, f)
      const st = statSync(p)
      if (st.isDirectory()) walk(p)
      else if (/\.(ts|mjs|js|html|css|json|md|svg)$/.test(f) && st.size < 2_000_000) {
        const s = readFileSync(p, "utf8")
        for (const re of pats) if (re.test(s)) hits.push(`${p.replace(ROOT, "")} ~ ${re}`)
      }
    }
  }
  walk(ROOT)
  ok("소스·빌드에 비밀값(키·토큰·비밀번호) 형태 없음", hits.length === 0, hits.join(", "))
}

// 3) 색 대비(본문 배경 #F2EFE9 / 종이 #FBFAF7)
{
  const lum = (hex) => {
    const c = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const pairs = [["본문", "#111111", "#F2EFE9"], ["보조 글자", "#6B6862", "#F2EFE9"], ["개발 중 태그", "#7A5410", "#FBF3DB"], ["시연 화면 태그", "#245F80", "#E7F3F8"], ["연결 예정 태그", "#4F4D48", "#EBE9E4"], ["무대 상태 글자", "#6B6862", "#FBFAF7"]]
  const low = pairs.map(([n, f, b]) => [n, ratio(f, b)]).filter(([, r]) => r < 4.5)
  ok("글자 대비 4.5:1 이상(본문·태그·보조 글자)", low.length === 0, pairs.map(([n, f, b]) => `${n} ${ratio(f, b).toFixed(1)}`).join(", "))
}

const browser = await chromium.launch()
const external = new Set()
const consoleErrors = []
const watch = (page) => {
  page.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && !u.protocol.startsWith("data")) external.add(u.origin) })
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()) })
  page.on("pageerror", (e) => consoleErrors.push(e.message))
}
const open = async (opts, { play = false } = {}) => {
  const page = await browser.newPage(opts)
  watch(page)
  await page.goto(SITE, { waitUntil: "load" })
  await page.evaluate(() => window.owndStory.ready)
  await page.waitForTimeout(150)
  if (!play) await page.evaluate(() => window.owndStory.pause())
  return page
}
const seekShot = async (page, t) => {
  await page.evaluate((x) => window.owndStory.seek(x), t)
  return page.locator("#stage").screenshot()
}

// 4) 데스크톱·모바일: 가로 넘침, 안전 영역, 줄바꿈 규칙
for (const [name, opts] of [["데스크톱 1440×900", { viewport: { width: 1440, height: 900 } }], ["태블릿 820×1180", { viewport: { width: 820, height: 1180 } }], ["모바일 375×667", { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }]]) {
  const page = await open(opts)
  const m = await page.evaluate(() => {
    const de = document.documentElement
    const wide = [...document.querySelectorAll("main section:not(#film) *:not(.gallery *), .gallery, .topbar, .foot *, .player *")].filter((e) => e.getBoundingClientRect().right > de.clientWidth + 1).map((e) => e.tagName + "." + e.className).slice(0, 5)
    return { sw: de.scrollWidth, cw: de.clientWidth, wide, keepAll: getComputedStyle(document.body).wordBreak, fit: document.querySelector('meta[name=viewport]').content.includes("viewport-fit=cover") }
  })
  ok(`${name}: 가로 넘침 없음`, m.sw <= m.cw && m.wide.length === 0, `scrollWidth ${m.sw} / ${m.cw}${m.wide.length ? " · " + m.wide.join(", ") : ""}`)
  ok(`${name}: 한글 단어 단위 줄바꿈(keep-all)·안전 영역(viewport-fit=cover)`, m.keepAll === "keep-all" && m.fit)
  await page.screenshot({ path: join(OUT, `layout-${name.split(" ")[0]}.png`) })

  // 장 버튼: 누르면 그 장의 시작 장면으로 이동 / 상단 내비: 섹션 제목이 상단 바 아래에 보임
  const chapterFails = []
  const starts = [0, 12, 24.4, 34, 42]
  const chaps = await page.$$(".chap")
  for (const [i, b] of chaps.entries()) {
    await b.click()
    await page.waitForTimeout(200)
    const t = Number(await page.evaluate(() => document.getElementById("stage").dataset.t))
    const cur = await b.getAttribute("aria-current")
    if (Math.abs(t - starts[i]) > 0.05 || cur !== "true") chapterFails.push(`${i}(t=${t}, current=${cur})`)
  }
  ok(`${name}: 장 버튼 5개로 해당 장면 이동`, chapterFails.length === 0, chapterFails.join("; "))
  // 자막 카드가 영상 장면·재생 막대와 겹치지 않음(장면 몇 곳)
  const overlap = []
  for (const t of [3.2, 18, 26.3, 41.5, 47.6]) {
    await page.evaluate((x) => window.owndStory.seek(x), t)
    const r = await page.evaluate(() => {
      const c = document.querySelector(".cap-card").getBoundingClientRect()
      const p = document.querySelector(".player").getBoundingClientRect()
      const s = document.getElementById("stage-wrap").getBoundingClientRect()
      return { cardBottom: c.bottom, cardTop: c.top, cardLeft: c.left, cardRight: c.right, playerTop: p.top, sTop: s.top, sRight: s.right }
    })
    if (r.cardBottom > r.playerTop + 1 || r.cardTop < r.sTop - 1 || r.cardRight > r.sRight + 1) overlap.push(t)
  }
  ok(`${name}: 자막 카드가 영상 안에 들어가고 재생 막대와 겹치지 않음`, overlap.length === 0, overlap.join(", "))
  const navFails = []
  for (const id of ["public", "search", "data", "apps", "community", "expand"]) {
    await page.click(`.nav a[href="#${id}"]`)
    await page.waitForTimeout(900)
    const r = await page.evaluate((i) => {
      const el = document.getElementById(i)
      const h = (el.querySelector("h2") ?? el).getBoundingClientRect()
      return { top: h.top, bar: document.querySelector(".topbar").getBoundingClientRect().bottom, vh: innerHeight }
    }, id)
    if (r.top < r.bar - 2 || r.top > r.vh) navFails.push(`${id}(${Math.round(r.top)} vs ${Math.round(r.bar)})`)
  }
  ok(`${name}: 상단 내비 6개 이동`, navFails.length === 0, navFails.join("; "))
  await page.close()
}

// 5) 54비트 프레임(비트마다 한 장) + 결정론(순서를 바꿔 다시 찍어 비교)
{
  const page = await open({ viewport: { width: 1440, height: 900 } })
  const frames = []
  for (let b = 0; b < 54; b++) {
    const buf = await seekShot(page, b)
    writeFileSync(join(OUT, "beats", `beat-${String(b).padStart(2, "0")}.png`), buf)
    frames.push(buf)
  }
  ok("54비트 프레임 캡처", frames.length === 54, "verify-output/beats/")
  // 결정론: (1) 보이는 요소의 DOM 상태가 정확히 같고 (2) 픽셀은 안티앨리어싱 수준 이내
  const state = () => page.evaluate(() => {
    const out = []
    const vis = (e) => !e.closest(".st-hide") && e.checkVisibility({ visibilityProperty: true })
    document.querySelectorAll("#stage *").forEach((e) => {
      if (!vis(e)) return
      const attrs = [...e.attributes].filter((a) => a.name !== "class").map((a) => `${a.name}=${a.value}`).join(";")
      out.push(`${e.tagName}|${attrs}|${e.childNodes[0]?.nodeType === 3 ? e.textContent : ""}`)
    })
    return out.join("\n")
  })
  const pix = (A, B) => page.evaluate(async ([a, b]) => {
    const load = async (s) => createImageBitmap(await (await fetch("data:image/png;base64," + s)).blob())
    const [x, y] = [await load(a), await load(b)]
    const c = new OffscreenCanvas(x.width, x.height), g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(x, 0, 0); const da = g.getImageData(0, 0, x.width, x.height).data
    g.clearRect(0, 0, x.width, x.height); g.drawImage(y, 0, 0); const db = g.getImageData(0, 0, x.width, x.height).data
    let max = 0, n = 0
    for (let i = 0; i < da.length; i += 4) { const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]); if (d) { n++; max = Math.max(max, d) } }
    return { max, n }
  }, [A.toString("base64"), B.toString("base64")])
  const order = [37, 5, 52, 0, 23, 44, 11, 30, 48, 17, 53, 2, 26, 41, 8]
  const ts = [3.37, 49.12, 12.88, 28.41, 45.5, 21.7, 33.03]
  const ref = new Map()
  for (const t of [...order, ...ts]) { const buf = await seekShot(page, t); ref.set(t, { buf, st: await state() }) }
  const domBad = [], pixBad = []
  let worst = 0, aaPixels = 0
  for (const t of [...ts.reverse(), ...order.reverse()]) {
    await seekShot(page, 53 - t) // 다른 시간에 들렀다가
    const buf = await seekShot(page, t)
    if ((await state()) !== ref.get(t).st) domBad.push(t)
    const d = await pix(buf, ref.get(t).buf)
    worst = Math.max(worst, d.max); aaPixels += d.n
    if (d.max > 24) pixBad.push(`${t}(최대 ${d.max})`)
  }
  ok("결정론: 순서를 바꿔 같은 시간으로 이동 → 보이는 요소의 DOM 상태 동일", domBad.length === 0, domBad.length ? `다름: ${domBad.join(", ")}` : `${order.length + ts.length}개 시점`)
  ok("결정론: 픽셀 차이는 안티앨리어싱 수준 이내(픽셀당 RGB 합 ≤ 24/765)", pixBad.length === 0, pixBad.length ? pixBad.join(", ") : `최대 ${worst}/765, 경계 픽셀 ${aaPixels}개`)

  // 6) 실제 재생 시간 1/15초 간격 프레임 차이 → 이웃의 3배를 넘는 고립된 급변 표시
  const step = 1 / 15
  const dur = await page.evaluate(() => window.owndStory.duration)
  const small = []
  await page.setViewportSize({ width: 720, height: 450 })
  await page.evaluate(() => window.dispatchEvent(new Event("resize")))
  const beatOf = (sec) => page.evaluate((x) => window.owndStory.beatAt(x), sec)
  for (let k = 0; k * step < dur; k++) small.push((await seekShot(page, await beatOf(k * step))).toString("base64"))
  const diffs = await page.evaluate(async (list) => {
    const W = 96
    const c = new OffscreenCanvas(W, W)
    const ctx = c.getContext("2d", { willReadFrequently: true })
    const px = []
    for (const b64 of list) {
      const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob())
      ctx.drawImage(bmp, 0, 0, W, W)
      px.push(ctx.getImageData(0, 0, W, W).data)
    }
    const d = []
    for (let i = 1; i < px.length; i++) {
      let s = 0
      for (let j = 0; j < px[i].length; j += 4) s += Math.abs(px[i][j] - px[i - 1][j]) + Math.abs(px[i][j + 1] - px[i - 1][j + 1]) + Math.abs(px[i][j + 2] - px[i - 1][j + 2])
      d.push(s / (W * W * 3 * 255))
    }
    return d
  }, small)
  const flagged = []
  for (let i = 1; i < diffs.length - 1; i++) {
    const nb = (diffs[i - 1] + diffs[i + 1]) / 2
    if (diffs[i] > 0.02 && diffs[i] > 3 * Math.max(nb, 0.002)) flagged.push({ t: ((i + 1) * step).toFixed(2), d: diffs[i].toFixed(3), nb: nb.toFixed(3) })
  }
  writeFileSync(join(OUT, "diffs.json"), JSON.stringify({ step, diffs, flagged }, null, 1))
  for (const f of flagged) {
    const t = Number(f.t)
    writeFileSync(join(OUT, `spike-${f.t}-before.png`), await seekShot(page, await beatOf(t - step)))
    writeFileSync(join(OUT, `spike-${f.t}-after.png`), await seekShot(page, await beatOf(t)))
  }
  ok("프레임 차이 급변 검사(재생 1/15초 간격, 이웃의 3배 초과)", true, flagged.length ? `수동 확인 대상 ${flagged.length}건: ${flagged.map((f) => `${f.t}(${f.d} vs ${f.nb})`).join(", ")}` : "급변 없음")
  await page.close()
}

// 7) 동작 줄이기 설정에서도 자동 재생, 별도 재생 제어 버튼 없음
{
  const page = await open({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }, { play: true })
  await page.waitForTimeout(1200)
  const t0 = await page.evaluate(() => document.getElementById("stage").dataset.t)
  await page.evaluate(() => window.owndStory.pause())
  await page.click(".chap >> nth=3")
  await page.waitForTimeout(300)
  const r = await page.evaluate(() => ({
    t: document.getElementById("stage").dataset.t,
    controlsAbsent: !document.querySelector("#ctl-play, #ctl-replay"),
    sections: ["keys", "public", "search", "data", "apps", "community", "expand", "status"].every((i) => document.getElementById(i).innerText.length > 50),
  }))
  await page.waitForTimeout(800)
  const t2 = await page.evaluate(() => document.getElementById("stage").dataset.t)
  ok("동작 줄이기: 자동 재생, 장 이동, 제어 버튼 없음, 아래 내용 그대로", Number(t0) > 0 && r.t === "34.000" && t2 === r.t && r.controlsAbsent && r.sections, `처음 t=${t0}, 4장 t=${r.t}`)
  await page.screenshot({ path: join(OUT, "reduced-motion.png") })
  await page.close()
}

// 8) 자동 재생: 들어오면 재생, 일시정지·이어 재생·다시 보기, 화면 밖이면 멈춤, 실제 시간 속도
{
  const page = await open({ viewport: { width: 1440, height: 900 } }, { play: true })
  const sec = () => page.evaluate(() => Number(document.getElementById("stage-wrap").dataset.sec))
  const a = await sec()
  await page.waitForTimeout(2000)
  const b = await sec()
  await page.evaluate(() => window.owndStory.pause())
  await page.waitForTimeout(150)
  const c = await sec()
  await page.waitForTimeout(800)
  const d = await sec()
  await page.reload({ waitUntil: "load" })
  await page.evaluate(() => window.owndStory.ready)
  await page.waitForTimeout(800)
  const e = await sec()
  await page.reload({ waitUntil: "load" })
  await page.evaluate(() => window.owndStory.ready)
  await page.waitForTimeout(200)
  const f = await sec()
  await page.evaluate(() => document.getElementById("status").scrollIntoView({ behavior: "instant" }))
  await page.waitForTimeout(400)
  const g = await sec()
  await page.waitForTimeout(1000)
  const h = await sec()
  const speed = (b - a) / 2
  ok("자동 재생: 바로 재생, 실제 시간 속도(1초 ≈ 1초)", speed > 0.8 && speed < 1.2, `2초 동안 ${(b - a).toFixed(2)}초 진행 · 전체 ${(await page.evaluate(() => window.owndStory.duration)).toFixed(1)}초`)
  ok("검증용 일시정지·새로고침 후 자동 재생", Math.abs(c - d) < 1e-6 && e > 0.5 && f < 0.5, `정지 ${c.toFixed(2)}→${d.toFixed(2)}, 새로고침 후 ${e.toFixed(2)}, 처음부터 ${f.toFixed(2)}`)
  ok("화면 밖으로 나가면 재생을 멈춤", Math.abs(g - h) < 1e-6, `${g.toFixed(2)}→${h.toFixed(2)}`)
  const keyboard = await page.evaluate(() => [...document.querySelectorAll("a[href], button")].every((x) => x.tabIndex >= 0))
  ok("링크·버튼 키보드 접근 가능, 무대는 aria-hidden, 자막은 화면 읽기용 목록으로 제공", keyboard && (await page.getAttribute("#stage", "aria-hidden")) === "true" && (await page.$$eval("#film ol.sr-only li", (l) => l.length)) === 10)
  await page.close()
}

// 9) 끝 장면의 시작하기 → 시작 섹션, 준비 전 버튼은 이동하지 않고 안내만
{
  const page = await open({ viewport: { width: 1440, height: 900 } })
  const hidden = await page.evaluate(async () => { await window.owndStory.seek(30); return getComputedStyle(document.getElementById("film-cta")).visibility })
  const r = await page.evaluate(async () => {
    await window.owndStory.seek(51.6)
    const a = document.getElementById("film-cta").getBoundingClientRect()
    const c = document.querySelector(".cap-card").getBoundingClientRect()
    return { vis: getComputedStyle(document.getElementById("film-cta")).visibility, inCard: a.left >= c.left && a.right <= c.right && a.top >= c.top && a.bottom <= c.bottom + 1 }
  })
  await page.click("#film-cta")
  await page.waitForTimeout(900)
  const startTop = await page.evaluate(() => document.getElementById("h-start").getBoundingClientRect().top)
  const url0 = page.url()
  await page.click("[data-start=ios]", { force: true })
  await page.waitForTimeout(200)
  const note = await page.textContent("#start-note")
  ok("영상 끝 ‘시작하기’ → 시작 섹션, 스토어·웹 버튼은 준비 전 안내(가짜 링크 없음)", hidden === "hidden" && r.vis === "visible" && r.inCard && startTop > 0 && startTop < 900 && page.url() === url0 && /출시 전/.test(note), `평소 ${hidden}, 끝 장면 ${r.vis}, 카드 안 ${r.inCard}, 안내: ${note}`)
  await page.screenshot({ path: join(OUT, "start.png") })
  await page.close()
}

ok("외부 호스트 요청 없음", external.size === 0, [...external].join(", "))
ok("콘솔 오류 없음", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "))
await browser.close()

const md = [`# 소개 웹사이트 검증 결과`, ``, `실행: ${new Date().toISOString()} · 대상 ${SITE}`, ``, ...results.map((r) => `- ${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`), ``].join("\n")
writeFileSync(join(OUT, "report.md"), md)
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} 통과 → verify-output/report.md`)
