// 보는 사람이 2차맵을 띄우기 — docs/adr/2026-11-15-unloaded-second-maps.md 2절 1, 기획 D-559 1619("2차맵은 필요할 때(보는 사람·전투·상호작용)만").
// - 기기가 띄우지 않은 2차맵을 구독하면(gateway.ts) 그 사람의 좌표 유닛이 그 2차맵에 서 있거나 운영자 전체 보기(권한은 게이트웨이가 본다)일 때만
//   띄운다. 그 밖은 띄우지 않는다(탐사만 한 2차맵 등 — 남이 서버 메모리를 쓰게 하지 않음, 질문 1642).
// - 상한(map_spawn_max_loaded)에 닿고 한가한 2차맵도 없으면 busy(잠시 뒤 다시).
import type { TravelService } from "../travel/service.ts";
import type { MapSpawner } from "./mapSpawn.ts";

/** ok 띄웠다(이미 있었음 포함), refused 띄울 까닭이 없다, busy 상한 */
export type ViewOpen = "ok" | "refused" | "busy";

export async function openForView(
  parts: {
    readonly maps: ReadonlyMap<number, unknown>;
    readonly spawn: Pick<MapSpawner, "open" | "canOpen"> | undefined;
    readonly travel: Pick<TravelService, "hasParked"> | undefined;
    readonly ownerOfUser: (userId: string) => number | undefined;
  },
  userId: string,
  mapKey: number,
  observe: boolean,
): Promise<ViewOpen> {
  if (parts.maps.has(mapKey)) return "ok";
  const { spawn, travel } = parts;
  if (!spawn || !travel || !spawn.canOpen(mapKey)) return "refused";
  const ownerId = parts.ownerOfUser(userId);
  if (!observe && (ownerId === undefined || !travel.hasParked(mapKey, ownerId))) return "refused";
  const outcome = await spawn.open(mapKey, "view");
  if (outcome === "ok") return "ok";
  return outcome === "full" ? "busy" : "refused";
}
