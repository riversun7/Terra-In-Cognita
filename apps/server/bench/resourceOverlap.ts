// 목재·약초·목장 분포 겹침 측정(기획 D-536, docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12 D-536)") — node bench/resourceOverlap.ts
// 사용자 지적(2026-11-12, 원문) "목재와 약초 목장 분포가 너무 겹친다". 서버 NPC 경제·1차맵 자원 레이어와 같은 칸 몫 함수
// (@terra/shared/catchment cellSharesPm "supply")로 S2 시험 행성(F9) 땅 칸마다 세 원자재 몫을 셈하고 잰다:
// - 칸 단위 상관(피어슨 r), 위 20% 칸(몫이 큰 칸) 겹침(자카드), 두 원자재가 함께 500‰ 이상인 칸 몫, 바이옴마다 평균 몫.
// - 시작 도시(빈 세계 등급 배치 계획 — world/tierPlan.ts freshTierPlan, citySpacing.ts와 같은 계획) 배후지의 땅 몫(칸 몫 평균)과 도시 칸 시설 맞춤.
// - --planet <ID>: 다른 팩 행성(기본 s2_test_planet).
// 표는 Markdown이다. pnpm test에는 없다(행성 생성에 십수 초).
import { fileURLToPath } from "node:url";
import { loadContentPack } from "@terra/content/node";
import { type CellKey, FACES, cellKey, parseCellKey } from "@terra/planet";
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import { planetCellValues, planetValuesFromGeneration } from "@terra/planet/secondMap";
import { type CatchmentMaterial, cellSharesPm } from "@terra/shared/catchment";
import { START_WORLD_SEED, plannedCityRadiusMilli } from "@terra/sim";
import { landGather } from "../src/facilities/npcSeed.ts";
import { MAX_TEST_NATIONS, nationCode, nationStartOf, presetOfCode } from "../src/npc/nations.ts";
import { nationPresetsOf } from "../src/npc/presets.ts";
import { catchmentCellsMilli } from "../src/world/citySites.ts";
import { testMapKey } from "../src/world/testMaps.ts";
import { freshTierPlan } from "../src/world/tierPlan.ts";

const args = process.argv.slice(2);
const LEVEL = 9;
const loaded = loadContentPack(fileURLToPath(new URL("../../../content/core", import.meta.url)));
if (!loaded.pack) throw new Error("content/core does not validate");
const pack = loaded.pack;
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
const seed = START_WORLD_SEED;
const THREE = ["wood", "herb", "livestock"] as const satisfies readonly CatchmentMaterial[];
type Three = (typeof THREE)[number];

// ── 땅 칸마다 세 몫 ──
const n = 1 << LEVEL;
const shares: Record<Three, number[]> = { wood: [], herb: [], livestock: [] };
// 숲 바이옴 칸만(숲 가장자리·빈터 약초가 나무 많은 곳을 비켜 가는지)
const forestOnly: Record<Three, number[]> = { wood: [], herb: [], livestock: [] };
const FOREST = new Set(["taiga", "temperate_forest", "tropical_rainforest"]);
const biomeSums = new Map<string, { cells: number; wood: number; herb: number; livestock: number }>();
for (const face of FACES)
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const value = land(cellKey(face, LEVEL, i, j));
      if ((value.water & 3) !== 0) continue;
      const s = cellSharesPm(value, seed, "supply");
      for (const material of THREE) shares[material].push(s[material]);
      if (FOREST.has(value.biomeId ?? ""))
        for (const material of THREE) forestOnly[material].push(s[material]);
      const biome = value.biomeId ?? "-";
      const row = biomeSums.get(biome) ?? { cells: 0, wood: 0, herb: 0, livestock: 0 };
      row.cells += 1;
      for (const material of THREE) row[material] += s[material];
      biomeSums.set(biome, row);
    }
const cells = shares.wood.length;

