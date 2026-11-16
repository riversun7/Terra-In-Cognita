// 조우 뒤 돌아갈 곳 — 기획 D-570 1908, 질문 2033 답(encounter-4): "출발 자리"가 아니라 전리품 정리 → 가장 가까운 내 창고, 재정비 → 거점(내 도시·
// 소속 도시 등 기존 거점 개념). docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (encounter-4)".
// - 창고 = 그 소유 주체의 창고 시설(시설 단계 storage, 다 지었고 일하는 것, 자리가 남은 것 — 채집 줄 넣는 곳 nearestStore와 같은 조건). 건물이 선
//   2차맵은 늘 떠 있어(ADR 2026-11-15 3절 — 건물이 있으면 내리지 않는다) 띄운 2차맵만 본다.
// - 거점 = 그 주체 나라(nationOfOwner — 시민권·가문 나라·NPC 세력)의 도시 + 플레이어 사이보그의 시작 도시. 폐허는 도시가 아니다.
// - 가까움 = 행성 위 두 2차맵 가운데 사이 거리(셀 키 투영, 큰 원 현의 제곱) → 같으면 2차맵 안 칸 거리 → 작은 ID. 셀 키가 아닌 시험 2차맵은 같은
//   2차맵을 먼저, 그 밖은 같은 거리로 본다.
import { isCellKey } from "@terra/planet";
import { cellCenter } from "@terra/planet/projection";
import type { Spot } from "./afterEncounter.ts";

/** 후보 한 곳 */
export interface HomeCandidate extends Spot {
  readonly id: number;
}

/** 두 2차맵 사이 거리(행성 위, 제곱). 같은 2차맵 0, 셀 키가 아니면 1 */
export function mapDistance2(a: number, b: number): number {
  if (a === b) return 0;
  if (!isCellKey(a) || !isCellKey(b)) return 1;
  const p = cellCenter(a);
  const q = cellCenter(b);
  const dx = p[0] - q[0];
  const dy = p[1] - q[1];
  const dz = p[2] - q[2];
  return dx * dx + dy * dy + dz * dz;
}

/** from에서 가장 가까운 후보(없으면 undefined) */
export function nearestHome<T extends HomeCandidate>(candidates: Iterable<T>, from: Spot): T | undefined {
  let best: { at: T; far: number; near: number } | undefined;
  for (const at of candidates) {
    const far = mapDistance2(from.mapKey, at.mapKey);
    const dx = at.x - from.x;
    const dy = at.y - from.y;
    const near = at.mapKey === from.mapKey ? dx * dx + dy * dy : 0;
    if (
      !best ||
      far < best.far ||
      (far === best.far && (near < best.near || (near === best.near && at.id < best.at.id)))
    )
      best = { at, far, near };
  }
  return best?.at;
}
