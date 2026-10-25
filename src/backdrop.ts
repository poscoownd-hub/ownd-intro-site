// 시연 뒤 배경: 마우스를 움직이면(클릭·포커스와 관계없이) 큰 OWND 글자와 점 격자가 반대 방향으로 살짝 따라 움직인다.
// 값은 CSS 변수(--mx, --my, -1~1)로만 넘기고 움직임은 CSS 전환이 부드럽게 처리한다.

export function setupBackdrop(root: HTMLElement): void {
  if (!window.matchMedia("(pointer: fine)").matches) return
  let raf = 0
  let x = 0
  let y = 0
  window.addEventListener(
    "pointermove",
    (e) => {
      x = (e.clientX / window.innerWidth) * 2 - 1
      y = (e.clientY / window.innerHeight) * 2 - 1
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        root.style.setProperty("--mx", x.toFixed(3))
        root.style.setProperty("--my", y.toFixed(3))
      })
    },
    { passive: true },
  )
}
