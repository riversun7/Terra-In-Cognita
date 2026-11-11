// 도시 건물 배치 측정(docs/adr/2026-11-11-city-building-layout.md) — node bench/cityLayout.ts [도시 수] [--ascii]
// 사용자 요청(2026-11-11) "건물들도 바둑판 배열이 아닌 전략적으로 배치하도록하자". 새 세계 NPC 시작 도시가 받을 기본 시설을 그대로 재현해
// 옛 배치(설정 칸 city_layout_mode 0)와 전략 배치(1)를 같은 2차맵에서 잰다:
// - 콘텐츠 팩 S2 시험 행성(F9)을 생성하고, 빈 세계 등급 배치 계획(world/tierPlan.ts freshTierPlan — citySpacing.ts와 같다)의 도시를 고른다
//   (국가 차례로 수도·지방 도시 하나씩, 앞에서부터 도시 수만큼).
// - 도시마다 그 2차맵 지형(서버 지형 워커와 같은 buildTerrain)·원자재 오브젝트(채집과 같은 함수)로 씨앗(facilities/npcSeed.ts)을 두 번 돌린다.
// - 잰다(facilities/cityLayoutMetrics.ts): 행정 건물 치우침, 둘레 덮임(16방위), 가림(64줄), 행정 건물 ↔ 채집소·창고·숙소 거리, 옮김 거리
//   (채집소 → 가장 가까운 창고), 출퇴근 돌아감(‰), 갇힌 건물, 채집소 reach 안 맡는 원자재 수, 계획 ms.
// --ascii: 도시마다 가운데 둘레 97×97칸 그림(옛 · 새). 표는 Markdown이다. pnpm test에는 없다(행성 생성에 십수 초).
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadContentPack } from "@terra/content/node";
import { type CellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import { compileMapProps, planetCellValues, planetValuesFromGeneration } from "@terra/planet/secondMap";
import { PLACEMENT_SIZE, START_WORLD_SEED, type WorldSeedCoefficients } from "@terra/sim";
import { createContentEditState } from "../src/contentEdit/state.ts";
import { facilityCatalogOf } from "../src/facilities/catalog.ts";
import { layoutObjectsOf, layoutRoleOf } from "../src/facilities/cityLayoutGround.ts";
import { type LayoutBuilding, layoutMetrics } from "../src/facilities/cityLayoutMetrics.ts";
import { seedNpcFacilities } from "../src/facilities/npcSeed.ts";
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
const ascii = args.includes("--ascii");
const cityCount = Number(args.find((arg) => !arg.startsWith("--")) ?? 12);
const LEVEL = 9;

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
const picked: { nation: string; factionId: number; mapKey: CellKey; capital: boolean }[] = [];
for (const [index, nation] of plan.nations.entries())
  for (const round of [0, 1]) {
    const key = nation.cities[round];
    if (key !== undefined && picked.length < cityCount)
      picked.push({
        nation: nation.code,
        factionId: index + 1,
        mapKey: parseCellKey(Number(key)),
        capital: round === 0,
      });
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

interface Run {
  readonly buildings: LayoutBuilding[];
  readonly ms: number;
  readonly missing: number;
  readonly gatherReach: number;
}

function run(map: SecondMap, mapKey: CellKey, seed: WorldSeedCoefficients): Run {
  const facilities = new Map<number, FacilityRecord>();
  const city = { id: 1, factionId: 1, planetId: "p", mapKey, cellX: 128, cellY: 128, start: true };
  const t0 = performance.now();
  const result = seedNpcFacilities({
    maps: new Map([[mapKey, map]]),
    cities: [city],
    planetId: "p",
    ownerOfFaction: () => 1,
    service: { facilities, seedBuilt: (record) => facilities.set(record.buildingId, record) },
    catalog,
    seed,
    landOf: () => land(mapKey),
    gatherKinds: kinds,
    nowMs: 0,
  });
  const ms = performance.now() - t0;
  const buildings: LayoutBuilding[] = [];
  const objects = layoutObjectsOf(map, kinds, land(mapKey), seed);
  let gatherReach = 0;
  map.forEachBuilding((building) => {
    const record = facilities.get(building.id);
    const def = record ? catalog.facility(record.facilityId) : undefined;
    const role = layoutRoleOf(def?.stage);
    const { x, y, width, height } = building.placement;
    buildings.push({ role, x, y, width, height });
    if (role === "gather") {
      const own = new Set(kinds.flatMap((kind, index) => (kind.facility === def?.id ? [index] : [])));
      const cx = x + (width >> 1);
      const cy = y + (height >> 1);
      gatherReach += objects.filter(
        (object) =>
          own.has(object.kind) &&
          (object.x - cx) * (object.x - cx) + (object.y - cy) * (object.y - cy) <= 14 * 14,
      ).length;
    }
  });
  return { buildings, ms, missing: result.missing, gatherReach };
}

function picture(buildings: readonly LayoutBuilding[], map: SecondMap): string {
  const R = 48;
  const glyph: Record<string, string> = { core: "H", gather: "G", storage: "S", living: "L", other: "o" };
  const rows: string[] = [];
  for (let y = 128 - R; y <= 128 + R; y += 2) {
    let line = "";
    for (let x = 128 - R; x <= 128 + R; x++) {
      const hit = buildings.find((b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height);
      line += hit ? (glyph[hit.role] ?? "?") : map.isStandable(x, y, 1) ? "." : "~";
    }
    rows.push(line);
  }
  return rows.join("\n");
}

const fmt = (value: number | null) => (value === null ? "-" : String(value));
const lines: string[] = [];
const sums = {
  old: [] as ReturnType<typeof layoutMetrics>[],
  next: [] as ReturnType<typeof layoutMetrics>[],
};
const reach = { old: 0, next: 0 };
const times = { old: 0, next: 0 };
lines.push(`# 도시 건물 배치 측정 (s2_test_planet F${LEVEL}, 도시 ${picked.length})`);
lines.push("");
lines.push(
  "| 도시 | 배치 | 건물 | 못 세움 | 행정 치우침 | 둘레 덮임 /16 | 가림 ‰ | 행정↔숙소 | 행정↔창고 | 행정↔채집소 | 옮김(채집소→창고) | 출퇴근 ‰ | 갇힘 | 채집소 원자재 | ms |",
);
lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const city of picked) {
  const seed = nationSeedOf(START_WORLD_SEED, ...seedPartsOf(presetOfCode(city.nation, presets)));
  const c = decodeCellKey(city.mapKey);
  for (const mode of [0, 1] as const) {
    const map = mapOf(city.mapKey);
    const result = run(map, city.mapKey, { ...seed, cityLayoutMode: mode });
    const metrics = layoutMetrics({
      center: { x: 128, y: 128 },
      buildings: result.buildings,
      passable: (x, y) => map.isStandable(x, y, 1),
      plazaCells: seed.cityLayoutPlazaCells,
      size: PLACEMENT_SIZE,
    });
    (mode === 0 ? sums.old : sums.next).push(metrics);
    if (mode === 0) reach.old += result.gatherReach;
    else reach.next += result.gatherReach;
    if (mode === 0) times.old += result.ms;
    else times.next += result.ms;
    lines.push(
      `| ${c.face}:${c.i},${c.j}${city.capital ? " ★" : ""} ${city.nation} | ${mode === 0 ? "옛" : "전략"} | ${result.buildings.length} | ${result.missing} | ${metrics.hallOffset} | ${metrics.sectors} | ${metrics.screenPm} | ${fmt(metrics.hallToLodging)} | ${fmt(metrics.hallToStorage)} | ${fmt(metrics.hallToStation)} | ${fmt(metrics.haul)} | ${fmt(metrics.commutePm)} | ${metrics.walledIn} | ${result.gatherReach} | ${result.ms.toFixed(1)} |`,
    );
    if (ascii) {
      lines.push("");
      lines.push("```");
      lines.push(
        `${c.face}:${c.i},${c.j} ${city.nation} ${mode === 0 ? "옛" : "전략"} (H 행정 · L 숙소 · S 창고 · G 채집소 · o 기타 · ~ 막힘)`,
      );
      lines.push(picture(result.buildings, map));
      lines.push("```");
      lines.push("");
    }
    map.stop();
  }
}

const avg = (list: readonly (number | null)[]) => {
  const xs = list.filter((value): value is number => value !== null);
  return xs.length === 0 ? "-" : (xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(1);
};
lines.push("");
lines.push("| 평균 | 옛 | 전략 |");
lines.push("|---|---|---|");
const row = (name: string, pick: (m: ReturnType<typeof layoutMetrics>) => number | null) =>
  lines.push(`| ${name} | ${avg(sums.old.map(pick))} | ${avg(sums.next.map(pick))} |`);
row("행정 건물 치우침(칸)", (m) => m.hallOffset);
row("둘레 덮임(/16)", (m) => m.sectors);
row("가림(‰)", (m) => m.screenPm);
row("행정↔숙소(칸)", (m) => m.hallToLodging);
row("행정↔창고(칸)", (m) => m.hallToStorage);
row("행정↔채집소(칸)", (m) => m.hallToStation);
row("옮김: 채집소→가장 가까운 창고(칸)", (m) => m.haul);
row("출퇴근 돌아감(‰)", (m) => m.commutePm);
row("갇힌 건물", (m) => m.walledIn);
lines.push(`| 채집소 reach(14칸) 안 맡는 원자재 합 | ${reach.old} | ${reach.next} |`);
lines.push(`| 씨앗 시간 합(ms) | ${times.old.toFixed(0)} | ${times.next.toFixed(0)} |`);
console.log(lines.join("\n"));
