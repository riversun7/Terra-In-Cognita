// 배 단위 채집(기획 D-568 "작업은 배 단위로 진행, 승선한 유닛들 독자행동x", docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-564·D-568)") — gather/service.ts가 쓴다.
// - 한 배에 채집 줄은 하나다(배 단위 작업). 승객 누가 시켜도 같은 배의 앞 줄을 끝내고 새 줄이 그 배를 맡는다. 줄을 시킨 유닛 = 이끄는 유닛(멈추거나 내리면 끝).
// - 일꾼 = 배에 탄 같은 주인의 승객(쓸 수 있는 몸). 캐는 시간은 일꾼 가운데 가장 높은 주 스탯, 수확은 일꾼마다 보조 스탯으로 센 몫의 합, 피로는 일꾼 모두.
// - 캔 것은 배 창고(원장 위치 cargoLocation(배 ID), boats/hold.ts)에 든다. 상한 = 배 종류 창고(holdCapGrams — 배 고리로 읽는다).
// 바뀜(기획 D-570 1821 "어선의 함포칸에 장비하는 포획장비에 따라 채집가능한 최대티어가 정해지고 유닛들마다 채집티어확률로 적용됨. 함포처럼 채집사이클 및
// 포획장비마다 유닛배치. 어선은 함장1명 및 낚시선원 3명", docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-570)"): "탄 승객 모두 일꾼"을 버린다.
// - 일꾼 = 포획 장비를 맡은 낚시 선원(배 고리 catchCrew — boats/gear.ts가 선원 ↔ 단 장비를 짝짓는다). 선원마다 자기 스탯으로 티어를 굴리되 그 장비의
//   최대 티어로 자르고(objectYield.ts catchYieldItem), 수확도 선원마다 보조 스탯으로 센다. 캐는 시간 = 일꾼 가운데 가장 높은 주 스탯.
// - 장비를 맡은 선원이 없으면 줄을 시킨 유닛(이끄는 유닛) 혼자 설정 칸 boat_bare_catch_tier까지 잡는다(작은 배·장비 없는 배·NPC 배).
// - 배 고리가 없으면(시험·배 서비스 전) 이끄는 유닛 혼자, 티어를 자르지 않는다.
// - 피로는 일꾼과 이끄는 유닛. 이끄는 유닛이 지치면 넣고 끝.
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";

/** 배 고리가 주는 채집 일꾼(낚시 선원 ↔ 단 장비의 최대 티어)과 장비 없이 잡는 최대 티어 */
export interface BoatCatch {
  readonly fishers: readonly { readonly unitId: number; readonly maxTier: number }[];
  readonly bareMaxTier: number;
}

/** 배 채집 일꾼 하나(maxTier null = 티어를 자르지 않음) */
export interface BoatWorker {
  readonly unitId: number;
  readonly maxTier: number | null;
}

/**
 * 채집 줄의 일꾼(머리 주석). boatId null = 걷는 줄(이끄는 유닛 혼자, 자르지 않음). 배 줄은 쓸 수 있는 몸의 낚시 선원 → 없으면 이끄는 유닛 혼자 장비 없는 티어까지
 */
export function boatWorkers(
  map: SecondMap,
  boatId: number | null,
  ownerId: number,
  leadId: number,
  nowMs: number,
  info: BoatCatch | undefined,
): BoatWorker[] {
  if (boatId === null || !info) return [{ unitId: leadId, maxTier: null }];
  const able = new Set(boatCrew(map, boatId, ownerId, nowMs));
  const fishers = info.fishers.filter((row) => able.has(row.unitId));
  if (fishers.length > 0) return fishers.map((row) => ({ unitId: row.unitId, maxTier: row.maxTier }));
  return [{ unitId: leadId, maxTier: info.bareMaxTier }];
}

/** 배의 일꾼(같은 주인 승객, 쓸 수 있는 몸 — 유닛 번호 차례). 이끄는 유닛이 타 있으면 늘 넣는다 */
export function boatCrew(map: SecondMap, boatId: number, ownerId: number, nowMs: number): number[] {
  return map
    .passengers(boatId)
    .filter((unitId) => {
      const info = map.unitInfo(unitId);
      return info !== undefined && info.ownerId === ownerId && !unavailable(info.condition, nowMs);
    })
    .toSorted((a, b) => a - b);
}

/** 일꾼 모두에게 피로를 더한다(상한에서 멈춤). 이끄는 유닛이 상한이면 true */
export function tireCrew(
  map: SecondMap,
  crew: readonly number[],
  leadId: number,
  amount: number,
  max: number,
): boolean {
  let tired = false;
  for (const unitId of crew) {
    const info = map.unitInfo(unitId);
    if (!info) continue;
    const value = Math.min(max, info.job.fatigue + amount);
    map.setJob(unitId, { ...info.job, fatigue: value });
    if (unitId === leadId && value >= max) tired = true;
  }
  return tired;
}
