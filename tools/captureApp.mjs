// 본 프로젝트 소비자 앱(Expo 웹)을 로컬에서 띄운 상태로 화면을 캡처한다.
// 전제: 임시 DB 데모 서버(8899)와 소비자 앱 웹(8083)이 떠 있어야 한다. 실제 서비스 데이터가 아니다.
// 사용: node tools/captureApp.mjs [--explore]
import { chromium } from "playwright"
import { mkdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

const APP = process.env.OWND_APP_URL || "http://localhost:8083"
const API = process.env.OWND_DEMO_API || "http://localhost:8899/api"
const OUT = fileURLToPath(new URL("../public/assets/app/", import.meta.url))
const explore = process.argv.includes("--explore")
mkdirSync(OUT, { recursive: true })

const places = await (await fetch(`${API}/places?region=INCHEON_YEONSU&kind=FACILITY&lat=37.41&lng=126.68`)).json()
const own = places.items.find((i) => i.kind === "OWND_FACILITY")
const ext = places.items.find((i) => i.connectionLevel === "FACILITY") ?? places.items.find((i) => i.kind === "EXTERNAL_LISTING")

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, colorScheme: "light", locale: "ko-KR" })
const settle = (ms = 1800) => page.waitForTimeout(ms)
const shot = async (name) => {
  await settle()
  await page.screenshot({ path: `${OUT}${name}.png` })
  if (explore) console.log(`--- ${name} ${page.url()}\n${(await page.innerText("body")).slice(0, 900)}`)
}

await page.goto(`${APP}/login`)
await page.getByText("민수", { exact: true }).click()
await settle(3000)
await shot("explore")

// 대화형 검색(개발용 규칙 판단기)
const input = page.getByPlaceholder(/어떤 운동/)
if (await input.count()) {
  await input.first().fill("송도에서 탁구 칠 곳, 주차는 꼭 돼야 해")
  await input.first().press("Enter")
  await settle(3500)
  await shot("search")
}

await page.goto(`${APP}/places`)
await shot("places")
const mapTab = page.getByText("지도", { exact: true })
if (await mapTab.count()) { await mapTab.first().click(); await shot("places-map") }

if (ext) { await page.goto(`${APP}/place/${ext.id}`); await shot("place-external") }
if (own) {
  await page.goto(`${APP}/facility/${own.id}?ch=DIRECT`)
  await settle()
  const nextDay = page.getByText("목", { exact: true })
  if (await nextDay.count()) await nextDay.first().click()
  await shot("facility-own")
}

await browser.close()
console.log("captured →", OUT)
