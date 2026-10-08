// 재생 제어: 자동 재생(기본) · 일시정지 · 다시 보기 · 장(챕터) 이동.
// 실제 시간(초)을 재생 속도표로 비트에 대응시켜 건네고, 그리는 일은 결정론 seek(t)이 한다.

import { CHAPTERS, DURATION, beatAt, secAt } from "./timeline"
import type { Story } from "./story"

type UI = {
  stageWrap: HTMLElement
  play: HTMLButtonElement
  replay: HTMLButtonElement
  chapters: HTMLButtonElement[]
  fills: HTMLElement[]
}

export class Controller {
  private gen = 0
  private sec = 0
  private playing = false
  private userPaused = false
  private inView = true
  private raf = 0
  private last = 0
  private reduced: boolean
  private ranges = CHAPTERS.map((c, i) => ({ from: secAt(c.from), to: i + 1 < CHAPTERS.length ? secAt(CHAPTERS[i + 1].from) : DURATION }))

  constructor(private story: Story, private ui: UI) {
    this.reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  }

  start(): void {
    window.addEventListener("resize", () => {
      this.story.resize()
      void this.render(this.currentBeat())
    })
    new IntersectionObserver((es) => {
      this.inView = es.some((e) => e.isIntersecting)
      this.kick()
    }, { threshold: 0.25 }).observe(this.ui.stageWrap)
    document.addEventListener("visibilitychange", () => this.kick())

    this.ui.play.addEventListener("click", () => (this.playing ? this.pause() : this.play()))
    this.ui.replay.addEventListener("click", () => {
      this.sec = 0
      this.play()
    })
    this.ui.chapters.forEach((b, i) => b.addEventListener("click", () => this.goChapter(i)))

    if (this.reduced) {
      // 동작 줄이기: 자동 재생하지 않고 장마다 정지 장면을 보여 준다
      this.goChapter(0)
    } else {
      this.play()
    }
  }

  private currentBeat(): number {
    if (this.reduced) return CHAPTERS[this.reducedIdx].still
    return beatAt(this.sec)
  }
  private reducedIdx = 0

  /** 오래된 seek 결과가 최신 프레임을 덮어쓰지 않게 세대 번호로 막는다 */
  render(beat: number): Promise<void> {
    const g = ++this.gen
    this.ui.stageWrap.dataset.sec = this.sec.toFixed(3)
    return this.story.seek(beat, () => g === this.gen)
  }

  goChapter(i: number): void {
    if (this.reduced) {
      this.reducedIdx = i
      this.updateUI(i)
      void this.render(CHAPTERS[i].still)
      return
    }
    this.sec = this.ranges[i].from
    this.last = 0
    this.updateUI()
    void this.render(beatAt(this.sec))
  }

  play(): void {
    if (this.reduced) return
    this.playing = true
    this.userPaused = false
    this.ui.play.setAttribute("aria-pressed", "true")
    this.ui.play.setAttribute("aria-label", "일시정지")
    this.ui.play.dataset.state = "playing"
    this.last = 0
    this.kick()
  }

  pause(): void {
    this.playing = false
    this.userPaused = true
    cancelAnimationFrame(this.raf)
    this.ui.play.setAttribute("aria-pressed", "false")
    this.ui.play.setAttribute("aria-label", "재생")
    this.ui.play.dataset.state = "paused"
  }

  /** 화면 밖이거나 탭이 숨으면 그리지 않는다. 돌아오면 이어서 */
  private kick(): void {
    cancelAnimationFrame(this.raf)
    if (!this.playing || !this.inView || document.hidden) return
    this.last = 0
    const step = (now: number) => {
      if (!this.playing || !this.inView || document.hidden) return
      if (this.last) this.sec = (this.sec + Math.min(0.1, (now - this.last) / 1000)) % DURATION
      this.last = now
      this.updateUI()
      void this.render(beatAt(this.sec))
      this.raf = requestAnimationFrame(step)
    }
    this.raf = requestAnimationFrame(step)
  }

  private updateUI(forced?: number): void {
    const cur = forced ?? this.ranges.findIndex((r) => this.sec >= r.from && this.sec < r.to)
    this.ranges.forEach((r, i) => {
      const p = this.reduced ? (i === cur ? 1 : 0) : Math.min(1, Math.max(0, (this.sec - r.from) / (r.to - r.from)))
      this.ui.fills[i].style.transform = `scaleX(${p})`
      this.ui.chapters[i].setAttribute("aria-current", String(i === cur))
    })
  }
}
