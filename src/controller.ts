// 재생 제어: 재생 버튼 없이 항상 자동 재생(동작 줄이기 설정과 관계없이).
// 실제 시간(초)을 비트로 바꿔 건네고, 그리는 일은 결정론 seek(t)이 한다.
// 브라우저가 탭을 숨기거나 프레임을 멈추면(크롬 절전·백그라운드 제한 등) 그동안은 쉬고,
// 다시 보이거나 프레임이 오래 끊기면 감시 타이머가 그 자리에서 이어서 재생한다.

import { DURATION, beatAt } from "./timeline"
import type { Story } from "./demo"

export class Controller {
  private gen = 0
  private sec = 0
  private playing = false
  private raf = 0
  private last = 0
  private lastFrameAt = 0

  constructor(private story: Story, private stageWrap: HTMLElement) {}

  start(): void {
    window.addEventListener("resize", () => {
      this.story.resize()
      void this.render(beatAt(this.sec))
    })
    const resume = () => this.kick()
    document.addEventListener("visibilitychange", resume)
    window.addEventListener("pageshow", resume)
    window.addEventListener("focus", resume)
    // 감시: 보이는 상태인데 프레임이 0.5초 넘게 없으면 다시 건다
    window.setInterval(() => {
      if (this.playing && !document.hidden && performance.now() - this.lastFrameAt > 500) this.kick()
    }, 1000)
    this.play()
  }

  /** 오래된 seek 결과가 최신 프레임을 덮어쓰지 않게 세대 번호로 막는다 */
  render(beat: number): Promise<void> {
    const g = ++this.gen
    this.stageWrap.dataset.sec = this.sec.toFixed(3)
    return this.story.seek(beat, () => g === this.gen)
  }

  play(): void {
    this.playing = true
    this.kick()
  }

  /** 검증 도구용 정지 */
  pause(): void {
    this.playing = false
    cancelAnimationFrame(this.raf)
  }

  private kick(): void {
    cancelAnimationFrame(this.raf)
    if (!this.playing || document.hidden) return
    this.last = 0
    this.lastFrameAt = performance.now()
    const step = (now: number) => {
      if (!this.playing || document.hidden) return
      // 프레임 간격이 길게 끊겼으면(제한·멈춤) 건너뛰지 않고 그 자리에서 이어 간다
      if (this.last) this.sec = (this.sec + Math.min(0.1, (now - this.last) / 1000)) % DURATION
      this.last = now
      this.lastFrameAt = performance.now()
      void this.render(beatAt(this.sec))
      this.raf = requestAnimationFrame(step)
    }
    this.raf = requestAnimationFrame(step)
  }
}
