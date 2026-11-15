// 이동 서비스를 월드에 잇기 — service.ts에서 나눔(그 파일 1,000줄 상한). docs/adr/2026-11-07-play-flow.md "WP9", docs/adr/2026-11-15-unloaded-second-maps.md.
// 소유 주체·정산은 정산 서비스, 사이보그 본체는 사이보그 서비스, 띄우지 않은 2차맵 탐사 기록은 탐사 저장(mapFactory exploredStoreOf)에서.
// 좌표 유닛 목록은 정산에 넘긴다(좌표 유닛도 유지비를 낸다 — ADR 2026-11-15 6절).
import { exploredStoreOf } from "../world/mapFactory.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { type CoordinateUnit, type TravelDeps, type TravelService, createTravelService } from "./service.ts";
import { exploreBits } from "./unloadPark.ts";

/** 월드(world.ts)가 잇는 모양: 소유 주체·정산은 정산 서비스, 사이보그 본체는 사이보그 서비스에서 */
export function createWorldTravel(parts: {
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly planetId: string;
  readonly writer: WorldWriter;
  readonly pool: QueryPool;
  readonly now: () => number;
  readonly log: TravelDeps["log"];
  readonly ready: () => boolean;
  readonly settlement: {
    findOwnerOfUser(userId: string): number | undefined;
    settleOwner(ownerId: number, toMs: number): unknown;
    /** 좌표 유닛도 유지비를 낸다(ADR 2026-11-15 6절) — 정산이 이 목록을 더한다 */
    offMapUnits?(source: ((ownerIds: ReadonlySet<number>) => readonly CoordinateUnit[]) | undefined): void;
  };
  readonly cyborgs: { record(userId: string): { readonly unitId: number | null } | undefined };
}): TravelService {
  const { settlement, cyborgs, pool, writer, planetId } = parts;
  const explored = exploredStoreOf(pool, writer, planetId, parts.now);
  const service = createTravelService({
    ...parts,
    ownerOf: (userId) => settlement.findOwnerOfUser(userId),
    cyborgUnitOf: (userId) => cyborgs.record(userId)?.unitId ?? null,
    settle: (ownerId, atMs) => {
      settlement.settleOwner(ownerId, atMs);
    },
    // 띄우지 않은 2차맵 탐사 기록(정찰·이동이 닿은 목표 둘레) — 읽고 더해 쓰기 대기열로
    exploreOff: (userId, mapKey, points) => {
      const store = explored(mapKey);
      store
        .load(userId)
        .then((known) => {
          const bits = exploreBits(known, points);
          if (bits) store.save(userId, bits);
        })
        .catch((error: unknown) =>
          parts.log.error({ err: error, mapKey }, "travel: exploration record failed"),
        );
    },
  });
  settlement.offMapUnits?.((ownerIds) => service.coordinateUnits(ownerIds));
  return service;
}
