// 운영자 텔레포트(기획 D-560 1239, 프로토콜 36) — 이동 서비스(service.ts)에서 떼어 낸 부분(파일 크기 상한).
// - 내 유닛을 걷지 않고 목적 칸 둘레의 설 칸으로 바로 옮긴다(가던 길은 버린다). 목적 2차맵을 띄우지 않았으면 띄운 뒤 옮긴다
//   (운영자가 보려고 옮기는 것이라 좌표 이동과 달리 띄운다 — docs/adr/2026-11-15-unloaded-second-maps.md의 예외).
// - 좌표 유닛(서 있음, parked.ts)도 옮긴다: 장부에서 꺼내 목적 2차맵에 놓고, 못 놓으면 그 좌표에 다시 세운다.
// - 권한(모든 유닛 명령)은 게이트웨이가 본다.
import { type CellPoint, anchorCenter, positionAt } from "@terra/sim";
import type { TransferRow } from "../world/secondMapRows.ts";
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";
import type { ParkedBook } from "./parked.ts";
import { type Standable, anchorOf, standNear } from "./route.ts";
import { type UnitInfo, standsOn } from "./serviceParts.ts";
import {
  type Journey,
  type TravelCommandResult,
  type TravelDeps,
  type TravelSpawn,
  type TravelTarget,
  fail,
  startCode,
} from "./serviceTypes.ts";

/** 텔레포트가 이동 서비스에서 빌려 쓰는 것 */
export interface TeleportParts {
  readonly deps: Pick<TravelDeps, "ready" | "settle" | "now" | "log">;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly parked: ParkedBook;
  readonly stopped: () => boolean;
  readonly spawn: () => TravelSpawn | undefined;
  readonly ownUnit: (
    userId: string,
    unitId: number | undefined,
  ) =>
    | { readonly problem: Parameters<typeof startCode>[0] }
    | {
        readonly id: number;
        readonly ownerId: number;
        readonly mapKey: number;
        readonly info: UnitInfo;
        readonly map: SecondMap | undefined;
      };
  readonly locate: (unitId: number) => { readonly map: SecondMap; readonly info: UnitInfo } | undefined;
  readonly standable: Standable;
  readonly standableFor: (sea: boolean) => Standable;
  /** 가는 길·끝난 길·저장 줄·확인 타이머(가던 길을 버릴 때) */
  readonly journeys: Map<number, Journey>;
  readonly recent: Map<number, unknown>;
  readonly store: { remove(unitId: number): void };
  readonly arm: () => void;
  /** 좌표 유닛으로 다시 세운다 */
  readonly park: (row: TransferRow, mapKey: number, cell: CellPoint) => void;
}

/** 출발 자리: 띄운 2차맵 위 유닛이면 그 2차맵에서 꺼내고, 좌표 유닛이면 장부에서 꺼낸다 */
type Origin =
  | { readonly kind: "map"; readonly map: SecondMap; readonly info: UnitInfo }
  | { readonly kind: "parked"; readonly mapKey: number; readonly cell: CellPoint; readonly info: UnitInfo };

export function createTeleport(parts: TeleportParts) {
  const { deps, maps, parked } = parts;
  const { now, log } = deps;

  /** 가던 길을 버린다(줄도 지운다, 끝난 길 기록도 지운다) */
  const dropJourney = (unitId: number): void => {
    const old = parts.journeys.get(unitId);
    if (old) {
      parts.journeys.delete(unitId);
      old.seq += 1;
      old.checkAtMs = null;
      parts.store.remove(unitId);
      parts.arm();
    }
    parts.recent.delete(unitId);
  };

  const originOf = (unitId: number, info: UnitInfo): Origin | undefined => {
    const where = parts.locate(unitId);
    if (where) return { kind: "map", map: where.map, info: where.info };
    const spot = parked.get(unitId);
    return spot ? { kind: "parked", mapKey: spot.row.mapKey, cell: spot.cell, info } : undefined;
  };

  return async (
    userId: string,
    request: TravelTarget & { readonly unitId: number },
  ): Promise<TravelCommandResult> => {
    if (parts.stopped() || !deps.ready()) return fail("busy");
    const found = parts.ownUnit(userId, request.unitId);
    if ("problem" in found) return fail(startCode(found.problem));
    if (unavailable(found.info.condition, now())) return fail("unavailable");
    // 띄우지 않은 목적지는 띄운 뒤 옮긴다(상한·띄울 수 없는 칸이면 unknown_map)
    if (!maps.has(request.mapKey)) {
      const spawn = parts.spawn();
      if (!spawn?.canOpen(request.mapKey)) return fail("unknown_map");
      const opened = await spawn.open(request.mapKey);
      if (opened !== "ok") return fail(opened === "full" ? "busy" : "unknown_map");
    }
    const target = maps.get(request.mapKey);
    // 띄우는 동안 유닛이 바뀌었을 수 있다(다시 찾는다 — 목적 2차맵을 띄우며 그곳 좌표 유닛이 들어갔을 수도 있다)
    const origin = originOf(found.id, found.info);
    if (!target || !origin) return fail(target ? "unknown_unit" : "unknown_map");
    const size = origin.info.size;
    const sea = origin.info.domain === "sea";
    const goal = { x: request.x, y: request.y };
    const spot = standsOn(target, goal, size, sea)
      ? goal
      : standNear(target.mapKey, goal, size, sea ? parts.standableFor(true) : parts.standable);
    if (!spot) return fail("goal_blocked");
    dropJourney(found.id);
    const fromKey = origin.kind === "map" ? origin.map.mapKey : origin.mapKey;
    if (fromKey !== target.mapKey) {
      try {
        deps.settle?.(found.ownerId, now());
      } catch (error) {
        log.error({ err: error, ownerId: found.ownerId }, "travel: settle before teleport failed");
      }
    }
    const row = origin.kind === "map" ? origin.map.transferOut(found.id) : parked.take(found.id);
    if (!row) return fail("unknown_unit");
    if (!target.transferIn(row, spot.x, spot.y)) {
      // 못 놓으면 떠난 자리로 되돌린다
      if (origin.kind === "map") {
        const back = anchorOf(positionAt(origin.info.motion, now()), size);
        origin.map.transferIn(row, back.x, back.y);
      } else parts.park(row, origin.mapKey, origin.cell);
      return fail("goal_blocked");
    }
    // 닿은 자리의 시야를 탐사 기록에 남긴다(걸어서 닿은 것과 같게 — 구독하지 않아도 그 2차맵을 볼 수 있다)
    target.vision.explore(userId, [anchorCenter(spot.x, spot.y, size)]).catch((error: unknown) => {
      log.error({ err: error, unitId: found.id }, "travel: teleport exploration record failed");
    });
    log.info({ unitId: found.id, from: fromKey, to: target.mapKey }, "operator teleport");
    return { ok: true, maps: 1, arriveAt: now() };
  };
}
