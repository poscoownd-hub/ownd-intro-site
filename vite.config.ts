import { defineConfig } from "vite"

// 오운디 소개 웹사이트. 본 앱(apps/*)과 별개인 정적 사이트다.
export default defineConfig({
  server: { port: Number(process.env.PORT || 5180), strictPort: true },
  preview: { port: 5181, strictPort: true },
  build: { assetsInlineLimit: 0 },
})
