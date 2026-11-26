// 채집 한 번의 일꾼별 수확(기획 D-570 1821 "유닛들마다 채집티어확률로 적용됨") — gather/service.ts doGather가 쓴다.
// 일꾼마다 자기 주·보조 스탯으로 티어를 굴리고(포획 장비의 최대 티어로 자른다 — objectYield.ts catchYieldItem), 보조 스탯으로 센 수확 ‰을 자기 나머지와 더해
// 온 묶음 수를 낸다. 걷는 줄(일꾼 = 이끄는 유닛 하나, 자르지 않음)은 옛 셈과 같다(같은 시드·같은 수확).
import type { BoatWorker } from "./boatCrew.ts";
import type { GatherKind } from "./kinds.ts";
import { type ObjectYieldCatalog, catchYieldItem } from "./objectYield.ts";
import { splitPm } from "./rules.ts";

export interface CrewHaulInput {
  readonly kind: Pick<GatherKind, "item" | "table" | "facility" | "tierRange" | "itemWeights">;
  readonly catalog: ObjectYieldCatalog;
  readonly objectId: number;
  /** 이번 캐기 차례(시드) */
  readonly seq: number;
  readonly workers: readonly BoatWorker[];
  /** 일꾼의 주·보조 스탯 */
  readonly statsOf: (unitId: number) => { readonly primary: number; readonly secondary: number };
  readonly level: number;
  readonly levelBonus: number;
  /** 보조 스탯 → 이번 수확(‰ 묶음) */
  readonly yieldPmOf: (secondary: number) => number;
  /** 일꾼마다 수확 나머지(‰ — 바꾼다) */
  readonly carry: Map<number, number>;
}

/** 일꾼별 수확(일꾼·자산·온 묶음 수, 일꾼 차례 — 0묶음·잡지 못한 일꾼은 빠진다) */
export function crewHaul(
  input: CrewHaulInput,
): { readonly unitId: number; readonly asset: string; readonly lots: number }[] {
  const out: { unitId: number; asset: string; lots: number }[] = [];
  for (const worker of input.workers) {
    const stats = input.statsOf(worker.unitId);
    const item = catchYieldItem(
      input.kind,
      input.catalog,
      {
        unitId: worker.unitId,
        objectId: input.objectId,
        seq: input.seq,
        primary: stats.primary,
        secondary: stats.secondary,
        level: input.level,
        levelBonus: input.levelBonus,
      },
      worker.maxTier,
    );
    if (item === null) continue;
    const lots = splitPm(input.yieldPmOf(stats.secondary), input.carry.get(worker.unitId) ?? 0);
    input.carry.set(worker.unitId, lots.carryPm);
    if (lots.whole > 0) out.push({ unitId: worker.unitId, asset: `item:${item}`, lots: lots.whole });
  }
  return out;
}
