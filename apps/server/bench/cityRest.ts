// 숙소 회복·채집소 옮김 측정(질문 1047 다·1049 나·1050 가, docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)")
// — node bench/cityRest.ts [도시 수]. bench/cityLayout.ts와 같은 도시(S2 시험 행성 F9, 빈 세계 등급 배치)에 전략 배치로 시작 도시 시설을 세우고,
// 처음 인구(주거 × npc_seed_population_pm)를 채집소에 고르게(자리 수까지, 남는 사람은 건물 없는 도시 직무) 나눈 뒤 npc/cityRest.ts 계획을 잰다:
// - 길 위(배치 그대로) · 길 밖(숙소를 모두 채집소 반대쪽 40칸 한곳에) · 숙소 없음(집) · 옛 숙소 수 3채: 일꾼 평균 셈 배율(‰), 일터 ↔ 쉼터 칸,
//   하루 일한 시간·쉼(회복 + 오감) 시간, 하루 산출 지수(일꾼 × 일한 몫, 숙소 없음 = 100).
// - 채집소마다 옮김 칸(→ 가장 가까운 창고), 왕복 시간, 100kg 나르는 시간(나르는 사람 1).
// 표는 Markdown이다. pnpm test에는 없다(행성 생성에 십수 초).
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { recipeEntrySchema } from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import { type CellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import { compileMapProps, planetCellValues, planetValuesFromGeneration } from "@terra/planet/secondMap";
import {
  START_WORLD_SEED,
  TEST_SOCIETY_COEFFICIENTS,
  type WorldSeedCoefficients,
  haulTimeMs,
  restDutyPm,
  restRecoveryPm,
  walkMsPerCell,
  workSharePm,
} from "@terra/sim";
import { createContentEditState } from "../src/contentEdit/state.ts";
import { facilityCatalogOf } from "../src/facilities/catalog.ts";
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
import { type CityRestPlan, type RestFacility, type RestLodging, planCityRest } from "../src/npc/cityRest.ts";
import { workAreaOf } from "../src/npc/humanPlaces.ts";
import type { TripArea } from "../src/world/bots.ts";
import { buildTerrain, mapTerrainFromBuilt } from "../src/world/mapTerrain.ts";
import { mapPropInputsFromPack } from "../src/world/mapProps.ts";
import { createInlinePathService } from "../src/world/pathService.ts";
import { type SecondMap, createSecondMap } from "../src/world/secondMap.ts";
import { testMapKey } from "../src/world/testMaps.ts";
import { freshTierPlan } from "../src/world/tierPlan.ts";
import { emptyWorldStats } from "../src/world/worldStats.ts";

const args = process.argv.slice(2);
// --pack <폴더>: 다른 콘텐츠 팩으로 잰다(아이템 무게 전·후 견주기, 질문 1094)
const packAt = args.indexOf("--pack");
const packDir = packAt >= 0 ? args[packAt + 1] : undefined;
const cityCount = Number(args.find((arg, i) => !arg.startsWith("--") && i !== packAt + 1) ?? 12);
const LEVEL = 9;

const loaded = loadContentPack(packDir ?? fileURLToPath(new URL("../../../content/core", import.meta.url)));
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

const rules = TEST_SOCIETY_COEFFICIENTS;

interface Seeded {
  readonly map: SecondMap;
  readonly facilities: Map<number, FacilityRecord>;
}

function seedCity(mapKey: CellKey, seed: WorldSeedCoefficients): Seeded {
  const map = mapOf(mapKey);
  const facilities = new Map<number, FacilityRecord>();
  const city = {
    id: 1,
    factionId: 1,
    planetId: "p",
    mapKey,
    cellX: 128,
    cellY: 128,
    start: true,
    housing: seed.startHousing,
  };
  seedNpcFacilities({
    maps: new Map([[mapKey, map]]),
    cities: [city],
    planetId: "p",
    ownerOfFaction: () => 1,
    service: { facilities, seedBuilt: (record) => facilities.set(record.buildingId, record) },
    catalog,
    seed,
    landOf: () => land(mapKey),
    gatherKinds: kinds,
    bedsPerLevel: rules.logistics.lodgingBedsPerLevel,
    nowMs: 0,
  });
  return { map, facilities };
}

interface Measure {
  readonly dutyPm: number;
  readonly commute: number;
  readonly workH: number;
  readonly restH: number;
  readonly output: number;
  readonly lodged: number;
}

function measure(cityRest: CityRestPlan): Measure {
  let duty = 0;
  let commute = 0;
  let share = 0;
  let rest = 0;
  let lodged = 0;
  const n = Math.max(1, cityRest.workers.length);
  for (const worker of cityRest.workers) {
    duty += restDutyPm(worker.place, worker.commuteCells, rules);
    commute += worker.commuteCells;
    const s = workSharePm(restRecoveryPm(worker.place, rules), worker.commuteCells, rules);
    share += s;
    rest += 1000 - s;
    if (worker.lodgingId !== null) lodged += 1;
  }
  return {
    dutyPm: Math.round(duty / n),
    commute: Math.round((commute / n) * 10) / 10,
    workH: Math.round((24 * share) / n / 100) / 10,
    restH: Math.round((24 * rest) / n / 100) / 10,
    output: share,
    lodged,
  };
}

const lines: string[] = [];
const totals = new Map<
  string,
  { duty: number; commute: number; work: number; rest: number; output: number; n: number }
>();
const haulRows: { cells: number; roundS: number; per100S: number }[] = [];
/** 채집소마다 아이템 무게로 잰 옮김(질문 1094·1090 가): 시설 → 칸·한 묶음 무게·가득 찬 창고 무게 */
const stationRows: { facility: string; cells: number; batchG: number; fullG: number }[] = [];
/** 인구 상한(질문 1089 나): 도시마다 주거·침대 */
const capRows: { housing: number; beds: number }[] = [];
/** 레시피(시설 → 첫 레시피 산출): recipes.json 원문을 스키마로 읽는다 */
const recipesText = loaded.source.files.get("recipes.json");
const recipesRaw: unknown = recipesText === undefined ? {} : JSON.parse(recipesText);
const recipeList: unknown =
  typeof recipesRaw === "object" && recipesRaw !== null ? Reflect.get(recipesRaw, "entries") : undefined;
const recipes = (Array.isArray(recipeList) ? (recipeList as readonly unknown[]) : []).map((raw) =>
  recipeEntrySchema.parse(raw),
);
/** 시설의 첫 레시피 한 묶음 무게(g, 팩 아이템 무게 — 무게가 없으면 0) */
const batchGramsOf = (facilityId: string): number => {
  const recipe = recipes.find((entry) => entry.facility.id === facilityId);
  return (recipe?.outputs ?? []).reduce(
    (sum, out) => sum + out.qty * (catalog.unitWeightOf(out.item.id) ?? 0),
    0,
  );
};
lines.push(`# 숙소 회복·채집소 옮김 측정 (s2_test_planet F${LEVEL}, 도시 ${picked.length})`);
lines.push("");
lines.push(
  "| 도시 | 숙소 | 일꾼 | 경우 | 숙소에서 쉼 | 셈 배율 ‰ | 일터↔쉼터 칸 | 하루 일 시간 | 하루 쉼(회복+오감) 시간 | 산출 지수 |",
);
lines.push("|---|---|---|---|---|---|---|---|---|---|");
for (const city of picked) {
  const seed = nationSeedOf(START_WORLD_SEED, ...seedPartsOf(presetOfCode(city.nation, presets)));
  const c = decodeCellKey(city.mapKey);
  const { map, facilities } = seedCity(city.mapKey, seed);
  const areas = new Map<number, TripArea>();
  map.forEachBuilding((building) => areas.set(building.id, workAreaOf(building.placement)));
  const stations: number[] = [];
  const lodgings: RestLodging[] = [];
  const stores: { x: number; y: number }[] = [];
  for (const record of [...facilities.values()].toSorted((a, b) => a.buildingId - b.buildingId)) {
    const def = catalog.facility(record.facilityId);
    const area = areas.get(record.buildingId);
    if (!def || !area) continue;
    if (def.gather) stations.push(record.buildingId);
    else if (def.stage === "living") lodgings.push({ id: record.buildingId, area, level: 1, ownerId: 1 });
    else if (def.stage === "storage") stores.push({ x: area.x, y: area.y });
  }
  const people = Math.floor((seed.startHousing * seed.populationPm) / 1000);
  const slots = stations.map(() => 0);
  let left = people;
  for (let round = 0; left > 0 && round < 10; round++)
    for (let i = 0; i < stations.length && left > 0; i++) {
      slots[i] = (slots[i] ?? 0) + 1;
      left -= 1;
    }
  const list: RestFacility[] = stations.map((id, i) => ({
    id,
    buildingId: id,
    workers: slots[i] ?? 0,
    station: true,
  }));
  if (left > 0) list.push({ id: 1_000_000, buildingId: null, workers: left });
  const base = {
    facilities: list,
    areas,
    home: { x: 128, y: 128 },
    housing: seed.startHousing,
    stores,
    rules,
  };
  // 길 밖: 숙소를 모두 채집소 평균 방향의 맞은편 40칸 한곳에 모은다(일꾼이 가운데를 지나 더 걸어간다)
  const stationAreas = stations.flatMap((id) => {
    const found = areas.get(id);
    return found ? [found] : [];
  });
  const sx = stationAreas.reduce((sum, a) => sum + a.x - 128, 0);
  const sy = stationAreas.reduce((sum, a) => sum + a.y - 128, 0);
  const len = Math.max(1, Math.hypot(sx, sy));
  const far = { x: Math.round(128 - (40 * sx) / len), y: Math.round(128 - (40 * sy) / len) };
  const mirrored = lodgings.map((lodging) => ({ ...lodging, area: { ...lodging.area, x: far.x, y: far.y } }));
  const cases: [string, CityRestPlan][] = [
    ["길 위(배치)", planCityRest({ ...base, lodgings })],
    ["길 밖(맞은편 40칸)", planCityRest({ ...base, lodgings: mirrored })],
    ["옛 숙소 3채", planCityRest({ ...base, lodgings: lodgings.slice(0, 3) })],
    ["숙소 없음", planCityRest({ ...base, lodgings: [] })],
  ];
  const none = measure(cases[3]?.[1] ?? planCityRest({ ...base, lodgings: [] })).output;
  for (const [name, cityPlan] of cases) {
    const result = measure(cityPlan);
    const index = Math.round((result.output * 100) / Math.max(1, none));
    lines.push(
      `| ${c.face}:${c.i},${c.j}${city.capital ? " ★" : ""} ${city.nation} | ${lodgings.length} | ${cityPlan.workers.length} | ${name} | ${result.lodged} | ${result.dutyPm} | ${result.commute} | ${result.workH} | ${result.restH} | ${index} |`,
    );
    const total = totals.get(name) ?? { duty: 0, commute: 0, work: 0, rest: 0, output: 0, n: 0 };
    total.duty += result.dutyPm;
    total.commute += result.commute;
    total.work += result.workH;
    total.rest += result.restH;
    total.output += index;
    total.n += 1;
    totals.set(name, total);
  }
  for (const id of stations) {
    const cells = cases[0]?.[1].facilities.get(id)?.haulCells ?? 0;
    haulRows.push({
      cells,
      roundS: (2 * cells * walkMsPerCell()) / 1000,
      per100S: haulTimeMs(100_000n, cells, 1, rules.gatherObjects.carryGrams) / 1000,
    });
    const record = facilities.get(id);
    const def = record ? catalog.facility(record.facilityId) : undefined;
    if (record && def)
      stationRows.push({
        facility: record.facilityId,
        cells,
        batchG: batchGramsOf(record.facilityId),
        fullG: (def.storageKg ?? 0) * 1000,
      });
  }
  capRows.push({ housing: seed.startHousing, beds: cases[0]?.[1].bedTotal ?? 0 });
  map.stop();
}

lines.push("");
lines.push("| 평균 | 셈 배율 ‰ | 일터↔쉼터 칸 | 하루 일 시간 | 하루 쉼 시간 | 산출 지수(숙소 없음 = 100) |");
lines.push("|---|---|---|---|---|---|");
for (const [name, t] of totals) {
  const n = Math.max(1, t.n);
  lines.push(
    `| ${name} | ${(t.duty / n).toFixed(0)} | ${(t.commute / n).toFixed(1)} | ${(t.work / n).toFixed(2)} | ${(t.rest / n).toFixed(2)} | ${(t.output / n).toFixed(1)} |`,
  );
}
lines.push("");
lines.push(
  `채집소 ${haulRows.length}곳 옮김(→ 가장 가까운 창고, 걷기 ${walkMsPerCell()}ms/칸, 화물 상한 ${rules.gatherObjects.carryGrams / 1000}kg, 나르는 사람 1)`,
);
lines.push("");
lines.push("| 칸 구간 | 채집소 | 평균 칸 | 왕복(초) | 100kg 나르기(초) |");
lines.push("|---|---|---|---|---|");
for (const [from, to] of [
  [0, 9],
  [10, 19],
  [20, 29],
  [30, 49],
  [50, 999],
] as const) {
  const rows = haulRows.filter((row) => row.cells >= from && row.cells <= to);
  if (rows.length === 0) continue;
  const mean = (pick: (row: (typeof rows)[number]) => number) =>
    (rows.reduce((sum, row) => sum + pick(row), 0) / rows.length).toFixed(1);
  lines.push(
    `| ${from}~${to === 999 ? "" : to} | ${rows.length} | ${mean((r) => r.cells)} | ${mean((r) => r.roundS)} | ${mean((r) => r.per100S)} |`,
  );
}
lines.push("");
// 인구 상한(질문 1089 나): 예전 max(주거, 침대) → 주거 + 침대
const capN = Math.max(1, capRows.length);
const capMean = (pick: (row: (typeof capRows)[number]) => number) =>
  (capRows.reduce((sum, row) => sum + pick(row), 0) / capN).toFixed(1);
lines.push("| 인구 상한(도시 평균) | 주거 | 침대 | 예전 max(주거, 침대) | 지금 주거 + 침대 |");
lines.push("|---|---|---|---|---|");
lines.push(
  `| 시작 도시 ${capRows.length} | ${capMean((r) => r.housing)} | ${capMean((r) => r.beds)} | ${capMean((r) => Math.max(r.housing, r.beds))} | ${capMean((r) => r.housing + r.beds)} |`,
);
lines.push("");
// 채집소 옮김(아이템 무게, 질문 1094·1090 가): 운반꾼 하나, 자동 옮김 간격 안에 가득 찬 창고를 비우나
const every = rules.gatherObjects.stationHaulMs;
lines.push(
  `채집소 옮김(팩 ${loaded.pack.version}, 운반꾼 하나, 화물 상한 ${rules.gatherObjects.carryGrams / 1000}kg, 자동 옮김 ${every / 60_000}분)`,
);
lines.push("");
lines.push(
  "| 시설 | 채집소 | 평균 칸 | 한 묶음(첫 레시피) kg | 한 묶음 나르기(초) | 가득 찬 창고 kg | 가득 찬 창고 나르기(초) | 간격 넘는 채집소 |",
);
lines.push("|---|---|---|---|---|---|---|---|");
for (const facility of [...new Set(stationRows.map((row) => row.facility))].toSorted()) {
  const rows = stationRows.filter((row) => row.facility === facility);
  const n = Math.max(1, rows.length);
  const mean = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((sum, row) => sum + pick(row), 0) / n;
  const carry = rules.gatherObjects.carryGrams;
  const batchS = mean((row) => haulTimeMs(BigInt(Math.round(row.batchG)), row.cells, 1, carry) / 1000);
  const fullS = mean((row) => haulTimeMs(BigInt(row.fullG), row.cells, 1, carry) / 1000);
  const over = rows.filter((row) => haulTimeMs(BigInt(row.fullG), row.cells, 1, carry) > every).length;
  lines.push(
    `| ${facility} | ${rows.length} | ${mean((r) => r.cells).toFixed(1)} | ${(mean((r) => r.batchG) / 1000).toFixed(2)} | ${batchS.toFixed(1)} | ${(mean((r) => r.fullG) / 1000).toFixed(0)} | ${fullS.toFixed(1)} | ${over} |`,
  );
}
console.log(lines.join("\n"));
