// 웨이브가 들어오는 변 = 모함 쪽(질문 1067 가, gardener.ts waveEdgeOnPlanet) 시험. 값은 형식 확인용이다.
import { type Face, cellKey } from "@terra/planet";
import { waveAttackEdge } from "@terra/sim/siegeArena";
import { describe, expect, it } from "vitest";
import { waveEdgeOnPlanet } from "./gardener.ts";

const at = (i: number, j: number, face: Face = 0) => cellKey(face, 9, i, j);

describe("웨이브 변(모함 쪽)", () => {
  it("2차맵 축: x = 면 i가 커지는 쪽(동), 행 = 면 j가 작아지는 쪽(남)", () => {
    const city = at(100, 100);
    expect(waveEdgeOnPlanet(city, at(200, 104), 1, 1)).toBe(1);
    expect(waveEdgeOnPlanet(city, at(10, 96), 1, 1)).toBe(3);
    expect(waveEdgeOnPlanet(city, at(103, 220), 1, 1)).toBe(0);
    expect(waveEdgeOnPlanet(city, at(97, 3), 1, 1)).toBe(2);
  });

  it("모함이 그 도시 칸이거나 도시 칸을 모르면 시드로 고른 변", () => {
    expect(waveEdgeOnPlanet(at(5, 5), at(5, 5), 77, 3)).toBe(waveAttackEdge(77, 3));
    expect(waveEdgeOnPlanet(undefined, at(5, 5), 77, 4)).toBe(waveAttackEdge(77, 4));
  });

  it("다른 면의 모함도 변 하나를 고르고, 같은 입력이면 같은 변", () => {
    const city = at(500, 250);
    const other = at(20, 250, 1);
    const edge = waveEdgeOnPlanet(city, other, 1, 1);
    expect([0, 1, 2, 3]).toContain(edge);
    expect(waveEdgeOnPlanet(city, other, 9, 9)).toBe(edge);
  });
});
