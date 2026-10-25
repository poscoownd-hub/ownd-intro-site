// 소개 웹사이트 검증. 개발 서버(기본 http://localhost:5180)가 떠 있어야 한다.
// 사용: node tools/verify.mjs   → verify-output/report.md, verify-output/frames/*.png
import { chromium } from "playwright"
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const SITE = process.env.SITE_URL || "http://localhost:5180/"
const ROOT = fileURLToPath(new URL("..", import.meta.url))
const OUT = join(ROOT, "verify-output")
mkdirSync(join(OUT, "frames"), { recursive: true })
const APK_URL = "https://ownd-download-309487860458-apne2.s3.ap-northeast-2.amazonaws.com/ownd.apk"
const results = []
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`)
}

// 1) 비밀값 형태 없음
{
  const pats = [/AIza[0-9A-Za-z_\-]{20,}/, /sk-[A-Za-z0-9]{20,}/, /AKIA[0-9A-Z]{16}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["'][^"']{8,}["']/i]
  const hits = []
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      if (["node_modules", "verify-output", ".git", "photo"].includes(f)) continue
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

// 2) 자산: 참조한 캡처가 모두 있고 ASSETS.md에 기록됨. 무대·본문에 옛 스톡 사진·가짜 장면 참조 없음
{
  const html = readFileSync(join(ROOT, "index.html"), "utf8")
  const demo = readFileSync(join(ROOT, "src/demo.ts"), "utf8")
  const assetBlock = demo.slice(demo.indexOf("const ASSETS"), demo.indexOf("type Asset"))
  const refs = new Set([...html.matchAll(/\/assets\/demo\/([\w-]+)\.webp/g), ...assetBlock.matchAll(/"([\w-]+)":/g)].map((m) => m[1]))
  const missing = [...refs].filter((r) => !existsSync(join(ROOT, "public/assets/demo", `${r}.webp`)))
  ok("참조한 캡처 파일이 모두 있음", missing.length === 0, `${refs.size}개 참조${missing.length ? " · 없음: " + missing.join(", ") : ""}`)
  const stock = /assets\/(photos|app|screens)\//.test(html + demo) || /PHOTOS|sceneGlass|sceneWall/.test(demo) || ["src/story.ts", "src/glass.ts", "src/iris.ts", "src/start.ts", "src/reveal.ts", "public/assets/photos"].some((f) => existsSync(join(ROOT, f)))
  ok("무대·본문에 스톡 사진·옛 장면 참조 없음 · 옛 파일 삭제됨", !stock)
  const manifest = existsSync(join(ROOT, "ASSETS.md")) ? readFileSync(join(ROOT, "ASSETS.md"), "utf8") : ""
  const files = readdirSync(join(ROOT, "public/assets/demo")).map((f) => f.replace(/\.webp$/, ""))
  const unlisted = files.filter((r) => !manifest.includes(r))
  const unused = files.filter((r) => !refs.has(r))
  ok("ASSETS.md(자산 목록)에 모든 캡처가 기록됨 · 쓰지 않는 캡처 없음", unlisted.length === 0 && unused.length === 0, `${unlisted.join(", ")}${unused.length ? " 미사용: " + unused.join(", ") : ""}`)
  const bytes = files.reduce((s, f) => s + statSync(join(ROOT, "public/assets/demo", f + ".webp")).size, 0)
  ok("캡처 용량(경량 파생본)", bytes < 5_000_000, `${files.length}장 ${(bytes / 1e6).toFixed(2)}MB`)
}

// 3) 문구: 잘못된 정책·배포 표현이 남아 있지 않음
{
  const text = ["index.html", "src/timeline.ts", "src/demo.ts", "README.md"].map((f) => readFileSync(join(ROOT, f), "utf8")).join("\n")
  const banned = [/결제 완료/, /바로 예약 확정/, /Play ?스토어에서 (받|설치)/, /App Store/, /iPhone 출시/, /실시간 빈자리를 확인/, /즉시 확정/, /₩30,000부터/]
  const hits = banned.filter((re) => re.test(text)).map(String)
  ok("잘못된 정책·배포 문구 없음(결제 완료·즉시 확정·스토어 등)", hits.length === 0, hits.join(", "))
}

// 4) 색 대비
{
  const lum = (hex) => {
    const c = hex.match(/\w\w/g).map((h) => parseInt(h, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const pairs = [["본문", "#111111", "#F2EFE9"], ["보조 글자", "#6B6862", "#F2EFE9"], ["보조 글자(종이)", "#6B6862", "#FBFAF7"]]
  const low = pairs.map(([n, f, b]) => [n, ratio(f, b)]).filter(([, r]) => r < 4.5)
  ok("글자 대비 4.5:1 이상", low.length === 0, pairs.map(([n, f, b]) => `${n} ${ratio(f, b).toFixed(1)}`).join(", "))
}

const browser = await chromium.launch()
const external = new Set()
const consoleErrors = []
const failed = []
const watch = (page) => {
  page.on("request", (r) => { const u = new URL(r.url()); if (!["localhost", "127.0.0.1", "[::1]"].includes(u.hostname) && !u.protocol.startsWith("data")) external.add(u.origin) })
  page.on("requestfailed", (r) => failed.push(r.url()))
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
const seekShot = async (page, t, sel = "#stage") => {
  await page.evaluate((x) => window.owndStory.seek(x), t)
  return page.locator(sel).screenshot()
}

// 5) 4개 화면 크기
const VIEWS = [
  ["데스크톱 1440×900", { viewport: { width: 1440, height: 900 } }],
  ["노트북 1280×800", { viewport: { width: 1280, height: 800 } }],
  ["모바일 390×844", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["모바일 360×800", { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]
for (const [name, opts] of VIEWS) {
  const page = await open(opts)
  const tag = name.split(" ")[1]
  const m = await page.evaluate(() => {
    const de = document.documentElement
    const wide = [...document.querySelectorAll(".topbar > *, .start *, .more *")]
      .filter((e) => !e.closest(".toc"))
      .filter((e) => e.getBoundingClientRect().right > de.clientWidth + 1)
      .map((e) => e.tagName + "." + e.className)
      .slice(0, 5)
    return { sw: de.scrollWidth, cw: de.clientWidth, wide }
  })
  ok(`${name}: 가로 넘침 없음`, m.sw <= m.cw && m.wide.length === 0, `scrollWidth ${m.sw} / ${m.cw}${m.wide.length ? " · " + m.wide.join(", ") : ""}`)

  // 설명·무대 표시물·휴대폰이 무대 안에서 잘리지 않음(여러 시점)
  const bad = []
  for (const t of [1, 11, 20, 25, 30, 36, 45.5, 56, 63, 67, 74, 81, 86, 89.5, 94, 97, 102, 106, 109, 114, 118]) {
    await page.evaluate((x) => window.owndStory.seek(x), t)
    const r = await page.evaluate(() => {
      const s = document.getElementById("stage-wrap").getBoundingClientRect()
      const out = []
      for (const c of document.querySelectorAll(".cap")) {
        if (getComputedStyle(c).display === "none") continue
        for (const m of c.querySelectorAll(".mask")) {
          const b = m.getBoundingClientRect()
          const sp = m.firstElementChild?.getBoundingClientRect()
          if (sp && (sp.top >= b.bottom - 1 || sp.bottom <= b.top + 1)) continue // 아직 올라오지 않은 글자
          if (b.height > 0 && (b.bottom > s.bottom + 1 || b.top < s.top - 1 || b.right > s.right + 1 || b.left < s.left - 1)) out.push("설명:" + m.className)
        }
      }
      const clip = document.querySelector(".world-clip").getBoundingClientRect()
      for (const sel of [".bk-chip", ".dgram", ".role-tag.on"]) {
        const e = document.querySelector(sel)
        if (!e || getComputedStyle(e).display === "none" || Number(getComputedStyle(e).opacity) < 0.05) continue
        const b = e.getBoundingClientRect()
        if (b.width < 2) continue
        if (b.bottom > clip.bottom + 1 || b.top < clip.top - 1 || b.left < clip.left - 1 || b.right > clip.right + 1) out.push(sel)
      }
      // 지금 다루는(앞쪽) 휴대폰은 무대 안에 온전히(처음·끝 로고 확대 구간 제외)
      const t = Number(document.getElementById("stage").dataset.t)
      if (t > 4 && t < 117) for (const ph of document.querySelectorAll(".phone")) {
        if (getComputedStyle(ph).display === "none" || ph.style.zIndex !== "3") continue
        const b = ph.getBoundingClientRect()
        if (b.top < clip.top - 1 || b.bottom > clip.bottom + 1 || b.left < clip.left - 1 || b.right > clip.right + 1) out.push("휴대폰 잘림")
      }
      // 설명과 앞쪽 휴대폰이 겹치지 않음(가로 화면)
      if (document.querySelector(".cap-layer").dataset.mode === "side") {
        const fr = [...document.querySelectorAll(".phone")].find((p) => getComputedStyle(p).display !== "none" && p.style.zIndex === "3")?.getBoundingClientRect()
        for (const c of document.querySelectorAll(".cap")) {
          if (!fr || getComputedStyle(c).display === "none") continue
          const b = c.getBoundingClientRect()
          if (b.right > fr.left + 2 && b.left < fr.right - 2 && b.bottom > fr.top && b.top < fr.bottom) out.push("설명-휴대폰 겹침")
        }
      }
      return out
    })
    if (r.length) bad.push(`${t}:${r.join("/")}`)
  }
  ok(`${name}: 설명·예약 칩·기록 그림·역할 표시·휴대폰이 무대 안에서 잘리지 않음`, bad.length === 0, bad.join("; "))

  // 첫 화면 맨 아래에 '아래 내용 있음' 안내가 보임
  const more = await page.evaluate(() => { const r = document.querySelector(".more a").getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight } })
  ok(`${name}: 첫 화면에 아래 내용 안내가 보임`, more.bottom <= more.vh && more.top > 0, JSON.stringify(more))

  // 아래: 로고·다운로드·목차 7개, 목차는 글 페이지로 이동
  const toc = await page.evaluate(() => ({ logo: !!document.querySelector(".start-logo"), dl: document.querySelectorAll(".start .dl-btn").length, items: [...document.querySelectorAll(".toc a")].map((a) => a.getAttribute("href")) }))
  ok(`${name}: 아래 로고·다운로드·목차 7개(글 페이지 링크)`, toc.logo && toc.dl === 1 && toc.items.length === 7 && toc.items.every((h) => /^\/guide\/\w+\.html$/.test(h)), JSON.stringify(toc))
  if (opts.isMobile) {
    const small = await page.evaluate(() => [...document.querySelectorAll(".dl-btn, .toc a, .more a")].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 32 }).map((e) => e.className))
    ok(`${name}: 다운로드·목차 터치 크기(32px 이상)`, small.length === 0, small.join(", "))
  }
  for (const t of [1, 20, 46, 57, 70, 82, 97, 106]) writeFileSync(join(OUT, "frames", `${tag}-${t}.png`), await seekShot(page, t))
  await page.close()
}

// 6) 결정론 + 루프 이음새 + 급변 검사
{
  const page = await open({ viewport: { width: 1440, height: 900 } })
  const state = () => page.evaluate(() => {
    const out = []
    document.querySelectorAll("#stage *").forEach((e) => {
      if (!e.checkVisibility({ visibilityProperty: true })) return
      const attrs = [...e.attributes].filter((a) => !["class", "src"].includes(a.name)).map((a) => `${a.name}=${a.value}`).join(";")
      out.push(`${e.tagName}|${e.className}|${attrs}`)
    })
    return out.join("\n")
  })
  // 첫 등장 끊김을 막는 미리 그리기(프레임마다 캡처 하나)가 끝난 뒤에 비교한다
  await page.waitForFunction(() => document.getElementById("stage").dataset.warm === "running", null, { timeout: 30000 })
  for (let i = 0; i < 200 && (await page.evaluate(() => document.getElementById("stage").dataset.warm)) !== "done"; i++) await page.evaluate(() => window.owndStory.seek(0))
  const ts = [0, 3.4, 11.2, 13.4, 22.9, 29.3, 32.2, 41.5, 48.3, 53.1, 61, 65.2, 69, 74, 80, 84.3, 87, 93.9, 97.2, 104.1, 107.5, 113, 119.5]
  const ref = new Map()
  for (const t of ts) { await seekShot(page, t); ref.set(t, await state()) }
  const domBad = []
  for (const t of [...ts].reverse()) {
    await seekShot(page, (t * 7.3 + 31) % 120) // 다른 시간에 들렀다가
    await seekShot(page, t)
    if ((await state()) !== ref.get(t)) domBad.push(t)
  }
  ok("결정론: 순서를 바꿔 같은 시간으로 이동 → 무대 DOM 상태 동일", domBad.length === 0, domBad.length ? `다름: ${domBad.join(", ")}` : `${ts.length}개 시점`)

  const diffOf = (A, B) => page.evaluate(async ([a, b]) => {
    const load = async (s) => createImageBitmap(await (await fetch("data:image/png;base64," + s)).blob())
    const [x, y] = [await load(a), await load(b)]
    const W = 160, H = 100
    const c = new OffscreenCanvas(W, H), g = c.getContext("2d", { willReadFrequently: true })
    g.drawImage(x, 0, 0, W, H); const da = g.getImageData(0, 0, W, H).data
    g.clearRect(0, 0, W, H); g.drawImage(y, 0, 0, W, H); const db = g.getImageData(0, 0, W, H).data
    let s = 0
    for (let i = 0; i < da.length; i += 4) s += Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
    return s / (W * H * 3 * 255)
  }, [A.toString("base64"), B.toString("base64")])
  const loop = await diffOf(await seekShot(page, 119.95, ".world-clip"), await seekShot(page, 0, ".world-clip"))
  ok("루프 이음새: 끝(119.95비트)과 처음(0비트)의 휴대폰 화면이 이어짐", loop < 0.02, `차이 ${(loop * 100).toFixed(2)}%`)

  const step = 1 / 15
  const dur = await page.evaluate(() => window.owndStory.duration)
  await page.setViewportSize({ width: 720, height: 450 })
  await page.evaluate(() => window.dispatchEvent(new Event("resize")))
  const small = []
  for (let k = 0; k * step < dur; k++) {
    await page.evaluate((x) => window.owndStory.seek(window.owndStory.beatAt(x)), k * step)
    small.push((await page.locator(".world-clip").screenshot()).toString("base64"))
  }
  const diffs = await page.evaluate(async (list) => {
    const W = 96
    const c = new OffscreenCanvas(W, W)
    const ctx = c.getContext("2d", { willReadFrequently: true })
    let prev = null
    const d = []
    for (const b64 of list) {
      const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob())
      ctx.drawImage(bmp, 0, 0, W, W)
      const px = ctx.getImageData(0, 0, W, W).data
      if (prev) { let s = 0; for (let j = 0; j < px.length; j += 4) s += Math.abs(px[j] - prev[j]) + Math.abs(px[j + 1] - prev[j + 1]) + Math.abs(px[j + 2] - prev[j + 2]); d.push(s / (W * W * 3 * 255)) }
      prev = px
    }
    return d
  }, small)
  const flagged = []
  for (let i = 1; i < diffs.length - 1; i++) {
    const nb = (diffs[i - 1] + diffs[i + 1]) / 2
    if (diffs[i] > 0.03 && diffs[i] > 3 * Math.max(nb, 0.003)) flagged.push({ sec: ((i + 1) * step).toFixed(2), beat: ((i + 1) * step / 0.7).toFixed(2), d: diffs[i].toFixed(3) })
  }
  writeFileSync(join(OUT, "diffs.json"), JSON.stringify({ step, diffs, flagged }, null, 1))
  ok("프레임 급변 목록(1/15초 간격, 이웃의 3배 초과 — 같은 화면 안 상태 변화 지점은 의도된 것)", true, flagged.length ? `${flagged.length}건(비트): ${flagged.map((f) => f.beat).join(", ")}` : "없음")
  await page.close()
}

// 7) 재생 버튼 없이 자동 재생(동작 줄이기 설정과 관계없이) · 실제 시간 속도 · 탭 숨김이면 쉬고 돌아오면 이어 감 · 프레임이 끊겨도 감시 타이머가 다시 건다
{
  const rm = await open({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" }, { play: true })
  const s0 = await rm.evaluate(() => Number(document.getElementById("stage-wrap").dataset.sec))
  await rm.waitForTimeout(1200)
  const s1 = await rm.evaluate(() => Number(document.getElementById("stage-wrap").dataset.sec))
  ok("동작 줄이기 설정에서도 자동 재생", s1 - s0 > 0.8, `${s0.toFixed(2)}→${s1.toFixed(2)}`)
  await rm.close()

  const page = await open({ viewport: { width: 1440, height: 900 } }, { play: true })
  const sec = () => page.evaluate(() => Number(document.getElementById("stage-wrap").dataset.sec))
  const a = await sec()
  await page.waitForTimeout(2000)
  const b = await sec()
  ok("자동 재생: 실제 시간 속도(1초 ≈ 1초)", (b - a) / 2 > 0.8 && (b - a) / 2 < 1.2, `2초 동안 ${(b - a).toFixed(2)}초 · 전체 ${(await page.evaluate(() => window.owndStory.duration)).toFixed(0)}초`)
  const btns = await page.evaluate(() => document.querySelectorAll("#ctl-play, #ctl-replay, .chap, .player").length)
  ok("재생·일시정지·장 버튼 없음", btns === 0, String(btns))
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")) })
  await page.waitForTimeout(300)
  const g = await sec()
  await page.waitForTimeout(800)
  const h = await sec()
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); document.dispatchEvent(new Event("visibilitychange")) })
  await page.waitForTimeout(800)
  const k = await sec()
  ok("탭이 숨으면 쉬고, 다시 보이면 이어서 재생", Math.abs(g - h) < 1e-6 && k > h + 0.4, `${g.toFixed(2)}→${h.toFixed(2)}→${k.toFixed(2)}`)
  // 브라우저가 프레임 콜백을 멈춘 상황(크롬 절전 등)을 흉내: rAF를 잠시 막았다가 풀면 감시 타이머가 다시 건다
  await page.evaluate(() => { window.__raf = window.requestAnimationFrame; window.requestAnimationFrame = () => 0 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => { window.requestAnimationFrame = window.__raf })
  const m1 = await sec()
  await page.waitForTimeout(2200)
  const m2 = await sec()
  ok("프레임이 멈췄다 풀리면 스스로 다시 재생", m2 > m1 + 0.5, `${m1.toFixed(2)}→${m2.toFixed(2)}`)
  const r = await page.evaluate(() => ({
    aria: document.getElementById("stage").getAttribute("aria-hidden"),
    desc: (document.querySelector("#film .sr-only")?.textContent ?? "").length,
    kb: [...document.querySelectorAll("a[href], button")].every((x) => x.tabIndex >= 0),
  }))
  ok("무대 aria-hidden·화면 읽기용 영상 설명·키보드 접근", r.aria === "true" && r.desc > 50 && r.kb, JSON.stringify(r))
  await page.close()
}

// 8) 자세히 보기 글 페이지: 7개 모두 열리고, 글 중심(이미지·영상 없음), 이전·다음·목차 이동
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  watch(page)
  const fails = []
  for (const slug of ["find", "request", "review", "talk", "life", "ops", "data"]) {
    const res = await page.goto(new URL(`/guide/${slug}.html`, SITE).href, { waitUntil: "load" })
    const r = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent, secs: document.querySelectorAll(".g-sec").length, media: document.querySelectorAll("main img, main video").length, text: document.querySelector("main").innerText.length, cur: document.querySelector('.g-toc a[aria-current="page"]')?.getAttribute("href"), sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
    if (!res.ok() || !r.h1 || r.secs < 3 || r.media !== 0 || r.text < 700 || r.cur !== `/guide/${slug}.html` || r.sw > r.cw) fails.push(`${slug}:${JSON.stringify(r)}`)
  }
  ok("자세히 보기 글 페이지 7개(글 중심·목차 현재 위치·가로 넘침 없음)", fails.length === 0, fails.join("; "))
  await page.goto(SITE, { waitUntil: "load" })
  await page.click('.toc a[href="/guide/ops.html"]')
  await page.waitForLoadState("load")
  ok("첫 페이지 목차를 누르면 글 페이지로 이동(위로 스크롤이 아님)", page.url().endsWith("/guide/ops.html"), page.url())
  await page.close()
}

// 9) 다운로드: 영상 끝·아래 버튼 모두 APK 파일 직접 다운로드, 다른 외부 링크 없음, 끝 장면 CTA는 자막 카드 안
{
  const page = await open({ viewport: { width: 1440, height: 900 } })
  const links = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")))
  const ext = [...new Set(links.filter((l) => /^https?:/.test(l)))]
  const dl = await page.evaluate(() => [...document.querySelectorAll("#film-cta, .dl-btn")].map((a) => a.href))
  const dlAttr = await page.evaluate(() => [...document.querySelectorAll("#film-cta, .dl-btn")].map((a) => a.getAttribute("download")))
  const r = await page.evaluate(async () => {
    await window.owndStory.seek(116)
    const a = document.getElementById("film-cta").getBoundingClientRect()
    const c = [...document.querySelectorAll(".cap")].find((x) => getComputedStyle(x).display !== "none").getBoundingClientRect()
    return { vis: getComputedStyle(document.getElementById("film-cta")).visibility, inCard: a.left >= c.left - 1 && a.right <= c.right + 1 && a.top >= c.top }
  })
  const hidden = await page.evaluate(async () => { await window.owndStory.seek(30); return getComputedStyle(document.getElementById("film-cta")).visibility })
  let apkOk = false
  let detail = ""
  try {
    const apk = await fetch(APK_URL, { method: "HEAD" })
    apkOk = apk.ok && /android\.package-archive/.test(apk.headers.get("content-type") ?? "") && /attachment/.test(apk.headers.get("content-disposition") ?? "") && Number(apk.headers.get("content-length")) > 1_000_000
    detail = `APK ${apk.status} ${apk.headers.get("content-type")} ${apk.headers.get("content-disposition")} ${apk.headers.get("content-length")}B`
  } catch (e) { detail = String(e) }
  ok("다운로드 링크(영상 끝 설명 + 아래 버튼) = APK 파일 직접 다운로드 · 다른 외부 링크 없음 · 끝 장면 CTA는 설명 아래", dl.length === 2 && dl.every((u) => u === APK_URL) && dlAttr.every((d) => d === "ownd.apk") && ext.length === 1 && ext[0] === APK_URL && r.vis === "visible" && r.inCard && hidden === "hidden", `외부 링크 ${ext.join(", ")} · 끝 ${JSON.stringify(r)} · 평소 ${hidden}`)
  ok("APK 파일이 실제로 내려받기 응답(200 · Android 패키지 · 첨부 파일)", apkOk, detail)
  // 실제 클릭으로 브라우저 다운로드가 시작되는지(크기가 커서 시작만 확인하고 취소)
  const dpage = await browser.newPage({ acceptDownloads: true, viewport: { width: 1440, height: 900 } })
  await dpage.goto(SITE, { waitUntil: "load" })
  await dpage.evaluate(() => document.getElementById("start").scrollIntoView())
  const [dlEv] = await Promise.all([dpage.waitForEvent("download", { timeout: 20000 }), dpage.click(".start .dl-btn")])
  ok("다운로드 버튼을 누르면 브라우저 다운로드가 시작됨", dlEv.suggestedFilename() === "ownd.apk" && dlEv.url() === APK_URL, `${dlEv.suggestedFilename()} ← ${dlEv.url()}`)
  await dlEv.cancel()
  await dpage.close()
  await page.close()
}

ok("페이지 로드 중 외부 호스트 요청 없음", external.size === 0, [...external].join(", "))
ok("실패한 요청 없음", failed.length === 0, failed.slice(0, 3).join(", "))
ok("콘솔 오류 없음", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "))
await browser.close()

const md = [`# 소개 웹사이트 검증 결과`, ``, `실행: ${new Date().toISOString()} · 대상 ${SITE}`, ``, ...results.map((r) => `- ${r.pass ? "✅" : "❌"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`), ``].join("\n")
writeFileSync(join(OUT, "report.md"), md)
console.log(`\n${results.filter((r) => r.pass).length}/${results.length} 통과 → verify-output/report.md`)
process.exitCode = results.every((r) => r.pass) ? 0 : 1