const mean = (list: readonly number[]) => list.reduce((sum, v) => sum + v, 0) / Math.max(1, list.length);
const pearson = (a: readonly number[], b: readonly number[]): number => {
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let k = 0; k < a.length; k++) {
    const da = (a[k] ?? 0) - ma;
    const db = (b[k] ?? 0) - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  return va === 0 || vb === 0 ? 0 : cov / Math.sqrt(va * vb);
};
/** 위 20% 칸 집합(몫 > 0인 칸만 — 몫이 같은 칸이 많으면 문턱 이상 모두) */
const topSet = (list: readonly number[]): Set<number> => {
  const sorted = list.filter((v) => v > 0).toSorted((x, y) => y - x);
  const cut = sorted[Math.floor(sorted.length * 0.2)] ?? 1;
  const out = new Set<number>();
  list.forEach((v, k) => {
    if (v > 0 && v >= cut) out.add(k);
  });
  return out;
};
const jaccard = (a: Set<number>, b: Set<number>): number => {
  let both = 0;
  for (const k of a) if (b.has(k)) both += 1;
  const union = a.size + b.size - both;
  return union === 0 ? 0 : both / union;
};
const top = { wood: topSet(shares.wood), herb: topSet(shares.herb), livestock: topSet(shares.livestock) };
const pairs: [Three, Three][] = [
  ["wood", "herb"],
  ["wood", "livestock"],
  ["herb", "livestock"],
];
const lines: string[] = [];
lines.push(`# 목재·약초·목장 분포 겹침 — ${planetId} F${LEVEL}, 땅 칸 ${cells}`);
lines.push("");
lines.push("| 원자재 | 평균 몫(‰) | 몫 > 0 칸 | 몫 ≥ 500 칸 | 위 20% 칸 수 |");
lines.push("|---|---|---|---|---|");
for (const material of THREE) {
  const list = shares[material];
  const pos = list.filter((v) => v > 0).length;
  const high = list.filter((v) => v >= 500).length;
  lines.push(
    `| ${material} | ${mean(list).toFixed(0)} | ${((pos * 100) / cells).toFixed(1)}% | ${((high * 100) / cells).toFixed(1)}% | ${top[material].size} |`,
  );
}
lines.push("");
lines.push("| 짝 | 칸 상관 r | 위 20% 겹침(자카드) | 둘 다 ≥ 500‰ 칸 |");
lines.push("|---|---|---|---|");
for (const [a, b] of pairs) {
  let both = 0;
  for (let k = 0; k < cells; k++) if ((shares[a][k] ?? 0) >= 500 && (shares[b][k] ?? 0) >= 500) both += 1;
  lines.push(
    `| ${a}·${b} | ${pearson(shares[a], shares[b]).toFixed(3)} | ${jaccard(top[a], top[b]).toFixed(3)} | ${((both * 100) / cells).toFixed(1)}% |`,
  );
}
lines.push(
  `- 숲 바이옴 칸 ${forestOnly.wood.length}개만: 목재·약초 칸 상관 r ${pearson(forestOnly.wood, forestOnly.herb).toFixed(3)}`,
);
lines.push("");
lines.push("| 바이옴 | 칸 | 목재 | 약초 | 목장 |");
lines.push("|---|---|---|---|---|");
for (const [biome, row] of [...biomeSums].toSorted((x, y) => y[1].cells - x[1].cells))
  lines.push(
    `| ${biome} | ${row.cells} | ${(row.wood / row.cells).toFixed(0)} | ${(row.herb / row.cells).toFixed(0)} | ${(row.livestock / row.cells).toFixed(0)} |`,
  );

// ── 시작 도시 배후지 땅 몫 ──
const presets = nationPresetsOf(pack);
const avoidMaps = new Set<number>(Array.from({ length: 6 }, (_, index) => testMapKey(index)));
const nations = Array.from({ length: MAX_TEST_NATIONS }, (_, index) => {
  const code = nationCode(index + 1, presets);
  return { code, factionId: index + 1, start: nationStartOf(seed, presetOfCode(code, presets)) };
});
const plan = freshTierPlan({ faceLevel: LEVEL, land, seed, planetId, avoidMaps }, nations);
const startOf = new Map(nations.map((nation) => [nation.code, nation.start]));
const cityRows: { key: CellKey; nation: string; landPm: Record<Three, number>; lumber: boolean }[] = [];
for (const nation of plan.nations)
  nation.cities.forEach((raw, index) => {
    const key = parseCellKey(Number(raw));
    const start = startOf.get(nation.code);
    const need = plannedCityRadiusMilli(seed, {
      housing: start?.housing ?? seed.startHousing,
      tech: start?.tech ?? 1,
      capital: index === 0,
    });
    const own = catchmentCellsMilli(key, need, LEVEL);
    const sums: Record<Three, number> = { wood: 0, herb: 0, livestock: 0 };
    for (const cell of own) {
      const s = cellSharesPm(land(cell), seed, "supply");
      for (const material of THREE) sums[material] += s[material];
    }
    const landPm = {
      wood: Math.floor(sums.wood / own.length),
      herb: Math.floor(sums.herb / own.length),
      livestock: Math.floor(sums.livestock / own.length),
    };
    cityRows.push({ key, nation: nation.code, landPm, lumber: landGather(land(key), seed).lumber });
  });
lines.push("");
lines.push(`## 시작 도시 ${cityRows.length}곳 배후지 땅 몫(칸 몫 평균 ‰)`);
lines.push("");
lines.push("| 원자재 | 평균 | 최소 | 중앙 | 최대 | ≥ 100‰ 도시 | 가장 큰 몫인 도시 |");
lines.push("|---|---|---|---|---|---|---|");
for (const material of THREE) {
  const list = cityRows.map((row) => row.landPm[material]).toSorted((x, y) => x - y);
  const winners = cityRows.filter((row) => THREE.every((m) => row.landPm[material] >= row.landPm[m])).length;
  lines.push(
    `| ${material} | ${mean(list).toFixed(0)} | ${list[0] ?? 0} | ${list[Math.floor(list.length / 2)] ?? 0} | ${list.at(-1) ?? 0} | ${list.filter((v) => v >= 100).length} | ${winners} |`,
  );
}
lines.push("");
lines.push(
  `- 도시 칸 벌목장 맞춤(landGather lumber): ${cityRows.filter((row) => row.lumber).length}/${cityRows.length}`,
);
lines.push(
  `- 도시 사이 땅 몫 상관(목재·약초 ${pearson(
    cityRows.map((r) => r.landPm.wood),
    cityRows.map((r) => r.landPm.herb),
  ).toFixed(3)} · 목재·목장 ${pearson(
    cityRows.map((r) => r.landPm.wood),
    cityRows.map((r) => r.landPm.livestock),
  ).toFixed(3)} · 약초·목장 ${pearson(
    cityRows.map((r) => r.landPm.herb),
    cityRows.map((r) => r.landPm.livestock),
  ).toFixed(3)})`,
);
console.log(lines.join("\n"));
