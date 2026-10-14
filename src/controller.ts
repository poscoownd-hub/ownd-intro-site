// 재생 제어: 자동 재생(기본) · 일시정지 · 다시 보기 · 장(챕터) 이동.
// 실제 시간(초)을 재생 속도표로 비트에 대응시켜 건네고, 그리는 일은 결정론 seek(t)이 한다.

import { CHAPTERS, DURATION, beatAt, secAt } from "./timeline"
import type { Story } from "./story"

type UI = {
  stageWrap: HTMLElement

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

  private ranges = CHAPTERS.map((c, i) => ({ from: secAt(c.from), to: i + 1 < CHAPTERS.length ? secAt(CHAPTERS[i + 1].from) : DURATION }))

  constructor(private story: Story, private ui: UI) {}

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


    this.ui.chapters.forEach((b, i) => b.addEventListener("click", () => this.goChapter(i)))

    // 소개 영상은 OS의 동작 줄이기 설정과 관계없이 자동 재생한다.
    this.play()
  }

  private currentBeat(): number {

    return beatAt(this.sec)
  }


  /** 오래된 seek 결과가 최신 프레임을 덮어쓰지 않게 세대 번호로 막는다 */
  render(beat: number): Promise<void> {
    const g = ++this.gen
    this.ui.stageWrap.dataset.sec = this.sec.toFixed(3)
    return this.story.seek(beat, () => g === this.gen)
  }

  goChapter(i: number): void {

    this.sec = this.ranges[i].from
    this.last = 0
    this.updateUI()
    void this.render(beatAt(this.sec))
  }

  play(): void {

    this.playing = true
    this.userPaused = false

    this.last = 0
    this.kick()
  }

  pause(): void {
    this.playing = false
    this.userPaused = true
    cancelAnimationFrame(this.raf)

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
      const p = Math.min(1, Math.max(0, (this.sec - r.from) / (r.to - r.from)))
      this.ui.fills[i].style.transform = `scaleX(${p})`
      this.ui.chapters[i].setAttribute("aria-current", String(i === cur))
    })
  }
}
