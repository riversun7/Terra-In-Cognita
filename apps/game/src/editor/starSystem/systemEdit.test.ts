// 항성계 편집 함수 시험 — AU 글 읽기·쓰기, 궤도 더하기·거리 바꾸기(다시 늘어놓기)·천체·빼기. 결과는 늘 정의 검사를 통과한다
import {
  STAR_SYSTEM_MAX_ORBITS,
  emptyStarSystem,
  habitableZone,
  parseStarSystemDefinition,
} from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  formatAu,
  parseAu,
  sameDefinition,
  withOrbitAdded,
  withOrbitBody,
  withOrbitDistance,
  withOrbitRemoved,
  withStarType,
} from "./systemEdit.ts";

const PLANET_ID = "0b6f1c9e-3a52-4d8e-9f10-2c3d4e5f6a7b";

describe("AU 글", () => {
  it("점 소수(쉼표도) → 1/1000 AU, 범위 밖·수 아님은 null", () => {
    expect(parseAu("1")).toBe(1000);
    expect(parseAu(" 0.387 ")).toBe(387);
    expect(parseAu("5,2")).toBe(5200);
    expect(parseAu("0.0004")).toBeNull();
    expect(parseAu("2000")).toBeNull();
    expect(parseAu("-1")).toBeNull();
    expect(parseAu("1e3")).toBeNull();
    expect(parseAu("")).toBeNull();
  });

  it("1/1000 AU → 짧은 글", () => {
    expect(formatAu(1000)).toBe("1");
    expect(formatAu(387)).toBe("0.387");
    expect(formatAu(5200)).toBe("5.2");
    expect(formatAu(10)).toBe("0.01");
  });
});

describe("궤도 고치기", () => {
  it("첫 궤도는 생명 가능 지대 가운데, 다음은 바깥으로", () => {
    const one = withOrbitAdded(emptyStarSystem());
    const zone = habitableZone(1);
    expect(one?.orbits[0]?.distanceMilliAu).toBe(Math.round(((zone.inner + zone.outer) / 2) * 1000));
    const two = one && withOrbitAdded(one);
    expect(two?.orbits.map((orbit) => orbit.body.kind)).toEqual(["empty", "empty"]);
    expect(two && parseStarSystemDefinition(two)).toEqual(two);
  });

  it("상한이면 더하지 않는다", () => {
    let definition = emptyStarSystem("m5v");
    for (let count = 0; count < STAR_SYSTEM_MAX_ORBITS; count += 1) {
      const next = withOrbitAdded(definition);
      if (!next) break;
      definition = next;
    }
    expect(withOrbitAdded(definition)).toBeNull();
    expect(parseStarSystemDefinition(definition)).not.toBeNull();
  });

  it("거리를 바꾸면 다시 늘어놓고 새 차례를 준다. 겹침·범위 밖은 null", () => {
    const base = withOrbitAdded(withOrbitAdded(emptyStarSystem()) ?? emptyStarSystem());
    if (!base) throw new Error("no base");
    const planet = withOrbitBody(base, 1, { kind: "planet", planetId: PLANET_ID });
    const moved = withOrbitDistance(planet, 1, 300);
    expect(moved?.index).toBe(0);
    expect(moved?.definition.orbits[0]).toEqual({
      distanceMilliAu: 300,
      body: { kind: "planet", planetId: PLANET_ID },
    });
    expect(moved && parseStarSystemDefinition(moved.definition)).toEqual(moved?.definition);
    const first = planet.orbits[0]?.distanceMilliAu ?? 0;
    expect(withOrbitDistance(planet, 1, first)).toBeNull();
    expect(withOrbitDistance(planet, 1, 5)).toBeNull();
    expect(withOrbitDistance(planet, 9, 3000)).toBeNull();
  });

  it("빼기·항성 종류·같은 정의", () => {
    const base = withOrbitAdded(emptyStarSystem());
    if (!base) throw new Error("no base");
    expect(withOrbitRemoved(base, 0).orbits).toEqual([]);
    expect(withStarType(base, "k5v").star.type).toBe("k5v");
    expect(sameDefinition(base, JSON.parse(JSON.stringify(base)))).toBe(true);
    expect(sameDefinition(base, withStarType(base, "k5v"))).toBe(false);
  });
});
