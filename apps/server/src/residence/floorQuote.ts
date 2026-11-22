// 층 올리기 견적(사는 곳 조회 — 건물 판 [사는 곳] 카드가 보인다). 사용자 결정 D-591 1. 셈은 건물 서비스의 층 올리기(facilities/floors.ts)와 같은 식이고, 재료
// have는 채집소 판 레벨 올리기 견적(gather/stationReads.ts)과 같이 그 건물 도시 창고·창고 시설·그 2차맵 내 유닛 화물을 센다(판정은 명령 때 서버가 다시 한다).
import type { SocietyCoefficients } from "@terra/sim";
import { buildCostAt, buildTimeAt } from "@terra/shared/facilityBuild";
import type { ResidenceFloorQuote } from "@terra/shared/residence";
import type { Ledger } from "../economy/ledger.ts";
import { LIVING_STAGE, floorMaterials, floorMs, floorOpen, floorsOf } from "../facilities/floors.ts";
import { goodsStock } from "../facilities/materials.ts";
import { type PlaceWorld, buildingPlace, materialScope } from "../facilities/places.ts";
import type { JobRecord } from "../facilities/state.ts";

export interface FloorQuoteParts {
  places(): PlaceWorld | undefined;
  readonly ledger: Ledger;
  rules(): SocietyCoefficients;
  jobs(): ReadonlyMap<number, JobRecord>;
}

/** 그 주인의 주거 건물 층 올리기 견적(주거 건물이 아니거나 남의 건물이면 null) */
export function floorQuoteOf(
  parts: FloorQuoteParts,
  buildingId: number,
  ownerId: number,
): ResidenceFloorQuote | null {
  const world = parts.places();
  const record = world?.facilities.get(buildingId);
  if (!world || !record) return null;
  const catalog = world.catalog();
  const def = catalog.facility(record.facilityId);
  if (def?.stage !== LIVING_STAGE) return null;
  const place = buildingPlace(world, buildingId);
  if (place?.ownerId !== ownerId) return null;
  const rules = parts.rules();
  let running = false;
  let untilMs: number | null = null;
  for (const job of parts.jobs().values()) {
    if (job.buildingId !== buildingId || job.kind === "equipment") continue;
    running = true;
    if (job.kind === "floor") untilMs = Math.max(untilMs ?? 0, job.doneAtMs);
  }
  const block = floorOpen(record, def, rules.business) ?? (running ? "job_running" : null);
  const floors = floorsOf(record);
  const built = def.build !== undefined && record.level >= 1 ? def.build : undefined;
  const scope = materialScope(world, ownerId, place.mapKey, place.cityId);
  return {
    block,
    materials: floorMaterials(built ? buildCostAt(built, record.level) : [], floors, rules.business).map(
      (stack) => ({
        item: stack.item,
        name: catalog.itemName(stack.item) ?? null,
        qty: stack.qty,
        have: Number(goodsStock(parts.ledger, ownerId, stack.item, scope)),
      }),
    ),
    timeMs: built
      ? floorMs(
          buildTimeAt(built, record.level, (item) => catalog.weightOf(item), rules.facilityBuild).ms,
          floors,
          rules.business,
        )
      : 0,
    untilMs,
  };
}
