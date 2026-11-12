// 지형별 2차맵 오브젝트 수 측정(기획 D-536 "각각의 지형에는 최소 5가지 이상의 2차맵 오브젝트") — node bench/terrainObjects.ts [면 레벨] [지형마다 2차맵 수]
// 서버와 같은 길이다: 콘텐츠 팩 S2 시험 행성(기본 F9) → 2차맵 생성기(팩 map_props — 장식·물 위 소품) → 채집 오브젝트 자리(팩 gather_objects,
// 그 칸 행성 값의 바이옴·물 비트·광석 몫·원자재 — gather/world.ts와 같은 셈). 지형(1차맵 칸 바이옴)마다 서로 떨어진 2차맵을 고른다(기본 4장).
// 표(Markdown): 지형마다 2차맵 수, 오브젝트 종류 수(소품 그림 종류 + 채집 오브젝트 종류, 최소·평균), 소품 칸·채집 오브젝트·어군 수 평균,
// 자주 나온 종류. pnpm test에는 없다(행성 생성에 수십 초).
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { loadContentPack } from "@terra/content/node";
import { FACES, cellKey } from "@terra/planet";
import { planetInputFromDefinition, runPlanetGenerator } from "@terra/planet/generator";
import {
  compileMapProps,
  generateSecondMap,
  planetCellValues,
  planetValuesFromGeneration,
} from "@terra/planet/secondMap";
import { MAP_PROP_ARTS } from "@terra/shared";
import { cellMaterials, oreSharePm } from "@terra/shared/catchment";
import { START_WORLD_SEED } from "@terra/sim";
import { gatherKindsFromPack } from "../src/gather/kinds.ts";
import { placeGatherObjects } from "../src/gather/objects.ts";
import { mapPropInputsFromPack } from "../src/world/mapProps.ts";

const level = Number(process.argv[2] ?? 9);
const perBiome = Number(process.argv[3] ?? 4);

const loaded = loadContentPack(fileURLToPath(new URL("../../../content/core", import.meta.url)));
if (!loaded.pack) throw new Error("content/core does not validate");
const pack = loaded.pack;
const planet = (pack.entries.get("planets") ?? []).find((entry) => entry.id === "s2_test_planet");
if (!planet) throw new Error("content/core has no s2_test_planet");
const input = planetInputFromDefinition(planet, pack.entries.get("biomes") ?? [], level);
const biomeIds = input.biomes.map((biome) => biome.id);
const t0 = performance.now();
const details = runPlanetGenerator(input);
const values = planetValuesFromGeneration(details.fields, details, biomeIds);
const planetMs = performance.now() - t0;
const rules = compileMapProps(mapPropInputsFromPack(pack), biomeIds);
const kinds = gatherKindsFromPack(pack);

// 지형마다 서로 떨어진(면 안 맨해튼 거리 > 16칸) 칸들, 칸 번호 해시 차례로 고른다(행성 전체에 흩어지게)
const n = 2 ** level;
const byBiome = new Map<string, number[]>();
for (let cell = 0; cell < values.biome.length; cell++) {
  const id = biomeIds[values.biome[cell] ?? 0] ?? "?";
  const list = byBiome.get(id) ?? [];
  list.push(cell);
  byBiome.set(id, list);
}
const scramble = (cell: number) => Math.imul(cell ^ 0x9e37_79b9, 0x85eb_ca6b) >>> 0;
const keyOf = (cell: number) => {
  const face = FACES[Math.floor(cell / (n * n))] ?? 0;
  const rest = cell - face * n * n;
  return cellKey(face, level, rest % n, Math.floor(rest / n));
};

interface Row {
  biome: string;
  maps: number;
  kindsMin: number;
  kindsAvg: number;
  propCells: number;
  objects: number;
  schools: number;
  ms: number;
  top: string;
}
const rows: Row[] = [];
for (const biome of biomeIds) {
  const cells = (byBiome.get(biome) ?? []).toSorted((a, b) => scramble(a) - scramble(b));
  const picked: number[] = [];
  for (const cell of cells) {
    if (picked.length >= perBiome) break;
    const far = picked.every(
      (other) =>
        Math.floor(other / (n * n)) !== Math.floor(cell / (n * n)) ||
        Math.abs((other % n) - (cell % n)) +
          Math.abs((Math.floor(other / n) % n) - (Math.floor(cell / n) % n)) >
          16,
    );
    if (far) picked.push(cell);
  }
  if (picked.length === 0) continue;
  const seen = new Map<string, number>();
  let kindsMin = Number.POSITIVE_INFINITY;
  let kindsSum = 0;
  let propCells = 0;
  let objectSum = 0;
  let schoolSum = 0;
  let msSum = 0;
  for (const cell of picked) {
    const key = keyOf(cell);
    const started = performance.now();
    const map = generateSecondMap(values, key, rules);
    const land = planetCellValues(values, key);
    const objects = placeGatherObjects(
      {
        mapKey: key,
        art: map.art,
        surface: map.surface,
        materials: cellMaterials(land, START_WORLD_SEED),
        oreSharePm: oreSharePm(land, START_WORLD_SEED),
        biomeId: land.biomeId,
        waterBits: land.water,
      },
      kinds,
    );
    msSum += performance.now() - started;
    const names = new Set<string>();
    for (const art of map.art) {
      if (art === 0) continue;
      propCells += 1;
      names.add(`소품:${MAP_PROP_ARTS[art] ?? art}`);
    }
    for (const object of objects) {
      names.add(`채집:${kinds[object.kind]?.id ?? object.kind}`);
      if (object.route) schoolSum += 1;
    }
    objectSum += objects.length;
    kindsMin = Math.min(kindsMin, names.size);
    kindsSum += names.size;
    for (const name of names) seen.set(name, (seen.get(name) ?? 0) + 1);
  }
  const top = [...seen.entries()]
    .toSorted((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name)
    .join(", ");
  rows.push({
    biome,
    maps: picked.length,
    kindsMin,
    kindsAvg: kindsSum / picked.length,
    propCells: Math.round(propCells / picked.length),
    objects: Math.round(objectSum / picked.length),
    schools: schoolSum / picked.length,
    ms: msSum / picked.length,
    top,
  });
}

console.log(
  `S2 시험 행성 F${level}, 행성 생성 ${(planetMs / 1000).toFixed(1)}초, 지형마다 2차맵 ${perBiome}장까지\n`,
);
console.log(
  "| 지형 | 2차맵 | 종류 수 최소 | 평균 | 소품 칸 평균 | 채집 오브젝트 평균 | 어군 평균 | 2차맵 ms | 나온 종류(많이 나온 차례) |",
);
console.log("|---|---|---|---|---|---|---|---|---|");
for (const row of rows)
  console.log(
    `| ${row.biome} | ${row.maps} | ${row.kindsMin} | ${row.kindsAvg.toFixed(1)} | ${row.propCells} | ${row.objects} | ${row.schools.toFixed(1)} | ${row.ms.toFixed(0)} | ${row.top} |`,
  );
const short = rows.filter((row) => row.kindsMin < 5);
console.log(
  short.length === 0 ? "\n모든 지형 5종 이상" : `\n5종 아래: ${short.map((row) => row.biome).join(", ")}`,
);
