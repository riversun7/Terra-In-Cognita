// 공성 전투맵 = 도시 실제 배치가 버는 시간 측정(D-533, 질문 1046 가, docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)")
// — node bench/siegeLayout.ts [도시 수] [--edges 0,1,2,3] [--strength 20] [--physical 8] [--defenders 10]
// 사용자 원문(2026-11-11) "정부건물은 파괴시 함락되니 중앙에 두고 주변 건물이 시간을 벌수있게". 도시 건물 배치 측정(cityLayout.ts)과 같은
// 도시(S2 시험 행성 F9, 빈 세계 등급 배치의 국가 차례 수도·지방 도시)에 NPC 시작 시설을 세우고, 정원사 웨이브 공성 전투(서버와 같은
// waveBattleInit + 전투 판정)를 네 가지 전투맵에서 돌린다:
// - 열린: 옛 열린 맵(가운데 2×2 넥서스, 지형·건물 없음 — 이 줄기 전 서버)
// - 옛 배치: 옛 씨앗 배치(city_layout_mode 0, 행정 건물이 도시 칸 9칸 위)의 2차맵 구역(지형 + 건물)
// - 전략: 전략 배치(모드 1)의 2차맵 구역(지형 + 건물) — 지금 서버
// - 전략(평지): 전략 배치 건물만(지형 없음) — 건물 효과만 따로
// - 전략+성벽 N: 전략 배치 + 성벽 고리(설정 칸 city_wall_* 출발값, 질문 1048 가), 성벽·성문 내구도 N(5천·2만·6만)
// - (건물 못 뚫음): 보통 건물을 부숴 길을 낼 수 없게(질문 1073 가 전 판정), (넥서스 2천): 넥서스 = 옛 고정 2,000(질문 1069 가 전 판정).
//   그 밖은 지금 판정: 넥서스 = 행정 건물 지금 내구도, 공격 편은 보통 건물도 부숴 길을 낸다(2026-11-12, 기획 D-534)
// 잰다: 넥서스(행정 건물)에 처음 닿은 틱(공격 편 첫 건물 피해), 끝 틱, 이긴 편. 두 경우:
// - 걷기: 수비 없음, 물리형 크리쳐 strength마리 — 길이 얼마나 길어졌나
// - 웨이브: 수비 휴먼 defenders명 + 크리쳐 strength(물리형 physical) — 실제 웨이브 모양
// 시드 = (도시, 변) 섞음. 틱 100ms. 표는 Markdown. pnpm test에는 없다(행성 생성 십수 초 + 전투 수십 개).
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadContentPack } from "@terra/content/node";
import { type CellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import { compileMapProps, planetCellValues, planetValuesFromGeneration } from "@terra/planet/secondMap";
import {
  type Edge,
  START_WORLD_SEED,
  type SimUnit,
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
  TEST_SOCIETY_COEFFICIENTS,
  type WorldSeedCoefficients,
  createBattle,
  finishSpentWave,
  mix32,
  waveBattleInit,
  waveSiegeSpent,
} from "@terra/sim";
import type { SiegeLayout } from "@terra/sim/siegeArena";
import { createContentEditState } from "../src/contentEdit/state.ts";
import { facilityCatalogOf } from "../src/facilities/catalog.ts";
import { seedNpcFacilities } from "../src/facilities/npcSeed.ts";
import { citySiegeLayout } from "../src/facilities/siegeLayout.ts";
import type { FacilityRecord } from "../src/facilities/state.ts";
import { gatherKindsFromPack } from "../src/gather/kinds.ts";
import {
  MAX_TEST_NATIONS,
  nationCode,
  nationSeedOf,
  nationStartOf,
  presetOfCode,
  seedPartsOf,
} from "../src/npc/nations.ts";
import { nationPresetsOf } from "../src/npc/presets.ts";
import { buildTerrain, mapTerrainFromBuilt } from "../src/world/mapTerrain.ts";
import { mapPropInputsFromPack } from "../src/world/mapProps.ts";
import { createInlinePathService } from "../src/world/pathService.ts";
import { type SecondMap, createSecondMap } from "../src/world/secondMap.ts";
import { testMapKey } from "../src/world/testMaps.ts";
import { freshTierPlan } from "../src/world/tierPlan.ts";
import { emptyWorldStats } from "../src/world/worldStats.ts";

const args = process.argv.slice(2);
const option = (name: string, fallback: string): string => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? (args[at + 1] ?? fallback) : fallback;
};
const cityCount = Number(
  args.find((arg, index) => !arg.startsWith("--") && !args[index - 1]?.startsWith("--")) ?? 6,
);
const edges = option("edges", "0,1,2,3")
  .split(",")
  .map(Number)
  .filter((e): e is Edge => e === 0 || e === 1 || e === 2 || e === 3);
