// 도시 간격·배후지 측정(docs/adr/2026-11-11-city-catchment.md) — node bench/citySpacing.ts [배후지 반경 칸] [--old]
// 사용자 지적(2026-11-11) "npc세력의 도시 배치 … 너무 가깝게 바둑판배열로 다닥다닥". 서버가 새 세계에 세울 배치를 그대로 재현해 잰다:
// - 콘텐츠 팩 S2 시험 행성(F9)을 생성하고, 팩 국가 프리셋 16개(서버 차례: 1번 = 16번째 프리셋)와 국력 등급으로 빈 세계 등급 배치 계획
//   (world/tierPlan.ts freshTierPlan — /dev/world-layout [제안]과 [세계 새로 시작] 뒤 부팅이 같은 자리 함수)을 만든다. 피할 2차맵 = 시험 2차맵 6장.
// - 잰다: 도시 사이 거리(1차맵 칸·km), 가장 가까운 도시(같은 국가·다른 국가), 2차맵 나눠 쓰기, 수도에서 지방 도시 걸음(바둑판 모양),
//   배후지(반경 R) 겹침(둘 이상 배후지에 든 칸, 겹친 도시 쌍)과 도시마다 덮임(혼자일 때 · 가장 가까운 도시가 나눠 가진 뒤).
// - --old: 배후지 규칙을 끈 옛 배치(설정 칸 city_catchment_radius_cells = 0)로 잰다.
// 표는 Markdown이다. pnpm test에는 없다(행성 생성에 십수 초).
import { fileURLToPath } from "node:url";
import { loadContentPack } from "@terra/content/node";
import { type CellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import { planetCellValues, planetValuesFromGeneration } from "@terra/planet/secondMap";
import { AVERAGE_CELL_EDGE_METERS, territoryMetric, territoryPoint } from "@terra/planet/territory";
import { CATCHMENT_MATERIALS, weightsOfFacilities } from "@terra/shared/catchment";
import { territoryDistanceMilli } from "@terra/shared/territory";
import { START_WORLD_SEED } from "@terra/sim";
import { MAX_TEST_NATIONS, nationCode, nationStartOf, presetOfCode } from "../src/npc/nations.ts";
import { nationPresetsOf } from "../src/npc/presets.ts";
import { landGather } from "../src/facilities/npcSeed.ts";
import { catchmentCells, splitCatchments, summarize } from "../src/world/citySites.ts";
import { testMapKey } from "../src/world/testMaps.ts";
import { freshTierPlan } from "../src/world/tierPlan.ts";

const args = process.argv.slice(2);
const old = args.includes("--old");
const radius = Number(args.find((arg) => !arg.startsWith("--")) ?? 2);
const LEVEL = 9;
const KM = AVERAGE_CELL_EDGE_METERS / 1000;

const loaded = loadContentPack(fileURLToPath(new URL("../../../content/core", import.meta.url)));
if (!loaded.pack) throw new Error("content/core does not validate");
const pack = loaded.pack;
const planet = (pack.entries.get("planets") ?? []).find((entry) => entry.id === "s2_test_planet");
if (!planet) throw new Error("content/core has no s2_test_planet");
const input = planetInputFromDefinition(planet, pack.entries.get("biomes") ?? [], LEVEL);
const details = runPlanetGenerator(input);
const values = planetValuesFromGeneration(
  details.fields,
  details,
  input.biomes.map((biome) => biome.id),
);
const land = (key: CellKey) => planetCellValues(values, key);
const presets = nationPresetsOf(pack);
const seed = old ? { ...START_WORLD_SEED, catchmentRadiusCells: 0 } : START_WORLD_SEED;
const avoidMaps = new Set<number>(Array.from({ length: 6 }, (_, index) => testMapKey(index)));
const nations = Array.from({ length: MAX_TEST_NATIONS }, (_, index) => {
  const code = nationCode(index + 1, presets);
  return { code, factionId: index + 1, start: nationStartOf(seed, presetOfCode(code, presets)) };
});
const t0 = performance.now();
const plan = freshTierPlan({ faceLevel: LEVEL, land, seed, planetId: "s2_test_planet", avoidMaps }, nations);
const planMs = performance.now() - t0;

const metric = territoryMetric(LEVEL);
interface City {
  readonly id: number;
  readonly nation: string;
  readonly tier: string;
  readonly mapKey: CellKey;
  readonly capital: boolean;
}
const cities: City[] = [];
for (const nation of plan.nations)
  nation.cities.forEach((key, index) => {
    cities.push({
      id: cities.length + 1,
      nation: nation.code,
      tier: nation.tier ?? "-",
      mapKey: parseCellKey(Number(key)),
      capital: index === 0,
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
    }
  }
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
  cities.map((city) => ({ id: city.id, mapKey: city.mapKey })),
  radius,
  LEVEL,
);
const startOfCode = new Map(nations.map((nation) => [nation.code, nation.start]));
const coverRows = cities.map((city) => {
  const weights = weightsOfFacilities(startOfCode.get(city.nation)?.facilities ?? {});
  const alone = summarize(catchmentCells(city.mapKey, radius, LEVEL), land, seed, weights);
  const own = summarize(split.own.get(city.id) ?? [], land, seed, weights);
  return { city, alone, own };
});

const lines: string[] = [];
lines.push(`# 도시 간격 측정 (${old ? "옛 배치" : "배후지 배치"}, 배후지 반경 R = ${radius}칸)`);
lines.push("");
lines.push(
  `- 행성 s2_test_planet F${LEVEL}, 국가 ${plan.nations.length}/${MAX_TEST_NATIONS}, 도시 ${cities.length}, 못 세운 도시 ${plan.short}, 계획 ${planMs.toFixed(0)}ms`,
);
lines.push(`- 1차맵 칸 = 2차맵 하나 = 평균 ${KM.toFixed(4)}km`);
lines.push(`- 가장 가까운 도시(아무나): ${stats(nearestAny)}`);
lines.push(`- 가장 가까운 같은 국가 도시: ${stats(nearestSame)}`);
lines.push(`- 가장 가까운 다른 국가 도시: ${stats(nearestForeign)}`);
lines.push(`- 붙은 도시 쌍(거리 ≤ 1.5칸 = 변·꼭짓점 이웃 2차맵): ${adjacentPairs}`);
lines.push(`- 2차맵 하나에 도시 둘 이상: ${[...perMap.values()].filter((n) => n > 1).length}`);
lines.push(
  `- 배후지(반경 ${radius}칸 = ${(radius * KM).toFixed(1)}km) 겹친 도시 쌍(거리 < 2R): 같은 국가 ${overlapPairsSame} · 다른 국가 ${overlapPairsForeign}, 둘 이상 배후지에 든 칸 ${split.shared}`,
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
lines.push("");
lines.push("| 국가 | 등급 | 도시 | 수도에서 걸음 (di,dj) |");
lines.push("|---|---|---|---|");
for (const nation of plan.nations)
  lines.push(
    `| ${nation.code} | ${nation.tier ?? "-"} | ${nation.cities.length}/${nation.wantCities} | ${offsetsOf(nation.code)} |`,
  );
lines.push("");
lines.push(
  `| 도시 | 국가 | 칸 수 혼자→몫 | 덮임‰ 혼자→몫 | ${CATCHMENT_MATERIALS.join(" · ")} (혼자 칸 수) |`,
);
lines.push("|---|---|---|---|---|");
for (const row of coverRows) {
  const c = decodeCellKey(row.city.mapKey);
  lines.push(
    `| ${c.face}:${c.i},${c.j}${row.city.capital ? " ★" : ""} | ${row.city.nation} | ${row.alone.cells}→${row.own.cells} | ${row.alone.coverPm}→${row.own.coverPm} | ${CATCHMENT_MATERIALS.map((m) => row.alone.counts[m]).join(" · ")} |`,
  );
}
console.log(lines.join("\n"));
