import "./styles.css"
import { Story } from "./demo"
import { Controller } from "./controller"
import { BEATS, DURATION, beatAt, secAt } from "./timeline"
import { setupBackdrop } from "./backdrop"

const stage = document.getElementById("stage")!
const wrap = document.getElementById("stage-wrap")!
const story = new Story(stage, { cta: document.getElementById("film-cta")! })
const controller = new Controller(story, wrap)
setupBackdrop(wrap)

// 검증 도구용(임의 시간으로 바로 이동)
declare global {
  interface Window {
    owndStory?: { seek: (t: number) => Promise<void>; beats: number; duration: number; beatAt: (s: number) => number; secAt: (b: number) => number; ready: Promise<void>; pause: () => void }
  }
}
// 시작 장면: 큰 검은 OWND 로고가 한 글자씩 올라와 잠깐 머문 뒤 배경의 외곽선 로고로 바뀌고, 그다음 시연과 설명이 시작된다
function intro(): Promise<void> {
  return new Promise((done) => {
    wrap.dataset.intro = "in"
    // 진하게 머무는 시간은 짧게, 옅어지는 전환은 길고 부드럽게(시연은 옅어지는 도중에 겹쳐 들어온다)
    setTimeout(() => (wrap.dataset.intro = "out"), 1300)
    setTimeout(() => {
      delete wrap.dataset.intro
      done()
    }, 1900)
  })
}
const ready = story.init().then(intro)

window.owndStory = { seek: (t) => controller.render(t), beats: BEATS, duration: DURATION, beatAt, secAt, ready, pause: () => controller.pause() }

ready.then(() => {
  controller.start()
  // 첫 장면 뒤에 나머지 캡처를 차례로 불러온다
  const idle = (cb: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 600))
  const rest = () => idle(() => void story.preloadRest())
  if (document.readyState === "complete") rest()
  else window.addEventListener("load", rest, { once: true })
})