const STRENGTH = Number(option("strength", "20"));
const PHYSICAL = Number(option("physical", "8"));
const DEFENDERS = Number(option("defenders", "10"));
const TECH = 2;
const LEVEL = 9;
const MAP_SIZE = 128;
const NEXUS = 2000;
const c = TEST_COMBAT_COEFFICIENTS;

const loaded = loadContentPack(fileURLToPath(new URL("../../../content/core", import.meta.url)));
if (!loaded.pack || !loaded.source) throw new Error("content/core does not validate");
const pack = loaded.pack;
const effective = createContentEditState(loaded.source).effective();
const catalog = facilityCatalogOf(() => ({ facilities: effective.facilities, items: effective.items }))();
const kinds = gatherKindsFromPack(pack);
const planet = (pack.entries.get("planets") ?? []).find((entry) => entry.id === "s2_test_planet");
if (!planet) throw new Error("content/core has no s2_test_planet");
const input = planetInputFromDefinition(planet, pack.entries.get("biomes") ?? [], LEVEL);
const biomeIds = input.biomes.map((biome) => biome.id);
const details = runPlanetGenerator(input);
const values = planetValuesFromGeneration(details.fields, details, biomeIds);
const propRules = compileMapProps(mapPropInputsFromPack(pack), biomeIds);
const land = (key: CellKey) => planetCellValues(values, key);
const presets = nationPresetsOf(pack);
const avoidMaps = new Set<number>(Array.from({ length: 6 }, (_, index) => testMapKey(index)));
const nations = Array.from({ length: MAX_TEST_NATIONS }, (_, index) => {
  const code = nationCode(index + 1, presets);
  return { code, factionId: index + 1, start: nationStartOf(START_WORLD_SEED, presetOfCode(code, presets)) };
});
const plan = freshTierPlan(
  { faceLevel: LEVEL, land, seed: START_WORLD_SEED, planetId: "s2_test_planet", avoidMaps },
  nations,
);
const picked: { nation: string; mapKey: CellKey; capital: boolean }[] = [];
for (const nation of plan.nations)
  for (const round of [0, 1]) {
    const key = nation.cities[round];
    if (key !== undefined && picked.length < cityCount)
      picked.push({ nation: nation.code, mapKey: parseCellKey(Number(key)), capital: round === 0 });
  }

const versions = {
  secondMapGeneratorVersion: 1,
  planetGeneratorVersion: 3,
  definitionHash: "0".repeat(64),
  propRulesHash: "00000000",
};
const silent = { info: () => {}, warn: () => {}, error: () => {} };

function mapOf(mapKey: number): SecondMap {
  const built = buildTerrain(values, propRules, mapKey, versions);
  const holder: { map?: SecondMap } = {};
  const paths = createInlinePathService(
    () => (holder.map ? [holder.map.replicaInit()] : []),
    () => performance.now(),
  );
  const map = createSecondMap({
    mapKey,
    terrain: mapTerrainFromBuilt(built),
    paths,
    now: () => 0,
    stats: emptyWorldStats(),
    log: silent,
  });
  holder.map = map;
  paths.start();
  return map;
}

/** 도시를 세우고 공성 입력을 만든다(지형 있음·없음) */
function layoutsOf(mapKey: CellKey, seed: WorldSeedCoefficients) {
  const map = mapOf(mapKey);
  const records = new Map<number, FacilityRecord>();
  seedNpcFacilities({
    maps: new Map([[mapKey, map]]),
    cities: [{ id: 1, factionId: 1, planetId: "p", mapKey, cellX: 128, cellY: 128, start: true }],
    planetId: "p",
    ownerOfFaction: () => 1,
    service: { facilities: records, seedBuilt: (record) => records.set(record.buildingId, record) },
    catalog,
    seed,
    landOf: () => land(mapKey),
    gatherKinds: kinds,
    nowMs: 0,
  });
  const source = { records, catalog, rules: TEST_SOCIETY_COEFFICIENTS, at: 0 };
  const withTerrain = citySiegeLayout(map, 1, { x: 128, y: 128 }, source);
  const flat = citySiegeLayout(map, 1, { x: 128, y: 128 }, { ...source, terrain: false });
  map.stop();
  return { withTerrain, flat };
}

