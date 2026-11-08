// 정부(행정 건물) 판 조회 시험 — docs/adr/2026-11-07-play-flow.md "WP-NPC"·"WP-NPC2"(시장). 가짜 세계(거울 도시·시설 줄·2차맵)로 판정만 본다.
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import type { SimUnit } from "@terra/sim";
import { UNIT_KIND_NPC_LEADER } from "../world/unitKinds.ts";
import { type GovernmentSource, createGovernmentReads, mayorView } from "./reads.ts";

const viewer: Viewer = { id: "u1", loginId: "tester", roles: ["player"] };
const NOW = 1_800_000_000_000;

function cityOf(id: number, owner: number, start: boolean) {
  return { id, owner, start, housing: 40, adminLevel: 2 };
}

/** 가짜 2차맵: 건물 10·11·12가 서 있고, 지도자 유닛 900(주체 101) */
function fakeMap(mapKey: number, leader: boolean) {
  return {
    mapKey,
    buildingOwner: (id: number) => (id === 10 || id === 11 || id === 12 ? 101 : undefined),
    forEachBuilding: (
      visit: (building: {
        id: number;
        ownerId: number | null;
        x: number;
        y: number;
        placement: { x: number; y: number; width: number; height: number; rotation: 0 };
      }) => void,
    ) => {
      // 건물 칸(placement)은 건물 모델 줄기가 더한 칸 — 판정에는 쓰지 않아 2×2로 둔다
      for (const id of [10, 11, 12]) {
        const x = id * 2;
        const y = id * 3;
        visit({ id, ownerId: 101, x, y, placement: { x, y, width: 2, height: 2, rotation: 0 } });
      }
    },
    forEachUnit: (visit: (unit: { id: number; ownerId: number; kind: number }) => void) => {
      if (leader) visit({ id: 900, ownerId: 101, kind: UNIT_KIND_NPC_LEADER });
      visit({ id: 901, ownerId: 101, kind: 0 });
    },
  };
}

function source(overrides: Partial<GovernmentSource> = {}): GovernmentSource {
  const cities = new Map([
    [3, cityOf(3, 101, true)],
    [4, cityOf(4, 101, true)],
  ]);
  const factions = new Map([[101, { code: "placeholder_nation_01", fixed: true }]]);
  const units = new Map<number, { city: number; recruit: SimUnit["recruit"]; satisfactionMilli: number }>();
  for (let i = 0; i < 5; i++)
    units.set(1000 + i, { city: i < 3 ? 4 : 3, recruit: null, satisfactionMilli: 60_000 + i * 1_000 });
  // 도시 3의 휴먼 1004는 구인 카드 휴먼(STR·DEX·AGI·VIT·INT·WIS 차례 스탯, 레벨 2)
  units.set(1004, {
    city: 3,
    recruit: { level: 2, stats: [9, 8, 7, 6, 15, 14], elements: { water: 1, fire: 0, wind: 0, earth: 0 } },
    satisfactionMilli: 72_400,
  });
  return {
    maps: new Map([
      [7, fakeMap(7, true)],
      [8, fakeMap(8, false)],
    ]),
    facility: (id) =>
      id === 10
        ? { facilityId: "government_hall", cityId: 4 }
        : id === 11
          ? { facilityId: "farm", cityId: 4 }
          : id === 12
            ? { facilityId: "government_hall", cityId: 3 }
            : undefined,
    runtime: () => ({
      world: { cities, factions, units },
      places: new Map([
        [3, { mapKey: 7, name: "Verdane" }],
        [4, { mapKey: 8, name: "Ashfield" }],
      ]),
      taxOf: (id) => (id === 101 ? 250 : undefined),
      // 도시 3의 시장 = 1004, 도시 4는 시장 없음(휴먼이 없는 도시처럼)
      mayorOf: (cityId) => (cityId === 3 ? 1004 : undefined),
    }),
    factionRowOf: (ownerId) => (ownerId === 101 ? 2 : undefined),
    myFactionRow: () => 2,
    knownCityIds: async () => new Set([3, 4]),
    nationName: (code) =>
      code === "placeholder_nation_01" ? { ko: "임시 국가 1", en: "Placeholder nation 1" } : undefined,
    leaderName: () => ({ ko: "임시 지도자 1", en: "Placeholder leader 1" }),
    ...overrides,
  };
}

describe("world.government", () => {
  it("수도가 아닌 시작 도시: 나라·지도자(수도에 있음)·세율·행정 레벨·휴먼 수", async () => {
    const reads = createGovernmentReads(source());
    const answer = await reads.government(viewer, 10, NOW);
    expect(answer.status).toBe("ready");
    expect(answer.city).toEqual({
      id: 4,
      name: "Ashfield",
      mapKey: "8",
      start: true,
      capital: false,
      adminLevel: 2,
      humans: 3,
      housing: 40,
    });
    expect(answer.nation).toEqual({
      id: 2,
      code: "placeholder_nation_01",
      name: { ko: "임시 국가 1", en: "Placeholder nation 1" },
      fixed: true,
      mine: true,
      taxBp: 250,
    });
    // 수도(도시 3, 2차맵 7)에 선 지도자 — 이 도시(2차맵 8)에는 없다
    expect(answer.leader).toEqual({
      unitId: 900,
      name: { ko: "임시 지도자 1", en: "Placeholder leader 1" },
      here: false,
    });
    expect(answer.mayor).toBeNull();
    // 행정 건물 기준 칸(이 도시 2차맵에서)
    expect(answer.building).toEqual({ x: 20, y: 30 });
  });

  it("수도의 행정 건물이면 capital, 내 나라가 아니면 mine false", async () => {
    const reads = createGovernmentReads(source({ myFactionRow: () => 9 }));
    const answer = await reads.government(viewer, 12, NOW);
    expect(answer.city?.capital).toBe(true);
    expect(answer.leader?.here).toBe(true);
    expect(answer.city?.humans).toBe(2);
    expect(answer.nation?.mine).toBe(false);
    // 시장(744 나): 그 휴먼의 레벨·1차 스탯(카드 차례 → 이름 칸)·만족도
    expect(answer.mayor).toEqual({
      unitId: 1004,
      level: 2,
      stats: { str: 9, dex: 8, agi: 7, vit: 6, int: 15, wis: 14 },
      baseline: false,
      satisfaction: 72,
    });
  });

  it("시장이 저장된 스탯이 없는 휴먼이면 기본값(모두 10, 레벨 1)", () => {
    expect(mayorView(7, { recruit: null, satisfactionMilli: 100_400 })).toEqual({
      unitId: 7,
      level: 1,
      stats: { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 },
      baseline: true,
      satisfaction: 100,
    });
  });

  it("행정 건물이 아니면 not_government, 없는 건물·모르는 도시는 unknown_building, 런타임 전이면 not_ready", async () => {
    expect((await createGovernmentReads(source()).government(viewer, 11, NOW)).status).toBe("not_government");
    expect((await createGovernmentReads(source()).government(viewer, 99, NOW)).status).toBe(
      "unknown_building",
    );
    const fog = createGovernmentReads(source({ knownCityIds: async () => new Set([3]) }));
    const hidden = await fog.government(viewer, 10, NOW);
    expect(hidden.status).toBe("unknown_building");
    expect(hidden.nation).toBeNull();
    const early = createGovernmentReads(source({ runtime: () => undefined }));
    expect((await early.government(viewer, 10, NOW)).status).toBe("not_ready");
  });
});
