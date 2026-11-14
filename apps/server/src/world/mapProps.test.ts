// 팩 map_props → 생성기 규칙, 그리고 생성기 엄폐가 sim 통과 판정과 맞는지(ADR 46 4·5절, ADR 35 생성기 시험).
// - 벼랑 기준이 planet·sim에서 같다.
// - 팩 S2 시험 행성(F6)의 숲 2차맵을 sim 배치 격자(통과 폭 포함)로 만들면, 크기 등급 1이 설 수 있는 칸이
//   물·벼랑으로 갈린 곳을 빼고 모두 이어진다(엄폐가 가둔 곳이 없다. 2차맵 밖으로는 가장자리에서 이어진다).
import { loadContentPack } from "@terra/content/node";
import { FACES, cellKey } from "@terra/planet";
import { runPlanetGenerator } from "@terra/planet/generator";
import {
  SM_CLIFF_RELIEF_CM,
  compileMapProps,
  generateSecondMap,
  planetValuesFromGeneration,
} from "@terra/planet/secondMap";
import {
  CLIFF_RELIEF_CM,
  PLACEMENT_SIZE,
  createPlacementGrid,
  isPassable,
  SLOW_TABLE_SIZE,
  SURFACE_COST,
  placementCostsFromLayers,
} from "@terra/sim";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { packTestPlanetSpec } from "../planet/testSupport.ts";
import { mapPropArtCode } from "@terra/shared";
import { mapPropInputsFromPack, mapPropSlowByArtFromPack } from "./mapProps.ts";

const LEVEL = 6;
const loaded = loadContentPack(DEFAULT_CONTENT_DIR);
if (!loaded.pack) throw new Error("content/core does not validate");
const pack = loaded.pack;
const spec = packTestPlanetSpec();
const biomeIds = spec.input.biomes.map((biome) => biome.id);

/** sim 격자에서 크기 등급 1이 설 수 있는 칸의 네 방향 덩이 번호(덩이 첫 칸 번호, 설 수 없으면 −1) */
function labels(grid: ReturnType<typeof createPlacementGrid>): Int32Array {
  const size = PLACEMENT_SIZE;
  const label = new Int32Array(size * size).fill(-1);
  const queue = new Int32Array(size * size);
  for (let start = 0; start < size * size; start++) {
    if (label[start] !== -1 || !isPassable(grid, start % size, Math.floor(start / size), 1)) continue;
    let head = 0;
    let tail = 0;
    label[start] = start;
    queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++] ?? 0;
      const x = i % size;
      const y = (i - x) / size;
      for (const [nx, ny] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ] as const) {
        const j = ny * size + nx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size || label[j] !== -1) continue;
        if (!isPassable(grid, nx, ny, 1)) continue;
        label[j] = start;
        queue[tail++] = j;
      }
    }
  }
  return label;
}