const defender = (id: number): SimUnit => ({
  id,
  city: 1,
  owner: 2,
  job: { job: 0, phase: 0, progressMs: 0, fatigue: 0 },
  pos: { x: 0, y: 0 },
  tripStep: 0,
  eventId: undefined,
  satisfactionMilli: 0,
  bornAtMs: 0,
  lifespanMs: 0,
  recruit: null,
  rebirths: 0,
});

interface Fight {
  /** 넥서스에 처음 닿은 틱(없으면 null) */
  readonly reach: number | null;
  readonly end: number;
  /** 웨이브가 이겼나 */
  readonly won: boolean;
  readonly ms: number;
}

function fight(layout: SiegeLayout | undefined, edge: Edge, seed: number, walk: boolean): Fight {
  const t0 = performance.now();
  const init = waveBattleInit(
    {
      battleId: 1,
      seed,
      defenderFaction: 2,
      defenders: walk ? [] : Array.from({ length: DEFENDERS }, (_, i) => defender(i + 1)),
      defenderTech: TECH,
      strength: STRENGTH,
      physical: walk ? STRENGTH : PHYSICAL,
      creatureTech: TECH,
      firstCreatureId: 1_900_000_000,
      mapSize: MAP_SIZE,
      nexusDurability: NEXUS,
      maxDefenders: DEFENDERS,
      layout,
      attackEdge: edge,
    },
    TEST_COMBAT_CATALOG,
    c,
  );
  const battle = createBattle(init, c);
  const nexus = battle.state.buildings.find((building) => building.id === 1);
  const start = nexus?.durability ?? 0;
  let reach: number | null = null;
  while (!battle.state.result) {
    battle.step([]);
    if (reach === null && (nexus?.durability ?? start) < start) reach = battle.state.tick;
    if (battle.state.tick % 50 === 0 && waveSiegeSpent(battle.state)) finishSpentWave(battle.state);
  }
  return {
    reach,
    end: battle.state.result.endTick,
    won: battle.state.result.winner === 1,
    ms: performance.now() - t0,
  };
}

const KINDS = [
  "open",
  "old",
  "next",
  "nextSolid",
  "flat",
  "wall5k",
  "wall20k",
  "wall20kSolid",
  "wall20kN2000",
  "wall60k",
] as const;
type Kind = (typeof KINDS)[number];
const LABEL: Record<Kind, string> = {
  open: "열린",
  old: "옛 배치",
  next: "전략",
  nextSolid: "전략(건물 못 뚫음)",
  flat: "전략(평지)",
  wall5k: "전략+성벽 5천",
  wall20k: "전략+성벽 2만",
  wall20kSolid: "전략+성벽 2만(건물 못 뚫음)",
  wall20kN2000: "전략+성벽 2만(넥서스 2천)",
  wall60k: "전략+성벽 6만",
};
/** 보통 건물을 부숴 길을 낼 수 없게(질문 1073 전 판정) */
const solid = (layout: SiegeLayout | undefined): SiegeLayout | undefined =>
  layout && {
    ...layout,
    buildings: layout.buildings.map((b) => (b.wall === true ? b : { ...b, solid: true })),
  };
/** 넥서스 내구도를 옛 고정 2,000으로(질문 1069 전 판정) */
const nexus2000 = (layout: SiegeLayout | undefined): SiegeLayout | undefined =>
  layout && {
    ...layout,
    buildings: layout.buildings.map((b) =>
      b.sourceId === layout.nexusSourceId ? { ...b, durability: NEXUS } : b,
    ),
  };
/** 성벽·성문 내구도만 바꾼 배치(성벽 고리 효과를 내구도마다) */
const withWalls = (layout: SiegeLayout | undefined, durability: number): SiegeLayout | undefined =>
  layout && {
    ...layout,
    buildings: layout.buildings.map((b) => (b.wall === true ? { ...b, durability } : b)),
    gates: (layout.gates ?? []).map((gate) => ({ ...gate, durability })),
  };
