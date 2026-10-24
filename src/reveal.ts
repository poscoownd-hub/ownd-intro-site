// 아래 섹션: 화면에 들어올 때 아래에서 올라오게 한다.
// 스크립트가 .rv를 붙일 때만 숨기므로, 스크립트가 없어도 내용은 그대로 보인다.
const SELECTOR = ".keys .sec-head, .key-grid, .kw .sec-head, .kw .duo, .pipe, .gives, .relay, .kw .gallery, .row-title"

export function setupReveal(): void {
  const els = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))
  const roads = Array.from(document.querySelectorAll<HTMLElement>(".road"))
  if (!("IntersectionObserver" in window)) {
    roads.forEach((r) => r.classList.add("in"))
    return
  }
  els.forEach((e) => e.classList.add("rv"))
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue
        en.target.classList.add("in")
        io.unobserve(en.target)
      }
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
  )
  for (const e of [...els, ...roads]) io.observe(e)
}
