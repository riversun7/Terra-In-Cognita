// 2차맵을 볼 수 있는지 — ADR 2026-10-28-fog-and-map-visibility(26), S3 ADR 3절(사용자 결정 U3: 한 칸이라도 탐사하면 지형 통째)
// 전체 보기 권한(dev·admin)이면 늘 된다. 아니면 그 2차맵에 내 유닛·건물이 있거나 한 칸이라도 탐사했을 때(map.vision.canView).
// 구독(src/world/gateway.ts)과 지형 파일(src/world/terrainRoute.ts)이 이 함수를 거친다. 명령은 권한·소유로 따로 본다.
import { rolesAllow } from "../auth/permissions.ts";
import type { Viewer } from "../trpc/context.ts";
import type { WorldDirectory } from "./gateway.ts";
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
  return map.vision.canView({ userId: viewer.id, ownerId: world.ownerOfUser?.(viewer.id) });
}