const results = new Map<string, Fight[]>();
const push = (key: string, value: Fight) => results.set(key, [...(results.get(key) ?? []), value]);
const lines: string[] = [];
const sec = (ticks: number | null) => (ticks === null ? "-" : ((ticks * c.tickMs) / 1000).toFixed(0));
lines.push(
  `# 공성 전투맵 배치가 버는 시간 (s2_test_planet F${LEVEL}, 도시 ${picked.length}, 변 ${edges.join("·")}, 크리쳐 ${STRENGTH}(물리 ${PHYSICAL}) · 수비 ${DEFENDERS}, 기술 ${TECH})`,
);
lines.push("");
lines.push(`| 도시 | 변 | 경우 | ${KINDS.map((kind) => LABEL[kind]).join(" | ")} |`);
lines.push(`|---|---|---|${KINDS.map(() => "---").join("|")}|`);
for (const [cityIndex, city] of picked.entries()) {
  const base = nationSeedOf(START_WORLD_SEED, ...seedPartsOf(presetOfCode(city.nation, presets)));
  const old = layoutsOf(city.mapKey, { ...base, cityLayoutMode: 0, cityWallMode: 0 });
  const next = layoutsOf(city.mapKey, { ...base, cityLayoutMode: 1, cityWallMode: 0 });
  const walled = layoutsOf(city.mapKey, { ...base, cityLayoutMode: 1, cityWallMode: 1 });
  const layouts: Record<Kind, SiegeLayout | undefined> = {
    open: undefined,
    old: old.withTerrain,
    next: next.withTerrain,
    nextSolid: solid(next.withTerrain),
    flat: next.flat,
    wall5k: withWalls(walled.withTerrain, 5000),
    wall20k: withWalls(walled.withTerrain, 20_000),
    wall20kSolid: solid(withWalls(walled.withTerrain, 20_000)),
    wall20kN2000: nexus2000(withWalls(walled.withTerrain, 20_000)),
    wall60k: withWalls(walled.withTerrain, 60_000),
  };
  const cc = decodeCellKey(city.mapKey);
  for (const edge of edges)
    for (const walk of [true, false]) {
      const seed = mix32(cityIndex * 7919 + edge * 131 + (walk ? 1 : 0));
      const cells: string[] = [];
      for (const kind of KINDS) {
        if (kind !== "open" && !layouts[kind]) {
          cells.push("행정 건물 없음");
          continue;
        }
        const out = fight(layouts[kind], edge, seed, walk);
        push(`${kind}|${walk ? "walk" : "wave"}`, out);
        cells.push(`${sec(out.reach)} · ${sec(out.end)}${out.won ? " 함락" : " 막음"}`);
      }
      lines.push(
        `| ${cc.face}:${cc.i},${cc.j}${city.capital ? " ★" : ""} | ${"북동남서"[edge]} | ${walk ? "걷기" : "웨이브"} | ${cells.join(" | ")} |`,
      );
    }
}
const mean = (list: readonly (number | null)[]) => {
  const xs = list.filter((value): value is number => value !== null);
  return xs.length === 0 ? null : xs.reduce((s, v) => s + v, 0) / xs.length;
};
lines.push("");
lines.push("| 평균 | 경우 | 닿음(초) | 끝(초) | 웨이브 승 | 전투 하나 CPU(ms) |");
lines.push("|---|---|---|---|---|---|");
for (const walk of ["walk", "wave"] as const)
  for (const kind of KINDS) {
    const list = results.get(`${kind}|${walk}`) ?? [];
    if (list.length === 0) continue;
    const reach = mean(list.map((f) => f.reach));
    const end = mean(list.map((f) => f.end));
    lines.push(
      `| ${LABEL[kind]} | ${walk === "walk" ? "걷기" : "웨이브"} | ${reach === null ? "-" : ((reach * c.tickMs) / 1000).toFixed(1)} | ${end === null ? "-" : ((end * c.tickMs) / 1000).toFixed(1)} | ${list.filter((f) => f.won).length}/${list.length} | ${(mean(list.map((f) => f.ms)) ?? 0).toFixed(0)} |`,
    );
  }
console.log(lines.join("\n"));
