import "./styles.css"
import { Story } from "./story"
import { Controller } from "./controller"
import { BEATS, DURATION, beatAt, secAt } from "./timeline"
import { setupStartButtons } from "./start"

const stage = document.getElementById("stage")!
const wrap = document.getElementById("stage-wrap")!
const story = new Story(stage, { cta: document.getElementById("film-cta")! })
setupStartButtons()
const controller = new Controller(story, {
  stageWrap: wrap,

  chapters: Array.from(document.querySelectorAll<HTMLButtonElement>(".chap")),
  fills: Array.from(document.querySelectorAll<HTMLElement>(".chap-fill")),
})

// 검증 도구용(임의 시간으로 바로 이동)
declare global {
  interface Window {
    owndStory?: { seek: (t: number) => Promise<void>; beats: number; duration: number; beatAt: (s: number) => number; secAt: (b: number) => number; ready: Promise<void>; pause: () => void }
  }
}
const ready = story.init()
window.owndStory = { seek: (t) => controller.render(t), beats: BEATS, duration: DURATION, beatAt, secAt, ready, pause: () => controller.pause() }

ready.then(() => {
  controller.start()
  // 첫 장면 뒤에 나머지 자산을 차례로 불러온다
  const idle = (cb: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 600))
  const rest = () => idle(() => void story.preloadRest().then(() => story.warm()))
  if (document.readyState === "complete") rest()
  else window.addEventListener("load", rest, { once: true })
})
