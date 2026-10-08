// "시작하기" 버튼 연결. 웹 주소·앱 스토어 주소가 정해지면 여기에만 넣으면 된다.
// 비어 있으면 버튼은 "준비 중/출시 전"으로 보이고, 눌러도 다른 곳으로 이동하지 않는다.
export const START_LINKS: Record<"web" | "ios" | "android", string> = {
  web: "",
  ios: "",
  android: "",
}

export function setupStartButtons(): void {
  const note = document.getElementById("start-note")
  document.querySelectorAll<HTMLAnchorElement>("[data-start]").forEach((a) => {
    const key = a.dataset.start as keyof typeof START_LINKS
    const url = START_LINKS[key]
    if (url) {
      a.href = url
      a.removeAttribute("aria-disabled")
      a.removeAttribute("role")
      a.querySelector(".soon")?.remove()
      return
    }
    const tell = (e: Event) => {
      e.preventDefault()
      if (note) note.textContent = key === "web" ? "웹 버전은 준비 중이에요. 열리면 여기서 바로 시작할 수 있어요." : "앱은 아직 출시 전이에요. 스토어에 올라가면 여기서 받을 수 있어요."
    }
    a.addEventListener("click", tell)
    a.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") tell(e)
    })
  })
}