describe("2차맵 소품 규칙(팩)과 sim 통과 판정", () => {
  it("벼랑 기준이 생성기와 sim에서 같다", () => {
    expect(SM_CLIFF_RELIEF_CM).toBe(CLIFF_RELIEF_CM);
  });

  it("팩 map_props가 S2 시험 행성 바이옴 표로 컴파일된다(숲·흩기 항목, 바이옴 참조는 ID)", () => {
    const inputs = mapPropInputsFromPack(pack);
    expect(inputs.length).toBeGreaterThan(0);
    for (const input of inputs) for (const { biome } of input.biomes) expect(typeof biome).toBe("string");
    const rules = compileMapProps(inputs, biomeIds);
    expect(rules.forest.length).toBeGreaterThan(0);
    expect(rules.scatter.some((rule) => rule.cover === 2)).toBe(true);
    expect(compileMapProps(mapPropInputsFromPack(pack), biomeIds).hash).toBe(rules.hash);
  });

  it("숲 2차맵: sim 격자에서 엄폐 때문에 갈린 덩이는 모두 가장자리에 닿는다(갇힌 곳 없음)", () => {
    const details = runPlanetGenerator({ ...spec.input, faceLevel: LEVEL });
    const values = planetValuesFromGeneration(details.fields, details, biomeIds);
    const rules = compileMapProps(mapPropInputsFromPack(pack), biomeIds);
    const n = 2 ** LEVEL;
    const keys: number[] = [];
    // 숲 밀도가 높은 땅 칸(바다·호수 비트 없음) 넷
    for (let cell = 0; cell < 6 * n * n && keys.length < 4; cell += 5) {
      if ((values.forest[cell] ?? 0) < 170 || ((values.water[cell] ?? 0) & 3) !== 0) continue;
      const face = Math.floor(cell / (n * n));
      const rest = cell - face * n * n;
      keys.push(cellKey(FACES[face] ?? 0, LEVEL, rest % n, Math.floor(rest / n)));
    }
    expect(keys.length).toBeGreaterThan(0);
    const size = PLACEMENT_SIZE;
    for (const key of keys) {
      const map = generateSecondMap(values, key, rules);
      const layers = { heights: map.heightsCm, surface: map.surface };
      const withCover = createPlacementGrid(placementCostsFromLayers({ ...layers, cover: map.cover }));
      const terrainOnly = createPlacementGrid(placementCostsFromLayers(layers));
      let blocked = 0;
      for (const cover of map.cover) if (cover === 2) blocked += 1;
      expect(blocked, `map ${key} has forest`).toBeGreaterThan(5000);
      // 엄폐까지 본 격자의 덩이와 엄폐를 뺀 격자의 묶음: 한 묶음에 덩이가 여럿이면 모두 가장자리에 닿아야 한다
      // (엄폐 때문에 끊겼지만 이웃 2차맵으로 이어진다). 가장자리에 닿지 않는 덩이가 다른 덩이와 한 묶음이면 갇힌 곳이다
      const pieces = labels(withCover);
      const groups = labels(terrainOnly);
      const touches = new Set<number>();
      for (let i = 0; i < size * size; i++) {
        const x = i % size;
        const y = (i - x) / size;
        const id = pieces[i] ?? -1;
        if (id >= 0 && (x === 0 || y === 0 || x === size - 1 || y === size - 1)) touches.add(id);
      }
      const piecesOfGroup = new Map<number, Set<number>>();
      for (let i = 0; i < size * size; i++) {
        const id = pieces[i] ?? -1;
        if (id < 0) continue;
        const group = groups[i] ?? -1;
        const set = piecesOfGroup.get(group) ?? new Set<number>();
        set.add(id);
        piecesOfGroup.set(group, set);
      }
      for (const [group, set] of piecesOfGroup) {
        if (set.size <= 1) continue;
        const enclosed = [...set].filter((id) => !touches.has(id));
        expect(enclosed, `map ${key} group ${group}`).toEqual([]);
      }
    }
  });

  it("느림 배율 표(질문 1223 나): 눈더미·모래언덕·늪 웅덩이만 1.5배, 생성기 입력에는 없다", () => {
    const table = mapPropSlowByArtFromPack(pack);
    expect(table.length).toBe(SLOW_TABLE_SIZE);
    const slow = ["snowdrift", "sand_dune", "mud_pool"].map(mapPropArtCode);
    for (const code of slow) expect(table[code]).toBe(1500);
    expect([...table.entries()].filter(([, pm]) => pm > 0).map(([code]) => code)).toEqual(
      slow.toSorted((a, b) => a - b),
    );
    for (const input of mapPropInputsFromPack(pack)) expect("slowPm" in input).toBe(false);
  });

  it("사막 2차맵: 모래언덕 칸의 지형 비용은 지표 비용 × 1.5, 다른 칸은 그대로", () => {
    const details = runPlanetGenerator({ ...spec.input, faceLevel: LEVEL });
    const values = planetValuesFromGeneration(details.fields, details, biomeIds);
    const rules = compileMapProps(mapPropInputsFromPack(pack), biomeIds);
    const desert = biomeIds.indexOf("desert");
    const n = 2 ** LEVEL;
    const table = mapPropSlowByArtFromPack(pack);
    const dune = mapPropArtCode("sand_dune");
    let checked = 0;
    for (let cell = 0; cell < 6 * n * n && checked < 2; cell += 3) {
      if (values.biome[cell] !== desert || ((values.water[cell] ?? 0) & 3) !== 0) continue;
      const face = Math.floor(cell / (n * n));
      const rest = cell - face * n * n;
      const key = cellKey(FACES[face] ?? 0, LEVEL, rest % n, Math.floor(rest / n));
      const map = generateSecondMap(values, key, rules);
      const layers = { heights: map.heightsCm, surface: map.surface, cover: map.cover, art: map.art };
      const plain = placementCostsFromLayers(layers);
      const slowed = placementCostsFromLayers({ ...layers, slowByArt: table });
      let dunes = 0;
      for (let i = 0; i < plain.length; i++) {
        const before = plain[i] ?? 0;
        const after = slowed[i] ?? 0;
        if (map.art[i] === dune && before > 0) {
          dunes += 1;
          expect(after).toBe(Math.floor((before * 1500) / 1000));
        } else expect(after).toBe(before);
      }
      if (dunes === 0) continue;
      checked += 1;
      // 지표 비용 표 범위 안(u16 상한에 닿지 않는다)
      expect(Math.max(...slowed)).toBeLessThanOrEqual(Math.floor((Math.max(...SURFACE_COST) * 1800) / 1000));
    }
    expect(checked, "desert maps with dunes").toBeGreaterThan(0);
  });
});
