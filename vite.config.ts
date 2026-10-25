import { defineConfig } from "vite"
import { readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"

// 오운디 소개 웹사이트. 본 앱(apps/*)과 별개인 정적 사이트다.
// 첫 페이지(index.html) + 자세히 보기 글 페이지(guide/*.html)를 함께 빌드한다.
const root = fileURLToPath(new URL(".", import.meta.url))
const guides = Object.fromEntries(
  readdirSync(new URL("./guide", import.meta.url))
    .filter((f) => f.endsWith(".html"))
    .map((f) => [`guide-${f.replace(/\.html$/, "")}`, `${root}guide/${f}`]),
)

export default defineConfig({
  server: { port: Number(process.env.PORT || 5180), strictPort: true },
  preview: { port: 5181, strictPort: true },
  build: { assetsInlineLimit: 0, rollupOptions: { input: { main: `${root}index.html`, ...guides } } },
})
