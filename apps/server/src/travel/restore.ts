// 이동 서비스 부팅 복구 — service.ts에서 나눔(그 파일 1,000줄 상한). docs/adr/2026-11-07-play-flow.md "WP9"(저장·복구),
// docs/adr/2026-11-15-unloaded-second-maps.md 6절(부팅: 띄우지 않은 2차맵의 유닛 행 = 좌표 유닛, 저장한 길은 그 자리에서 좌표 이동으로 잇는다).
import { type CellPoint, type Point, type SizeClass, anchorCenter } from "@terra/sim";
import { lastPoint } from "../world/mapGeometry.ts";
import type { SecondMap, UnitRow } from "../world/secondMap.ts";
import { type TransferRow, motionOfRow } from "../world/secondMapRows.ts";
import { UNIT_KIND_BOT } from "../world/unitKinds.ts";
import { isNpcKind } from "./npcJourney.ts";
import type { ParkedBook } from "./parked.ts";
import { type Hop, type RouteContext, anchorOf, hopFrom } from "./route.ts";
import type { TravelCommandResult, TravelDeps, Journey } from "./serviceTypes.ts";
import { loadTravels, type travelWriter } from "./store.ts";

type Info = NonNullable<ReturnType<SecondMap["unitInfo"]>>;

/** 복구가 쓰는 서비스 안쪽 몫 */
export interface RestoreParts {
  readonly deps: Pick<TravelDeps, "planetId" | "pool" | "log">;
  readonly maps: ReadonlyMap<number, SecondMap>;
  readonly parked: ParkedBook;
  readonly journeys: Map<number, Journey>;
  readonly store: ReturnType<typeof travelWriter>;
  readonly isTarget: (mapKey: number) => boolean;
  readonly loaded: (mapKey: number) => boolean;
  readonly contextOf: (journey: Journey, size: SizeClass, from?: number) => RouteContext;
  readonly float: (
    journey: Journey,
    row: TransferRow,
    from: number,
    exit: Point,
    speed: number,
    untilMs?: number,
  ) => boolean;
  readonly park: (row: TransferRow, mapKey: number, cell: CellPoint) => void;
  readonly conceal: (journey: Journey, map: SecondMap, info: Info, hop: Hop, untilMs: number) => boolean;
  readonly beginLeg: (journey: Journey, retryBusy: boolean) => Promise<TravelCommandResult>;
}

/**
 * 부팅: 띄우지 않은 2차맵의 유닛 행(봇 빼고)을 좌표 유닛 장부에 넣고(orphans — 쓰지 않는다), 저장한 길을 다시 잇는다(유닛을 다시 놓은 뒤).
 * 다시 시작한 수
 */
export async function restoreTravels(
  orphans: readonly UnitRow[] | undefined,
  parts: RestoreParts,
  /** main = 첫 복구(봇 길은 남겨 둔다), npc = 둘째 복구(NPC 사회 런타임이 휴먼을 읽은 뒤 봇 길만 — npcJourney.ts 머리 주석) */
  pass: "main" | "npc" = "main",
): Promise<number> {
  const { deps, maps, parked, journeys, store, isTarget, loaded, contextOf, float, park, conceal, beginLeg } =
    parts;
  const { log } = deps;
  // 띄우지 않은 2차맵의 유닛 행(봇 빼고) = 좌표 유닛(서 있음). 자리 = 그 행의 움직임이 끝난 점(쓰지 않는다 — 이미 그 자리다)
  for (const unit of pass === "main" ? (orphans ?? []) : []) {
    if (unit.planetId !== deps.planetId || maps.has(unit.mapKey) || unit.kind === UNIT_KIND_BOT) continue;
    if (!isTarget(unit.mapKey) || parked.get(unit.id)) continue;
    const motion = motionOfRow(unit);
    if (!motion) continue;
    parked.put(unit, unit.mapKey, anchorOf(lastPoint(motion), unit.size), unit.departAtMs, false);
  }
  if (!deps.pool) return 0;
  const rows = await loadTravels(deps.pool, deps.planetId);
  let resumed = 0;
  for (const row of rows) {
    // 유닛이 지나는 2차맵 가운데 어디 서 있나(좌표 유닛이면 그 2차맵). 없으면(사라짐) 줄을 지운다
    const leg = row.route.findIndex(
      (key) =>
        maps.get(key)?.unitInfo(row.unitId) !== undefined || parked.get(row.unitId)?.row.mapKey === key,
    );
    const kind = maps.get(row.route[leg] ?? -1)?.unitInfo(row.unitId)?.kind;
    // 봇 길은 둘째 복구에서만(첫 복구는 그 줄을 그대로 둔다). 그사이 새로 보낸 길이 있으면 그 줄이 맞다(지우지 않는다)
    if ((pass === "npc") !== (kind === UNIT_KIND_BOT) || journeys.has(row.unitId)) {
      if (pass === "main" && leg < 0) store.remove(row.unitId);
      continue;
    }
    if (leg < 0) {
      store.remove(row.unitId);
      continue;
    }
    const journey: Journey = {
      ...row,
      leg,
      seq: 0,
      motion: null,
      checkAtMs: null,
      hidden: null,
      speedFactor: 1,
      // NPC 이동(npcJourney.ts — 봇·지도자): 다시 켜도 스스로 걷지 않게 붙잡는다
      ...(kind !== undefined && isNpcKind(kind) ? { npc: true } : {}),
      sea:
        (maps.get(row.route[leg] ?? -1)?.unitInfo(row.unitId)?.domain ??
          parked.get(row.unitId)?.row.domain) === "sea",
    };
    journeys.set(row.unitId, journey);
    if (journey.npc === true) maps.get(row.route[leg] ?? -1)?.holdRoam(row.unitId, true);
    resumed += 1;
    const until = row.hiddenUntilMs;
    // 좌표 유닛이 된 유닛(띄우지 않은 2차맵): 그 자리에서 좌표 이동을 잇는다(건너뛰던 중이면 남은 시간 그대로)
    const spot = parked.get(row.unitId);
    if (spot) {
      const exit = anchorCenter(spot.cell.x, spot.cell.y, spot.row.size);
      const keep = until !== null && (leg === row.leg || leg === row.leg - 1) ? until : undefined;
      const taken = parked.take(row.unitId);
      if (taken && float(journey, taken, leg, exit, taken.speed, keep)) continue;
      if (taken) park(taken, spot.row.mapKey, spot.cell);
      journeys.delete(row.unitId);
      store.remove(row.unitId);
      resumed -= 1;
      continue;
    }
    // 건너뛰던 중: 유닛은 사라진 자리(변 끝)에 다시 놓였다 → 다시 숨기고 남은 시간을 기다린다
    const map = maps.get(row.route[leg] ?? -1);
    const info = map?.unitInfo(row.unitId);
    if (until !== null && leg === row.leg - 1 && !loaded(row.route[row.leg] ?? -1) && map && info) {
      const hop = hopFrom(contextOf(journey, info.size, leg), 0, lastPoint(info.motion));
      if (hop && conceal(journey, map, info, hop, until)) continue;
    }
    journey.hiddenUntilMs = null;
    if (leg !== row.leg || until !== null) store.save(journey);
    void beginLeg(journey, true);
  }
  if (rows.length > 0) log.info({ travels: rows.length, resumed, pass }, "world boot: travels resumed");
  return resumed;
}
