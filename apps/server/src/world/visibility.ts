// 2차맵을 볼 수 있는지 — ADR 2026-10-28-fog-and-map-visibility(26), S3 ADR 3절(사용자 결정 U3: 한 칸이라도 탐사하면 지형 통째)
// 전체 보기 권한(dev·admin)이면 늘 된다. 아니면 그 2차맵에 내 유닛·건물이 있거나(옆 2차맵 내 유닛의 시야가 경계를 넘어 닿을 때 포함), 같은 나라
// 유닛·건물이 있을 때(같은 나라 시야 공유, docs/adr/2026-11-08-citizenship.md — map.vision.canView). 탐사만 한 2차맵은 열리지 않는다(기획 D-564
// 2차 답 1642 "내 유닛이 있어야 열림", docs/adr/2026-11-15-unloaded-second-maps.md "바뀜 (D-564)" — 탐사 기록은 1차맵·위험 구간이 "아는 곳"으로 쓴다).
// 구독(src/world/gateway.ts)과 지형 파일(src/world/terrainRoute.ts)이 이 함수를 거친다. 명령은 권한·소유로 따로 본다.
import { rolesAllow } from "../auth/permissions.ts";
import type { Viewer } from "../trpc/context.ts";
import type { WorldDirectory } from "./gateway.ts";
import { nationLookupOf } from "./nationVision.ts";
import { allyLookupOf } from "./leagueTies.ts";
import type { SecondMap } from "./secondMap.ts";

/** 관리자 전체 보기 권한(시야로 거르지 않는다) */
export function canObserve(viewer: Viewer): boolean {
  return rolesAllow(viewer.roles, { secondMap: ["observe"] });
}

export async function canViewSecondMap(
  world: WorldDirectory,
  viewer: Viewer,
  map: SecondMap,
): Promise<boolean> {
  if (canObserve(viewer)) return true;
  // 같은 나라 시야 공유(질문 746 나): 저장하는 월드면 소유 주체 → 나라를 넘긴다(시험 디렉터리는 공유 없음)
  return map.vision.canView({
    userId: viewer.id,
    ownerId: world.ownerOfUser?.(viewer.id),
    nations: nationLookupOf(world),
    allies: allyLookupOf(world),
  });
}
