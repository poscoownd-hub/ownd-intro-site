// 6날 조리개. 육각형 구멍을 둘러싼 날 6개.
// 날 k = 육각형 변 k를 지나는 직선이 바깥 원을 자르는 활꼴:
//   변의 두 꼭짓점 + 양쪽 연장선이 원과 만나는 두 점 + 그 사이의 "짧은" 호.
// apothem(중심~변 거리)이 R이면 완전히 열림(날 면적 0), 0에 가까우면 닫힘.

export type IrisBlade = { d: string; largeArc: 0 | 1 }

const MIN_APOTHEM = 0.75

export function irisBlades(cx: number, cy: number, R: number, apothem: number, rotation: number): IrisBlade[] {
  // 닫힌 상태에서도 직선이 중심을 지나지 않게 해 반원(호 방향이 모호해짐)을 피한다.
  const a = Math.min(R, Math.max(MIN_APOTHEM, apothem))
  const h = Math.sqrt(Math.max(0, R * R - a * a))
  const vr = a / Math.cos(Math.PI / 6) // 육각형 꼭짓점까지 거리
  const out: IrisBlade[] = []
  for (let k = 0; k < 6; k++) {
    const th = rotation + (k * Math.PI) / 3
    const nx = Math.cos(th)
    const ny = Math.sin(th)
    const tx = -ny
    const ty = nx
    const mx = cx + a * nx
    const my = cy + a * ny
    // 변의 두 꼭짓점(법선 각 ± 30°)
    const p0x = cx + vr * Math.cos(th - Math.PI / 6)
    const p0y = cy + vr * Math.sin(th - Math.PI / 6)
    const p1x = cx + vr * Math.cos(th + Math.PI / 6)
    const p1y = cy + vr * Math.sin(th + Math.PI / 6)
    // 연장선이 원과 만나는 점 A(꼭짓점 0 쪽), B(꼭짓점 1 쪽)
    const ax = mx - h * tx
    const ay = my - h * ty
    const bx = mx + h * tx
    const by = my + h * ty
    // B → A로 원의 바깥쪽(중심 반대편)을 도는 짧은 호. 화면 좌표(y 아래)에서 반시계 = sweep 0
    const largeArc = 0 as const
    const f = (n: number) => n.toFixed(2)
    const d = `M${f(ax)} ${f(ay)}L${f(p0x)} ${f(p0y)}L${f(p1x)} ${f(p1y)}L${f(bx)} ${f(by)}A${f(R)} ${f(R)} 0 ${largeArc} 0 ${f(ax)} ${f(ay)}Z`
    out.push({ d, largeArc })
  }
  return out
}

/** 검증용: 날의 무게중심이 구멍 바깥(중심에서 apothem보다 먼 곳)에 있는지 = 긴 호 뒤집힘이 없는지 */
export function bladeCentroidsOutside(cx: number, cy: number, R: number, apothem: number, rotation: number): boolean {
  const a = Math.min(R, Math.max(MIN_APOTHEM, apothem))
  for (let k = 0; k < 6; k++) {
    const th = rotation + (k * Math.PI) / 3
    // 활꼴의 무게중심은 법선 방향 거리 4R sin^3(φ/2) / (3(φ - sin φ)), φ = 중심각
    const phi = 2 * Math.acos(a / R)
    if (phi < 1e-4) continue
    const dist = (4 * R * Math.pow(Math.sin(phi / 2), 3)) / (3 * (phi - Math.sin(phi)))
    const gx = cx + dist * Math.cos(th)
    const gy = cy + dist * Math.sin(th)
    if (Math.hypot(gx - cx, gy - cy) < a - 1e-6) return false
  }
  return true
}
