// 공성 전투맵 시설 목표 시험 — 질문 1114 가(기획 D-535), world/battleTargets.ts siegeFacilityTargets. 웨이브 넥서스(질문 1190 나, D-540)
import type { BattleInit } from "@terra/sim";
import { describe, expect, it } from "vitest";
import {
  type WorldBattleInit,
  buildingDamageOf,
  siegeFacilityTargets,
  targetsOf,
  waveNexusTarget,
  waveSiegeTargets,
} from "./battleTargets.ts";
import type { BattleOutcome } from "./battles.ts";

describe("공성 전투맵 시설 목표(질문 1114 가)", () => {
  it("전투 건물 → 2차맵 건물 가운데 세계 시설만, 넥서스(따로 다룸)는 빼고 전투 건물 ID 차례로 단다", () => {
    const sources = new Map([
      [3, 900],
      [1, 100],
      [2, 500],
      [4, 777],
    ]);
    const facilities = new Set([100, 500, 900]);
    expect(siegeFacilityTargets(sources, (id) => facilities.has(id), 1)).toEqual([
      { building: 2, kind: "facility", id: 500 },
      { building: 3, kind: "facility", id: 900 },
    ]);
    expect(siegeFacilityTargets(new Map(), () => true, 1)).toEqual([]);
  });
});

/** 넥서스(전투 건물 1, 내구도 1000)·성벽(2, 400)이 있는 웨이브 공성 시작 자료. 편 1 = 공격(웨이브), 편 2 = 수비 */
function waveInit(): WorldBattleInit {
  const base: BattleInit = {
    id: 7,
    kind: "siege",
    seed: 1,
    map: {
      size: 4,
      passable: new Uint8Array(16).fill(1),
      cover: new Uint8Array(16),
      height: new Int32Array(16),
      buildings: [
        { id: 1, cells: [5], durability: 1000, nexus: true },
        { id: 2, cells: [10], durability: 400, nexus: false, wall: true },
      ],
    },
    sides: [
      { id: 1, faction: 0, defender: false, edge: 3 },
      { id: 2, faction: 9, defender: true, edge: 1 },
    ],
    parties: [],
    units: [],
  };
  const sources = new Map([
    [1, 500],
    [2, 600],
  ]);
  return { ...base, targets: waveSiegeTargets(sources, () => true, 1) };
}

const outcome = (winner: number): BattleOutcome => ({
  result: { winner, reason: winner === 1 ? "nexus" : "wipe", endTick: 10 },
  units: [],
  buildings: [
    { id: 1, durability: winner === 1 ? 0 : 700 },
    { id: 2, durability: 100 },
  ],
});

describe("웨이브 넥서스 피해(질문 1190 나)", () => {
  it("넥서스가 세계 시설이면 막아 냈을 때만 적용하는 목표를 단다(시작 자료를 다시 읽어도 남는다)", () => {
    expect(waveNexusTarget(new Map([[1, 500]]), () => true, 1)).toEqual({
      building: 1,
      kind: "facility",
      id: 500,
      defendedOnly: true,
    });
    expect(waveNexusTarget(new Map([[1, 500]]), () => false, 1)).toBeUndefined();
    expect(waveNexusTarget(new Map(), () => true, 1)).toBeUndefined();
    const stored: unknown = JSON.parse(JSON.stringify(waveInit()));
    expect(typeof stored === "object" && stored !== null ? targetsOf(stored) : []).toEqual(
      waveInit().targets,
    );
  });

  it("막아 낸 웨이브는 행정 건물도 깎고, 이긴 웨이브는 성벽만 깎는다(넥서스는 정원사 결과 규칙)", () => {
    expect(buildingDamageOf(waveInit(), outcome(2))).toEqual([
      { kind: "facility", id: 500, lost: 300, destroyed: false },
      { kind: "facility", id: 600, lost: 300, destroyed: false },
    ]);
    expect(buildingDamageOf(waveInit(), outcome(1))).toEqual([
      { kind: "facility", id: 600, lost: 300, destroyed: false },
    ]);
  });
});
