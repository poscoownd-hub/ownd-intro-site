// 프레임 PNG들을 한 장의 접촉 인화지로 묶는다. 사용: node tools/sheet.mjs <out.png> <png...>
import { chromium } from "playwright"
import { readFileSync } from "node:fs"
import { basename } from "node:path"
const [out, ...files] = process.argv.slice(2)
const cols = Number(process.env.COLS || 5)
const cells = files.map((f) => `<figure><img src="data:image/png;base64,${readFileSync(f).toString("base64")}"><figcaption>${basename(f)}</figcaption></figure>`).join("")
const html = `<style>body{margin:0;background:#888;font:12px sans-serif}main{display:grid;grid-template-columns:repeat(${cols},1fr);gap:4px;padding:4px}figure{margin:0}img{width:100%;display:block}figcaption{color:#fff}</style><main>${cells}</main>`
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1500, height: 400 } })
await p.setContent(html)
await p.screenshot({ path: out, fullPage: true })
await b.close()
