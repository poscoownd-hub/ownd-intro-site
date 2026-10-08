// 두 PNG의 다른 픽셀 영역(경계 상자)과 개수
import { chromium } from "playwright"
import { readFileSync } from "node:fs"
const [a, b] = process.argv.slice(2).map((f) => readFileSync(f).toString("base64"))
const br = await chromium.launch()
const p = await br.newPage()
const r = await p.evaluate(async ([a, b]) => {
  const load = async (s) => createImageBitmap(await (await fetch("data:image/png;base64," + s)).blob())
  const A = await load(a), B = await load(b)
  const c = new OffscreenCanvas(A.width, A.height), x = c.getContext("2d")
  x.drawImage(A, 0, 0); const da = x.getImageData(0, 0, A.width, A.height).data
  x.clearRect(0, 0, A.width, A.height); x.drawImage(B, 0, 0); const db = x.getImageData(0, 0, A.width, A.height).data
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, max = 0
  for (let i = 0; i < da.length; i += 4) {
    const d = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2])
    if (d > 0) { n++; const px = (i / 4) % A.width, py = Math.floor(i / 4 / A.width); x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); max = Math.max(max, d) }
  }
  return { w: A.width, h: A.height, n, box: [x0, y0, x1, y1], max }
}, [a, b])
console.log(JSON.stringify(r))
await br.close()
