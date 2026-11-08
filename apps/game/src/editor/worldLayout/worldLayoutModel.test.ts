// 세계 배치 화면 모형 시험 — 타일 이어 붙이기·칸 키 ↔ 위도·경도·국가 상태·지도 표시(기획 D-528).
import { cellKey } from "@terra/planet";
import type { PlanetTileData } from "@terra/protocol/planetTile";
import type { WorldPlacementNationView } from "@terra/shared/worldPlacementApi";
import { describe, expect, it } from "vitest";
import { cellAtLatLon } from "../planet/cellReport.ts";
import { assembleFlatFields, latLonOfKey, marksOf, nationStatus, tileSlots } from "./worldLayoutModel.ts";

function tile(
  face: number,
  mapLevel: number,
  i0: number,
  j0: number,
  size: number,
  biome: number,
): PlanetTileData {
  const heights = new Int16Array((size + 1) * (size + 1)).fill(100);
  heights[0] = 500;
  return {
    faceLevel: mapLevel + 3,
    mapLevel,
    face,
    i0,
    j0,
    size,
    heightsM: heights,
    biome: new Uint8Array(size * size).fill(biome),
    water: new Uint8Array(size * size),
    temperatureC: new Int8Array(size * size),
    humidity: new Uint8Array(size * size),
    forest: new Uint8Array(size * size),
    river: new Uint8Array(size * size),
    generatorVersion: 1,
    definitionHash: "0".repeat(64),
  };
}

const nation = (overrides: Partial<WorldPlacementNationView>): WorldPlacementNationView => ({
  factionId: 1,
  code: "npc_a",
  name: { ko: "가", en: "A" },
  cities: [],
  placement: null,
  ...overrides,
});

describe("세계 배치 모형", () => {
  it("타일 자리: 맵 레벨 6은 면마다 2 × 2(32칸 타일), 레벨 5는 면마다 하나", () => {
    expect(tileSlots(6)).toHaveLength(24);
    expect(tileSlots(5)).toHaveLength(6);
    expect(tileSlots(6)[1]).toEqual({ face: 0, i0: 32, j0: 0 });
  });

  it("타일을 칸 번호(면 × n² + j × n + i)에 이어 붙이고 칸 고도 = 꼭짓점 넷 평균", () => {
    const fields = assembleFlatFields([tile(1, 5, 0, 0, 32, 7), tile(4, 5, 0, 0, 32, 9)], 5);
    const n = 32;
    expect(fields.meta.faceLevel).toBe(5);
    expect(fields.biome[1 * n * n]).toBe(7);
    expect(fields.biome[4 * n * n + 5 * n + 3]).toBe(9);
    expect(fields.biome[0]).toBe(0);
    expect(fields.elevationM[1 * n * n]).toBe(200);
    expect(fields.elevationM[1 * n * n + 1]).toBe(100);
  });

  it("칸 키 가운데 위도·경도는 같은 칸으로 돌아온다", () => {
    for (const key of [cellKey(0, 9, 282, 328), cellKey(3, 9, 10, 500), cellKey(5, 9, 256, 256)]) {
      const point = latLonOfKey(key);
      expect(point).not.toBeNull();
      if (point) expect(cellAtLatLon(9, point.latDeg, point.lonDeg).key).toBe(key);
    }
    expect(latLonOfKey(12.5)).toBeNull();
  });

  it("국가 상태: 놓지 않음 자동, 든 시각 있으면 적용됨, 까닭 있으면 막힘, 그 밖 대기", () => {
    const placement = { mapKey: "1", placedAtMs: 1, placedBy: null, appliedAtMs: null, blocked: [] };
    expect(nationStatus(nation({}))).toBe("auto");
    expect(nationStatus(nation({ placement }))).toBe("pending");
    expect(nationStatus(nation({ placement: { ...placement, appliedAtMs: 5 } }))).toBe("applied");
    expect(nationStatus(nation({ placement: { ...placement, blocked: ["beacon"] } }))).toBe("blocked");
  });

  it("지도 표시: 도시·수도·놓은 자리·제안을 국가 차례 색으로", () => {
    const key = String(cellKey(0, 9, 282, 328));
    const marks = marksOf(
      [
        nation({
          cities: [
            { id: 1, name: "도시", mapKey: key, start: true, development: 3, capital: true },
            { id: 2, name: null, mapKey: key, start: true, development: 1, capital: false },
          ],
          placement: { mapKey: key, placedAtMs: 1, placedBy: "dev", appliedAtMs: null, blocked: [] },
        }),
        nation({ code: "npc_b", factionId: 2 }),
      ],
      new Map([["npc_b", key]]),
      (entry) => entry.code,
    );
    expect(marks.map((mark) => [mark.kind, mark.nation])).toEqual([
      ["capital", 0],
      ["city", 0],
      ["placed", 0],
      ["suggested", 1],
    ]);
    expect(marks.every((mark) => mark.x >= 0 && mark.x <= 1 && mark.y >= 0 && mark.y <= 1)).toBe(true);
  });
});
