// 도시 간격·배후지 측정(docs/adr/2026-11-11-city-catchment.md) — node bench/citySpacing.ts [배후지 반경 칸] [--old]
// 사용자 지적(2026-11-11) "npc세력의 도시 배치 … 너무 가깝게 바둑판배열로 다닥다닥". 서버가 새 세계에 세울 배치를 그대로 재현해 잰다:
// - 콘텐츠 팩 S2 시험 행성(F9)을 생성하고, 팩 국가 프리셋 16개(서버 차례: 1번 = 16번째 프리셋)와 국력 등급으로 빈 세계 등급 배치 계획
//   (world/tierPlan.ts freshTierPlan — /dev/world-layout [제안]과 [세계 새로 시작] 뒤 부팅이 같은 자리 함수)을 만든다. 피할 2차맵 = 시험 2차맵 6장.
// - 잰다: 도시 사이 거리(1차맵 칸·km), 가장 가까운 도시(같은 국가·다른 국가), 2차맵 나눠 쓰기, 수도에서 지방 도시 걸음(바둑판 모양),
//   배후지(반경 R) 겹침(둘 이상 배후지에 든 칸, 겹친 도시 쌍)과 도시마다 덮임(혼자일 때 · 가장 가까운 도시가 나눠 가진 뒤).
// - --old: 배후지 규칙을 끈 옛 배치(설정 칸 city_catchment_radius_cells = 0)로 잰다.
// - --fixed <칸>: 도시 크기와 상관없이 고정 반경(반경 아래 끝 = 위 끝 = 칸 × 1000) — 앞 줄기(city-spacing) 배치를 다시 잰다.
// - 바뀜 (2026-11-12, ADR "바뀜 (2026-11-12)"): 도시마다 요구 반경(처음 기간에 이를 크기 — 국가 등급 주거·기술, 수도는 더 크게)을 함께 보인다.
//   겹침 = 거리 < 두 요구 반경 합, 가장 가까운 거리의 변동 계수(표준편차 ÷ 평균 — 고른 바둑판이면 0에 가깝다), 등급마다 같은 국가 가장 가까운 거리.
// 표는 Markdown이다. pnpm test에는 없다(행성 생성에 십수 초).
import { fileURLToPath } from "node:url";
import { loadContentPack } from "@terra/content/node";
import { type CellKey, decodeCellKey, parseCellKey } from "@terra/planet";
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import { planetCellValues, planetValuesFromGeneration } from "@terra/planet/secondMap";
import { AVERAGE_CELL_EDGE_METERS, territoryMetric, territoryPoint } from "@terra/planet/territory";
import { CATCHMENT_MATERIALS, weightsOfFacilities } from "@terra/shared/catchment";
import { territoryDistanceMilli } from "@terra/shared/territory";
import { START_WORLD_SEED, plannedCityRadiusMilli } from "@terra/sim";
import { MAX_TEST_NATIONS, nationCode, nationStartOf, presetOfCode } from "../src/npc/nations.ts";
import { nationPresetsOf } from "../src/npc/presets.ts";
import { landGather } from "../src/facilities/npcSeed.ts";
import { catchmentCellsMilli, splitCatchments, summarize } from "../src/world/citySites.ts";
import { testMapKey } from "../src/world/testMaps.ts";
import { freshTierPlan } from "../src/world/tierPlan.ts";

const args = process.argv.slice(2);
const old = args.includes("--old");
const fixedAt = args.indexOf("--fixed");
const fixed = fixedAt >= 0 ? Number(args[fixedAt + 1] ?? 2) : undefined;
const radius = fixed ?? 2;
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
const seed = old
  ? { ...START_WORLD_SEED, catchmentRadiusCells: 0 }
  : fixed === undefined
    ? START_WORLD_SEED
    : { ...START_WORLD_SEED, catchmentMinRadiusMilli: fixed * 1000, catchmentMaxRadiusMilli: fixed * 1000 };
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

const lines: string[] = [];
lines.push(
  `# 도시 간격 측정 (${old ? "옛 배치" : fixed === undefined ? "도시 크기 배후지 배치" : `고정 반경 배후지 배치 R = ${fixed}칸`})`,
);
lines.push("");
lines.push(
  `- 행성 s2_test_planet F${LEVEL}, 국가 ${plan.nations.length}/${MAX_TEST_NATIONS}, 도시 ${cities.length}, 못 세운 도시 ${plan.short}, 계획 ${planMs.toFixed(0)}ms`,
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
lines.push("");
lines.push("| 국가 | 등급 | 도시 | 수도에서 걸음 (di,dj) |");
lines.push("|---|---|---|---|");
for (const nation of plan.nations)
  lines.push(
    `| ${nation.code} | ${nation.tier ?? "-"} | ${nation.cities.length}/${nation.wantCities} | ${offsetsOf(nation.code)} |`,
  );
lines.push("");
lines.push(
  `| 도시 | 국가 | 요구 반경 | 칸 수 혼자→몫 | 덮임‰ 혼자→몫 | ${CATCHMENT_MATERIALS.join(" · ")} (혼자 칸 수) |`,
);
lines.push("|---|---|---|---|---|---|");
for (const row of coverRows) {
  const c = decodeCellKey(row.city.mapKey);
  lines.push(
    `| ${c.face}:${c.i},${c.j}${row.city.capital ? " ★" : ""} | ${row.city.nation} | ${(row.city.needMilli / 1000).toFixed(2)} | ${row.alone.cells}→${row.own.cells} | ${row.alone.coverPm}→${row.own.coverPm} | ${CATCHMENT_MATERIALS.map((m) => row.alone.counts[m]).join(" · ")} |`,
  );
}
console.log(lines.join("\n"));
