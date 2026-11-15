// 배 단위 채집(기획 D-568 "작업은 배 단위로 진행, 승선한 유닛들 독자행동x", docs/adr/2026-11-15-shipyard-harbor.md "바뀜 (D-564·D-568)") — gather/service.ts가 쓴다.
// - 한 배에 채집 줄은 하나다(배 단위 작업). 승객 누가 시켜도 같은 배의 앞 줄을 끝내고 새 줄이 그 배를 맡는다. 줄을 시킨 유닛 = 이끄는 유닛(멈추거나 내리면 끝).
// - 일꾼 = 배에 탄 같은 주인의 승객(쓸 수 있는 몸). 캐는 시간은 일꾼 가운데 가장 높은 주 스탯, 수확은 일꾼마다 보조 스탯으로 센 몫의 합, 피로는 일꾼 모두.
// - 캔 것은 배 창고(원장 위치 cargoLocation(배 ID), boats/hold.ts)에 든다. 상한 = 배 종류 창고(holdCapGrams — 배 고리로 읽는다).
import type { SecondMap } from "../world/secondMap.ts";
import { unavailable } from "../world/unitCondition.ts";

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
