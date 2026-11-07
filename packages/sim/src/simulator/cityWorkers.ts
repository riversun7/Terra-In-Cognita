// NPC 도시 일꾼 나누기 — 기획 답 532 나(D-518 "NPC 휴먼 배치는 굶음(D-433)부터 막기"), docs/adr/2026-11-07-play-flow.md "WP5 나라 성격".
// 서버 NPC 도시 경제(apps/server/src/npc/economy.ts syncCity)가 도시 휴먼을 그 도시 생산 시설(건물 + 도시 직무)에 나눌 때 쓴다.
// 시뮬 시나리오 경제는 시설 계획(cityPlan)의 일꾼 수를 그대로 쓰므로 부르지 않는다(시뮬 출력은 그대로).
// 1. 굶음 먼저: 생필품(식량·생활용품) 하루 몫을 내는 시설에 그 몫을 채울 만큼 일꾼을 먼저 두고, 그 시설이 쓰는 재료를 내는 시설에도
//    같은 식으로 둔다(사슬을 거슬러 올라감, 앞 시설 차례). 양은 레시피 대표 산출·작업량으로 센 하루 양이다(채집 추첨 시설은 대표값으로 어림 —
//    Assumed: 추첨 티어·필요 진행이 달라 실제 양과 다를 수 있다).
// 2. 남은 휴먼은 지금처럼 시설마다 한 명씩 돌려 자리 수까지 둔다(남으면 일하지 않는다).
// 실수 계산은 사칙연산만 쓴다(결정적, AGENTS 4장).
import { BASE_EFFICIENCY, type RecipeSpec } from "../economy/production.ts";
import type { NecessitySpec } from "../economy/upkeep.ts";

/** 일꾼을 받을 시설 하나(건물 또는 도시 직무) */
export interface CityWorkSlot {
  readonly id: number;
  readonly recipe: RecipeSpec;
  /** 자리 수(레벨 × 레벨당 자리) */
  readonly slots: number;
  /** 진행 속도(49 N32, 스탯 짝이 없는 시설은 1) */
  readonly progress: number;
  /** 한 번 캘 때 수확량(스탯 짝이 없는 시설은 1) */
  readonly yieldPerLot: number;
}

/** 일꾼 한 명이 하루에 돌리는 횟수(작업량 기준) */
const batchesPerWorkerDay = (slot: CityWorkSlot): number =>
  slot.recipe.work > 0 ? (24 * BASE_EFFICIENCY * Math.max(0, slot.progress)) / slot.recipe.work : 0;

/**
 * 도시 휴먼 humans명을 시설에 나눈다(위 머리 주석). 시설 ID → 일꾼 수(0이면 빠진다). 같은 입력이면 같은 답이다(시설 차례 = 배열 차례)
 */
export function assignCityWorkers(
  slots: readonly CityWorkSlot[],
  humans: number,
  necessities: readonly NecessitySpec[],
): Map<number, number> {
  const workers = new Map<number, number>();
  const total = Math.max(0, Math.trunc(humans));
  let free = total;
  const room = (slot: CityWorkSlot): boolean => (workers.get(slot.id) ?? 0) < slot.slots;

  // 1. 굶음 먼저: 하루 몫(기본 단위)과 채운 양
  const demand = new Map<string, number>();
  const covered = new Map<string, number>();
  const order: string[] = [];
  const want = (asset: string, qty: number): void => {
    if (qty <= 0) return;
    if (!demand.has(asset)) order.push(asset);
    demand.set(asset, (demand.get(asset) ?? 0) + qty);
  };
  for (const spec of necessities)
    if (spec.periodHours > 0) want(spec.asset, (total * Number(spec.perUnit) * 24) / spec.periodHours);
  for (let changed = true; changed && free > 0; ) {
    changed = false;
    // 사슬을 거슬러 올라가며 order가 길어진다(차례대로 훑는다)
    for (let index = 0; index < order.length && free > 0; index++) {
      const asset = order[index] ?? "";
      for (;;) {
        if ((covered.get(asset) ?? 0) >= (demand.get(asset) ?? 0) || free <= 0) break;
        const slot = slots.find(
          (entry) => room(entry) && entry.recipe.outputs.some((output) => output.asset === asset),
        );
        if (!slot) break;
        const batches = batchesPerWorkerDay(slot);
        if (batches <= 0) break;
        workers.set(slot.id, (workers.get(slot.id) ?? 0) + 1);
        free -= 1;
        changed = true;
        for (const output of slot.recipe.outputs)
          covered.set(
            output.asset,
            (covered.get(output.asset) ?? 0) + Number(output.qty) * Math.max(1, slot.yieldPerLot) * batches,
          );
        for (const input of slot.recipe.inputs) want(input.asset, Number(input.qty) * batches);
      }
    }
  }

  // 2. 남은 휴먼은 시설마다 한 명씩 돌려 자리 수까지
  while (free > 0) {
    let placed = false;
    for (const slot of slots) {
      if (free <= 0) break;
      if (!room(slot)) continue;
      workers.set(slot.id, (workers.get(slot.id) ?? 0) + 1);
      free -= 1;
      placed = true;
    }
    if (!placed) break;
  }
  return workers;
}
