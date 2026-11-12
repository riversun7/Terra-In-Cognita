// 도시 간격·배후지 측정(docs/adr/2026-11-11-city-catchment.md) — node bench/citySpacing.ts [배후지 반경 칸] [--old]
// 사용자 지적(2026-11-11) "npc세력의 도시 배치 … 너무 가깝게 바둑판배열로 다닥다닥". 서버가 새 세계에 세울 배치를 그대로 재현해 잰다:
// - 콘텐츠 팩 S2 시험 행성(F9)을 생성하고, 팩 국가 프리셋 16개(서버 차례: 1번 = 16번째 프리셋)와 국력 등급으로 빈 세계 등급 배치 계획
//   (world/tierPlan.ts freshTierPlan — /dev/world-layout [제안]과 [세계 새로 시작] 뒤 부팅이 같은 자리 함수)을 만든다. 피할 2차맵 = 시험 2차맵 6장.
// - 잰다: 도시 사이 거리(1차맵 칸·km), 가장 가까운 도시(같은 국가·다른 국가), 2차맵 나눠 쓰기, 수도에서 지방 도시 걸음(바둑판 모양),
//   배후지(반경 R) 겹침(둘 이상 배후지에 든 칸, 겹친 도시 쌍)과 도시마다 덮임(혼자일 때 · 가장 가까운 도시가 나눠 가진 뒤).
// - --old: 배후지 규칙을 끈 옛 배치(설정 칸 city_catchment_radius_cells = 0)로 잰다.
// - --planet <ID>: 다른 팩 행성(기본 s2_test_planet). --mountain-m <m>: 산지 고도를 바꿔 잰다.
// - --no-mountain: 광산 국가 산지 점수(설정 칸 city_catchment_mountain_site_pm)를 0으로 — 질문 1079 나 전 배치.
// - --fixed <칸>: 도시 크기와 상관없이 고정 반경(반경 아래 끝 = 위 끝 = 칸 × 1000) — 앞 줄기(city-spacing) 배치를 다시 잰다.
// - 바뀜 (2026-11-12, ADR "바뀜 (2026-11-12)"): 도시마다 요구 반경(처음 기간에 이를 크기 — 국가 등급 주거·기술, 수도는 더 크게)을 함께 보인다.
//   겹침 = 거리 < 두 요구 반경 합, 가장 가까운 거리의 변동 계수(표준편차 ÷ 평균 — 고른 바둑판이면 0에 가깝다), 등급마다 같은 국가 가장 가까운 거리.
// - 바뀜 (2026-11-12, 질문 1025 나): 국가마다 땅이 버티는 도시 수(어림, world/catchmentView.ts sustainOf — 세계 배치 화면과 같은 함수).
// - 바뀜 (2026-11-12, 기획 D-533 광석 고도 몫): 30일 채집 다툼이 서버 NPC 경제와 같은 칸 몫(@terra/shared/catchment cellSharesPm "supply" —
//   광석 = 고도 몫)과 땅 몫(캐려는 양 × 배후지 칸 몫 평균)을 쓴다. 광석을 얻는 도시(배후지 광석 몫 > 0)·높은 티어(산지 칸)·광산 빠르기
//   (받은 몫 × 땅 몫, 바닥 위)·하루 광석 캔 양과 도시 칸 고도를 함께 보인다.
// - 바뀜 (2026-11-12, 기획 D-534 — 질문 1079 나·1080 가): 높은 티어 광석을 얻는 국가(광산 도시 배후지에 산지 칸)·하루 산지 광석 양(철 이상이
//   나올 수 있는 몫 = 캔 광석 × 산지 몫 — 철 어림)과 목재(땅 몫 = 숲 밀도 몫 평균·벌목장 빠르기·하루 캔 양)를 함께 보인다.
// 표는 Markdown이다. pnpm test에는 없다(행성 생성에 십수 초).
import { fileURLToPath } from "node:url";
import { loadContentPack } from "@terra/content/node";
import { type CellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import { planetCellValues, planetValuesFromGeneration } from "@terra/planet/secondMap";
import { AVERAGE_CELL_EDGE_METERS, territoryMetric, territoryPoint } from "@terra/planet/territory";
import {
  CATCHMENT_MATERIALS,
  type CatchmentMaterial,
  type SupplyStock,
  catchmentAreaMilli,
  cellSharesPm,
  highOrePm,
  materialDemand,
  stepCatchmentSupply,
  weightsOfFacilities,
} from "@terra/shared/catchment";
import { territoryDistanceMilli } from "@terra/shared/territory";
import {
  START_WORLD_SEED,
  catchmentGrowthOf,
  catchmentSupplyOf,
  landShares,
  plannedCityRadiusMilli,
} from "@terra/sim";
import { MAX_TEST_NATIONS, nationCode, nationStartOf, presetOfCode } from "../src/npc/nations.ts";
import { nationPresetsOf } from "../src/npc/presets.ts";
import { landGather } from "../src/facilities/npcSeed.ts";
import { sustainOf } from "../src/world/catchmentView.ts";
import { catchmentCellsMilli, splitCatchments, summarize } from "../src/world/citySites.ts";
import { testMapKey } from "../src/world/testMaps.ts";
import { freshTierPlan } from "../src/world/tierPlan.ts";

const args = process.argv.slice(2);
const old = args.includes("--old");
// --no-mountain: 광산 국가 산지 점수를 끈 배치(질문 1079 나 전과 같다)
const noMountain = args.includes("--no-mountain");
const fixedAt = args.indexOf("--fixed");
const fixed = fixedAt >= 0 ? Number(args[fixedAt + 1] ?? 2) : undefined;
const radius = fixed ?? 2;
const LEVEL = 9;
const KM = AVERAGE_CELL_EDGE_METERS / 1000;

const loaded = loadContentPack(fileURLToPath(new URL("../../../content/core", import.meta.url)));
if (!loaded.pack) throw new Error("content/core does not validate");
const pack = loaded.pack;
// --planet <ID>: 다른 팩 행성으로 잰다(기본 s2_test_planet — 지금 세계 행성)
const planetAt = args.indexOf("--planet");
const planetId = planetAt >= 0 ? (args[planetAt + 1] ?? "s2_test_planet") : "s2_test_planet";
const planet = (pack.entries.get("planets") ?? []).find((entry) => entry.id === planetId);
if (!planet) throw new Error(`content/core has no ${planetId}`);
const input = planetInputFromDefinition(planet, pack.entries.get("biomes") ?? [], LEVEL);
const details = runPlanetGenerator(input);
const values = planetValuesFromGeneration(
  details.fields,
  details,
  input.biomes.map((biome) => biome.id),
);
const land = (key: CellKey) => planetCellValues(values, key);
const presets = nationPresetsOf(pack);
// --mountain-m <m>: 산지 고도(설정 칸 npc_seed_mine_height_m)를 바꿔 잰다(산지가 먼 행성에서 규칙이 듣는지 보기)
const mountainAt = args.indexOf("--mountain-m");
const mountainM = mountainAt >= 0 ? Number(args[mountainAt + 1]) : undefined;
const baseSeed = {
  ...START_WORLD_SEED,
  ...(noMountain ? { catchmentMountainSitePm: 0 } : {}),
  ...(mountainM === undefined ? {} : { mineMinHeightM: mountainM }),
};
const seed = old
  ? { ...baseSeed, catchmentRadiusCells: 0 }
  : fixed === undefined
    ? baseSeed
    : { ...baseSeed, catchmentMinRadiusMilli: fixed * 1000, catchmentMaxRadiusMilli: fixed * 1000 };
const avoidMaps = new Set<number>(Array.from({ length: 6 }, (_, index) => testMapKey(index)));
const nations = Array.from({ length: MAX_TEST_NATIONS }, (_, index) => {
  const code = nationCode(index + 1, presets);
  return { code, factionId: index + 1, start: nationStartOf(seed, presetOfCode(code, presets)) };
});
const t0 = performance.now();
const plan = freshTierPlan({ faceLevel: LEVEL, land, seed, planetId, avoidMaps }, nations);
const planMs = performance.now() - t0;

const metric = territoryMetric(LEVEL);
interface City {
  readonly id: number;
  readonly nation: string;
  readonly tier: string;
  readonly mapKey: CellKey;
  readonly capital: boolean;
  /** 요구 반경(1000분율 칸 — 새 규칙의 처음 기간 크기, 모드와 상관없이 같은 값으로 잰다) */
  readonly needMilli: number;
}
const cities: City[] = [];
const startOfNation = new Map(nations.map((nation) => [nation.code, nation.start]));
for (const nation of plan.nations)
  nation.cities.forEach((key, index) => {
    cities.push({
      id: cities.length + 1,
      nation: nation.code,
      tier: nation.tier ?? "-",
      mapKey: parseCellKey(Number(key)),
      capital: index === 0,
      needMilli: plannedCityRadiusMilli(START_WORLD_SEED, {
        housing: startOfNation.get(nation.code)?.housing ?? START_WORLD_SEED.startHousing,
        tech: startOfNation.get(nation.code)?.tech ?? 1,
        capital: index === 0,
      }),
    });
  });
const dist = (a: City, b: City) =>
  territoryDistanceMilli(territoryPoint(a.mapKey), territoryPoint(b.mapKey), metric) / 1000;
const fmt = (cells: number) => `${cells.toFixed(2)}칸 (${(cells * KM).toFixed(2)}km)`;
const stats = (list: readonly number[]) => {
  const sorted = list.toSorted((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
  return sorted.length === 0
    ? "-"
    : `최소 ${fmt(sorted[0] ?? 0)} · 중앙 ${fmt(at(0.5))} · 최대 ${fmt(sorted.at(-1) ?? 0)}`;
};

const nearestAny: number[] = [];
const nearestSame: number[] = [];
const nearestForeign: number[] = [];
let overlapPairsSame = 0;
let overlapPairsForeign = 0;
let needOverlapSame = 0;
let needOverlapForeign = 0;
const nearestSameByTier = new Map<string, number[]>();
let adjacentPairs = 0;
for (const a of cities) {
  let any = Infinity;
  let same = Infinity;
  let foreign = Infinity;
  for (const b of cities) {
    if (a === b) continue;
    const d = dist(a, b);
    any = Math.min(any, d);
    if (a.nation === b.nation) same = Math.min(same, d);
    else foreign = Math.min(foreign, d);
    if (a.id < b.id) {
      if (d < 2 * radius) {
        if (a.nation === b.nation) overlapPairsSame += 1;
        else overlapPairsForeign += 1;
      }
      if (d <= 1.5) adjacentPairs += 1;
      if (d * 1000 < a.needMilli + b.needMilli) {
        if (a.nation === b.nation) needOverlapSame += 1;
        else needOverlapForeign += 1;
      }
    }
  }
  if (same < Infinity) nearestSameByTier.set(a.tier, [...(nearestSameByTier.get(a.tier) ?? []), same]);
  if (any < Infinity) nearestAny.push(any);
  if (same < Infinity) nearestSame.push(same);
  if (foreign < Infinity) nearestForeign.push(foreign);
}
const perMap = new Map<number, number>();
for (const city of cities) perMap.set(city.mapKey, (perMap.get(city.mapKey) ?? 0) + 1);

// 수도에서 지방 도시 걸음(같은 면이면 (di, dj))
const offsetsOf = (nation: string): string => {
  const own = cities.filter((city) => city.nation === nation);
  const capital = own[0];
  if (!capital) return "";
  const c = decodeCellKey(capital.mapKey);
  return own
    .slice(1)
    .map((city) => {
      const d = decodeCellKey(city.mapKey);
      return d.face === c.face ? `(${d.i - c.i},${d.j - c.j})` : `면${d.face}`;
    })
    .join(" ");
};

const split = splitCatchments(
  cities.map((city) => ({ id: city.id, mapKey: city.mapKey, radiusMilli: city.needMilli })),
  radius,
  LEVEL,
);
/** 변동 계수(표준편차 ÷ 평균) */
const cv = (list: readonly number[]): string => {
  if (list.length < 2) return "-";
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
  const variance = list.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / list.length;
  return (Math.sqrt(variance) / mean).toFixed(3);
};
const startOfCode = new Map(nations.map((nation) => [nation.code, nation.start]));
const coverRows = cities.map((city) => {
  const weights = weightsOfFacilities(startOfCode.get(city.nation)?.facilities ?? {});
  const alone = summarize(catchmentCellsMilli(city.mapKey, city.needMilli, LEVEL), land, seed, weights);
  const own = summarize(split.own.get(city.id) ?? [], land, seed, weights);
  return { city, alone, own };
});

// 30일 채집 다툼(목표 크기 — 인구 = 주거, 등급 = 계획 등급, 수도는 더 크게; 가중치 = 국가 시작 채집 시설 수 가운데 NPC 씨앗이 그 땅에 짓는
// 것, 원자재 = 칸 몫 — 서버 npc/catchmentGeometry.ts·시뮬 catchmentRun.ts와 같은 셈)
const supplyRun = (() => {
  const growth = catchmentGrowthOf(baseSeed);
  const rules = catchmentSupplyOf(baseSeed);
  const sharesOf = new Map<number, number[]>();
  const shares = (cell: number): number[] => {
    let row = sharesOf.get(cell);
    if (row === undefined) {
      const value = land(parseCellKey(cell));
      const supply = cellSharesPm(value, baseSeed, "supply");
      row = [...CATCHMENT_MATERIALS.map((m) => supply[m]), highOrePm(value, baseSeed)];
      sharesOf.set(cell, row);
    }
    return row;
  };
  const capacity = (cell: number, material: CatchmentMaterial): number =>
    shares(cell)[CATCHMENT_MATERIALS.indexOf(material)] ?? 0;
  const supplyCities = cities.map((city) => {
    const start = startOfNation.get(city.nation);
    const housing = start?.housing ?? baseSeed.startHousing;
    const size = {
      population: city.capital ? Math.floor((housing * baseSeed.catchmentCapitalPm) / 1000) : housing,
      grade: baseSeed.catchmentPlanGrade + (city.capital ? 1 : 0),
      tech: start?.tech ?? 1,
    };
    const cells = catchmentCellsMilli(city.mapKey, city.needMilli, LEVEL);
    const area = Math.max(catchmentAreaMilli(size, growth), cells.length * 1000);
    // NPC 씨앗이 실제로 짓는 채집 시설만(도시 칸 행성 값 — landGather, 광산은 높은 땅에만)
    const fit = landGather(land(city.mapKey), baseSeed);
    const all = weightsOfFacilities(start?.facilities ?? {});
    const weights = {
      ...all,
      crop: fit.farm ? all.crop : 0,
      wood: fit.lumber ? all.wood : 0,
      ore: fit.mine ? all.ore : 0,
    };
    const max = Math.max(...CATCHMENT_MATERIALS.map((m) => weights[m] ?? 0));
    // 땅 몫(원자재마다 배후지 칸 몫 평균)·산지 몫 — 시뮬 catchmentRun.ts landShares 그대로
    const { landPm, highOrePm: high } = landShares(
      { cellsOf: () => cells, capacityPm: capacity, highOrePm: (cell) => shares(cell)[6] ?? 0 },
      cells,
    );
    const demand = Object.fromEntries(
      CATCHMENT_MATERIALS.map((m) => [
        m,
        Math.floor((materialDemand(area, weights[m] ?? 0, max, rules) * landPm[m]) / 1000),
      ]),
    );
    return {
      id: city.id,
      cells,
      demand,
      landPm,
      highOrePm: high,
      mine: (weights.ore ?? 0) > 0,
      lumber: (weights.wood ?? 0) > 0,
    };
  });
  const stock: SupplyStock = new Map();
  let last = new Map<
    number,
    { totalPm: number; orePm: number; oreGot: number; woodPm: number; woodGot: number }
  >();
  for (let day = 0; day < 30; day++)
    last = new Map(
      [...stepCatchmentSupply(supplyCities, stock, capacity, rules)].map(([id, r]) => [
        id,
        {
          totalPm: r.totalPm,
          orePm: r.supplyPm.ore,
          oreGot: r.got.ore,
          woodPm: r.supplyPm.wood,
          woodGot: r.got.wood,
        },
      ]),
    );
  const received = [...last.values()].map((r) => r.totalPm);
  const floor = START_WORLD_SEED.catchmentYieldFloorPm;
  const perCity = new Map(
    supplyCities.map((city) => {
      const r = last.get(city.id);
      const speed = city.mine ? Math.max(floor, Math.floor(((r?.orePm ?? 0) * city.landPm.ore) / 1000)) : 0;
      const woodSpeed = city.lumber
        ? Math.max(floor, Math.floor(((r?.woodPm ?? 0) * city.landPm.wood) / 1000))
        : 0;
      return [
        city.id,
        {
          orePm: city.landPm.ore,
          highOrePm: city.highOrePm,
          mine: city.mine,
          speed,
          oreGot: r?.oreGot ?? 0,
          woodLandPm: city.landPm.wood,
          lumber: city.lumber,
          woodSpeed,
          woodGot: r?.woodGot ?? 0,
        },
      ];
    }),
  );
  return {
    avg: Math.round(received.reduce((sum, v) => sum + v, 0) / Math.max(1, received.length)),
    min: Math.min(...received),
    stalled: received.filter((v) => v < START_WORLD_SEED.catchmentGrowthMinPm).length,
    perCity,
  };
})();

const lines: string[] = [];
lines.push(
  `# 도시 간격 측정 (${old ? "옛 배치" : fixed === undefined ? "도시 크기 배후지 배치" : `고정 반경 배후지 배치 R = ${fixed}칸`})`,
);
lines.push("");
lines.push(
  `- 행성 ${planetId} F${LEVEL}, 국가 ${plan.nations.length}/${MAX_TEST_NATIONS}, 도시 ${cities.length}, 못 세운 도시 ${plan.short}, 계획 ${planMs.toFixed(0)}ms`,
);
lines.push(`- 1차맵 칸 = 2차맵 하나 = 평균 ${KM.toFixed(4)}km`);
lines.push(`- 가장 가까운 도시(아무나): ${stats(nearestAny)}`);
lines.push(`- 가장 가까운 같은 국가 도시: ${stats(nearestSame)}`);
lines.push(`- 가장 가까운 다른 국가 도시: ${stats(nearestForeign)}`);
lines.push(
  `- 가장 가까운 거리 변동 계수(표준편차 ÷ 평균, 바둑판이면 0에 가깝다): 아무나 ${cv(nearestAny)} · 같은 국가 ${cv(nearestSame)}`,
);
for (const [tier, list] of [...nearestSameByTier].toSorted((a, b) => a[0].localeCompare(b[0])))
  lines.push(
    `- 등급 ${tier} 같은 국가 가장 가까운 도시: ${stats(list)} (도시 ${list.length}, 변동 계수 ${cv(list)})`,
  );
const needs = cities.map((city) => city.needMilli / 1000);
lines.push(
  `- 요구 반경(처음 기간 크기): ${stats(needs)}, 요구 반경으로 겹친 쌍(거리 < 두 반경 합): 같은 국가 ${needOverlapSame} · 다른 국가 ${needOverlapForeign}`,
);
lines.push(
  `- 30일 채집 다툼(목표 크기, 원자재 = 칸 몫·땅 몫): 받은 몫 평균 ${supplyRun.avg}‰ · 최저 ${supplyRun.min}‰ · 성장 멈춤(< ${START_WORLD_SEED.catchmentGrowthMinPm}‰) 도시 ${supplyRun.stalled}/${cities.length}`,
);
lines.push(`- 붙은 도시 쌍(거리 ≤ 1.5칸 = 변·꼭짓점 이웃 2차맵): ${adjacentPairs}`);
lines.push(`- 2차맵 하나에 도시 둘 이상: ${[...perMap.values()].filter((n) => n > 1).length}`);
lines.push(
  `- 배후지(반경 ${radius}칸 = ${(radius * KM).toFixed(1)}km) 겹친 도시 쌍(거리 < 2R): 같은 국가 ${overlapPairsSame} · 다른 국가 ${overlapPairsForeign}, 둘 이상 요구 배후지에 든 칸 ${split.shared}`,
);
const meanOf = (list: readonly number[]) =>
  list.length === 0 ? 0 : Math.round(list.reduce((sum, value) => sum + value, 0) / list.length);
lines.push(
  `- 덮임 평균(‰): 혼자 ${meanOf(coverRows.map((row) => row.alone.coverPm))} → 나눈 뒤 ${meanOf(coverRows.map((row) => row.own.coverPm))}, 배후지 칸 평균 혼자 ${meanOf(coverRows.map((row) => row.alone.cells))} → 나눈 뒤 ${meanOf(coverRows.map((row) => row.own.cells))}`,
);
const seedFits = { farm: 0, lumber: 0, mine: 0 };
for (const city of cities) {
  const fit = landGather(land(city.mapKey), seed);
  if (fit.farm) seedFits.farm += 1;
  if (fit.lumber) seedFits.lumber += 1;
  if (fit.mine) seedFits.mine += 1;
}
lines.push(
  `- NPC 씨앗이 자기 칸 행성 값만 보고 고르는 채집 시설(도시 수): 농장 ${seedFits.farm} · 벌목장 ${seedFits.lumber} · 광산 ${seedFits.mine} / ${cities.length}`,
);
// 광석(기획 D-533 고도 몫)
const ore = [...supplyRun.perCity.values()];
const pmStats = (list: readonly number[]) => {
  const sorted = list.toSorted((a, b) => a - b);
  return sorted.length === 0
    ? "-"
    : `최소 ${sorted[0]} · 중앙 ${sorted[Math.floor(sorted.length / 2)]} · 평균 ${meanOf(sorted)} · 최대 ${sorted.at(-1)}`;
};
const elevations = cities.map((city) => Math.round(land(city.mapKey)?.elevationM ?? 0));
lines.push(`- 도시 칸 고도(m): ${pmStats(elevations)}`);
lines.push(
  `- 광석(석재·구리)을 얻는 도시(배후지 광석 몫 > 0): ${ore.filter((row) => row.orePm > 0).length}/${cities.length} · 높은 티어(배후지에 산지 칸): ${ore.filter((row) => row.highOrePm > 0).length}/${cities.length}`,
);
lines.push(`- 배후지 광석 몫(‰): ${pmStats(ore.map((row) => row.orePm))}`);
lines.push(`- 배후지 산지 몫(‰, 높은 티어로 남는 몫): ${pmStats(ore.map((row) => row.highOrePm))}`);
const mines = ore.filter((row) => row.mine);
lines.push(
  `- 광산 빠르기(30일째 받은 몫 × 땅 몫, 바닥 ${START_WORLD_SEED.catchmentYieldFloorPm}‰, 광산 도시 ${mines.length}): ${pmStats(mines.map((row) => row.speed))}`,
);
lines.push(
  `- 30일째 하루 광석 캔 양(배후지 재고 단위, 광산 도시): ${pmStats(mines.map((row) => row.oreGot))}`,
);
// 높은 티어 광석(질문 1079 나): 광산 도시 가운데 배후지에 산지 칸이 있는 도시·국가, 하루 산지 광석 양(캔 광석 × 산지 몫 — 철 이상 어림)
const highCities = cities.filter((city) => {
  const row = supplyRun.perCity.get(city.id);
  return row?.mine === true && row.highOrePm > 0;
});
const highNations = new Set(highCities.map((city) => city.nation));
const highPerDay = cities.map((city) => {
  const row = supplyRun.perCity.get(city.id);
  return row?.mine ? Math.floor((row.oreGot * row.highOrePm) / 1000) : 0;
});
lines.push(
  `- 높은 티어(T3+) 광석을 얻는 광산 도시(배후지에 산지 칸): ${highCities.length}/${mines.length} · 국가 ${highNations.size}/${plan.nations.length}${highNations.size > 0 ? ` (${[...highNations].join(", ")})` : ""}`,
);
lines.push(
  `- 30일째 하루 산지 광석 양(캔 광석 × 산지 몫 — 철 이상이 나올 수 있는 몫, 재고 단위): 합 ${highPerDay.reduce((sum, value) => sum + value, 0)} · 그런 도시 ${pmStats(highPerDay.filter((value) => value > 0))}`,
);
// 목재(질문 1080 가 — 채집 다툼도 숲 밀도 몫)
const lumbers = ore.filter((row) => row.lumber);
lines.push(
  `- 배후지 목재 땅 몫(‰, 벌목장 도시 ${lumbers.length}): ${pmStats(lumbers.map((row) => row.woodLandPm))}`,
);
lines.push(
  `- 벌목장 빠르기(30일째 받은 몫 × 땅 몫, 바닥 위): ${pmStats(lumbers.map((row) => row.woodSpeed))}`,
);
lines.push(
  `- 30일째 하루 목재 캔 양(재고 단위, 벌목장 도시): 합 ${lumbers.reduce((sum, row) => sum + row.woodGot, 0)} · ${pmStats(lumbers.map((row) => row.woodGot))}`,
);
lines.push("");
lines.push("| 국가 | 등급 | 도시 | 수도에서 걸음 (di,dj) |");
lines.push("|---|---|---|---|");
for (const nation of plan.nations)
  lines.push(
    `| ${nation.code} | ${nation.tier ?? "-"} | ${nation.cities.length}/${nation.wantCities} | ${offsetsOf(nation.code)} |`,
  );
lines.push("");
lines.push(
  `| 도시 | 국가 | 요구 반경 | 칸 수 혼자→몫 | 덮임‰ 혼자→몫 | ${CATCHMENT_MATERIALS.join(" · ")} (혼자 칸 수) | 고도 m | 광석‰ | 산지‰ | 광산 빠르기‰ |`,
);
lines.push("|---|---|---|---|---|---|---|---|---|---|");
for (const row of coverRows) {
  const c = decodeCellKey(row.city.mapKey);
  const o = supplyRun.perCity.get(row.city.id);
  lines.push(
    `| ${c.face}:${c.i},${c.j}${row.city.capital ? " ★" : ""} | ${row.city.nation} | ${(row.city.needMilli / 1000).toFixed(2)} | ${row.alone.cells}→${row.own.cells} | ${row.alone.coverPm}→${row.own.coverPm} | ${CATCHMENT_MATERIALS.map((m) => row.alone.counts[m]).join(" · ")} | ${Math.round(land(row.city.mapKey)?.elevationM ?? 0)} | ${o?.orePm ?? "-"} | ${o?.highOrePm ?? "-"} | ${o?.mine ? o.speed : "-"} |`,
  );
}
// 국가 땅이 버티는 도시 수(질문 1025 나): 다른 국가 계획 도시는 피한다
lines.push("");
lines.push("| 국가 | 등급 | 등급 표 도시 | 땅이 버티는 도시 | 알맞은 빈 땅 칸 | ms |");
lines.push("|---|---|---|---|---|---|");
const planCities = cities.map((city) => ({
  code: city.nation,
  mapKey: city.mapKey,
  targetMilli: city.needMilli,
}));
let sustainMs = 0;
for (const nation of plan.nations) {
  const capital = cities.find((city) => city.nation === nation.code && city.capital);
  const province = plannedCityRadiusMilli(START_WORLD_SEED, {
    housing: startOfNation.get(nation.code)?.housing ?? START_WORLD_SEED.startHousing,
    tech: startOfNation.get(nation.code)?.tech ?? 1,
    capital: false,
  });
  if (!capital) continue;
  const t1 = performance.now();
  const sustain = sustainOf({
    faceLevel: LEVEL,
    land,
    seed,
    code: nation.code,
    center: capital.mapKey,
    world: [],
    plan: planCities,
    needsOf: (code) => weightsOfFacilities(startOfNation.get(code)?.facilities ?? {}),
    provinceMilli: province,
    capitalMilli: capital.needMilli,
  });
  const ms = performance.now() - t1;
  sustainMs += ms;
  lines.push(
    `| ${nation.code} | ${nation.tier ?? "-"} | ${nation.cities.length} | ${sustain ? `${sustain.cities}${sustain.capped ? "+" : ""}` : "-"} | ${sustain?.landCells ?? "-"} | ${ms.toFixed(0)} |`,
  );
}
lines.push(`- 버티는 도시 셈 합 ${sustainMs.toFixed(0)}ms`);
console.log(lines.join("\n"));
