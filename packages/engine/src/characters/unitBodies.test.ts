import { describe, expect, it } from "vitest";
import { compileCharacter, writeGroupMatrices } from "./characterCompile.ts";
import { GROUP } from "./characterParts.ts";
import { TRIANGLE_BUDGET } from "./characterModel.ts";
import { UNIT_BODY_KINDS, isRigidBody, unitBodyKey, unitBodyModel } from "./unitBodies.ts";

describe("사람꼴이 아닌 유닛 몸", () => {
  it("종류마다 삼각형 상한(가까운 단계 600, 먼 단계 150) 안이고 같은 씨앗이면 같은 모델이다", () => {
    for (const kind of UNIT_BODY_KINDS) {
      for (let seed = 1; seed <= 40; seed++) {
        const near = unitBodyModel({ kind, seed }, 0);
        const far = unitBodyModel({ kind, seed }, 1);
        expect(near.triangles, `${kind} lod0`).toBeLessThanOrEqual(TRIANGLE_BUDGET.lod0);
        expect(far.triangles, `${kind} lod1`).toBeLessThanOrEqual(TRIANGLE_BUDGET.lod1);
        expect(far.triangles).toBeLessThan(near.triangles);
        expect(unitBodyModel({ kind, seed }, 0)).toEqual(near);
      }
    }
  });

  it("탈것은 크기 등급 차례로 커지고 짐승만 걷는 자세가 있다", () => {
    const car = unitBodyModel({ kind: "car", seed: 1 });
    const truck = unitBodyModel({ kind: "truck", seed: 1 });
    const crawler = unitBodyModel({ kind: "crawler", seed: 1 });
    expect(car.heightM).toBeGreaterThan(1.2);
    expect(car.heightM).toBeLessThan(1.8);
    expect(truck.heightM).toBeGreaterThan(car.heightM);
    expect(crawler.heightM).toBeGreaterThan(truck.heightM);
    expect(isRigidBody("beast")).toBe(false);
    for (const kind of ["car", "truck", "crawler"] as const) expect(isRigidBody(kind)).toBe(true);
  });

  it("짐승 다리 넷은 팔·다리 묶음이라 걸으면 앞다리와 뒷다리가 엇갈려 흔들린다", () => {
    const beast = unitBodyModel({ kind: "beast", seed: 9 });
    const groups = new Set(beast.parts.map((part) => part.group));
    for (const group of [GROUP.body, GROUP.head, GROUP.armL, GROUP.armR, GROUP.legL, GROUP.legR])
      expect(groups.has(group)).toBe(true);
    const compiled = compileCharacter(beast);
    const out = new Float32Array(6 * 16);
    writeGroupMatrices(out, compiled.pivots, { swing: 0.5, bob: 0 });
    // 왼앞다리(armL)와 왼뒷다리(legL)는 반대쪽으로 돈다(x축 돌림의 sin 칸 부호가 다르다)
    expect(Math.sign(out[GROUP.armL * 16 + 6] ?? 0)).toBe(-Math.sign(out[GROUP.legL * 16 + 6] ?? 0));
  });

  it("캐시 열쇠는 종류 + 칠이라 씨앗이 많아도 가짓수가 적다", () => {
    const keys = new Set<string>();
    for (let seed = 1; seed <= 500; seed++) keys.add(unitBodyKey({ kind: "car", seed }));
    expect(keys.size).toBeLessThanOrEqual(6);
    expect(keys.size).toBeGreaterThan(1);
    expect(unitBodyKey({ kind: "car", seed: 1 })).not.toBe(unitBodyKey({ kind: "truck", seed: 1 }));
  });
});
