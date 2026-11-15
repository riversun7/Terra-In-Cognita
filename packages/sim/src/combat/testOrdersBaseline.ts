// 시험 도우미: 명령 없는 옛 전투 묶음(파티·군단 명령 전과 결과가 같은지 — orders.test.ts)
import { runBattle } from "./battle.ts";
import type { BattleInit, BattleInput } from "./battleTypes.ts";
import { duel, openMap, unit } from "./testBattle.ts";

/** 옛 판정에 있던 입력만 쓴 전투들(유닛 명령·퇴각·참전·공성) */
export function baselineBattles(): { name: string; init: BattleInit; inputs: BattleInput[] }[] {
  const siegeMap = openMap(32);
  siegeMap.buildings = [{ id: 1, cells: [16 * 32 + 16], durability: 400, nexus: true }];
  const siege: BattleInit = {
    id: 2,
    kind: "siege",
    seed: 9,
    map: siegeMap,
    sides: [
      { id: 1, faction: 1, defender: false, edge: 3 },
      { id: 2, faction: 2, defender: true, edge: 1 },
    ],
    parties: [
      { id: 1, side: 1, retreatHpPct: 0 },
      { id: 2, side: 2, retreatHpPct: 30 },
    ],
    units: [
      ...Array.from({ length: 6 }, (_, i) => unit(1 + i, 1, 1, 4, 10 + i, { range: i % 2 === 0 ? 1 : 4 })),
      ...Array.from({ length: 4 }, (_, i) => unit(101 + i, 2, 2, 20, 14 + i)),
    ],
  };
  const big = duel(12, 7);
  return [
    { name: "duel6", init: duel(6, 1), inputs: [] },
    { name: "duel6s3", init: duel(6, 3), inputs: [] },
    {
      name: "duel12cmd",
      init: big,
      inputs: [
        { tick: 5, kind: "command", unit: 1, command: { kind: "move", cell: 20 * 32 + 12 } },
        { tick: 8, kind: "command", unit: 2, command: { kind: "attack", target: 0 } },
        { tick: 40, kind: "command", unit: 7, command: { kind: "retreat" } },
      ],
    },
    { name: "siege", init: siege, inputs: [] },
  ];
}

/** FNV-1a 32비트 두 번(다른 시작값) → 16자 지문 */
function fingerprint(text: string): string {
  const fnv = (start: number): string => {
    let h = start;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x0100_0193) >>> 0;
    return h.toString(16).padStart(8, "0");
  };
  return fnv(0x811c_9dc5) + fnv(0x0bad_f00d);
}

/** 끝 상태 지문 */
export function baselineHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const battle of baselineBattles()) {
    const { finalState, result } = runBattle(battle.init, battle.inputs);
    out[battle.name] = fingerprint(JSON.stringify(result) + finalState);
  }
  return out;
}
