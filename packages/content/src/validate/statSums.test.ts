// 크리쳐 검사 시험 — 초기 스탯 합 상한(D-534), 변종 그룹(variantOf: 자기 자신·없는 대표·변종을 대표로 삼기), 스탯 오차·모델 칸 형식.
// docs/adr/2026-11-25-creature-codex-groups.md
import { describe, expect, it } from "vitest";
import { validatePack } from "./pack.ts";

const creature = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: { ko: id, en: id },
  category: "beast",
  grade: "common",
  size: "M",
  primaries: { str: 7, dex: 6, agi: 8, vit: 5, int: 3, wis: 3 },
  elements: [0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0],
  skillSlots: { base: 2, perRebirth: 1, max: 5 },
  enabled: true,
  ...extra,
});

function packWith(entries: readonly Record<string, unknown>[]) {
  return validatePack({
    packId: "test",
    files: new Map([
      ["manifest.json", JSON.stringify({ formatVersion: 1, packId: "test", version: 1 })],
      ["id-changes.json", JSON.stringify({ renamed: [], removed: [] })],
      ["creatures.json", JSON.stringify({ entries })],
    ]),
  });
}

const codes = (result: ReturnType<typeof packWith>) => result.issues.map((issue) => issue.code);

describe("크리쳐 변종 그룹(variantOf)", () => {
  it("대표를 가리키는 변종, 스탯 오차, 모델 칸은 통과한다", () => {
    const result = packWith([
      creature("wolf", { model: "wolf.glb" }),
      creature("fire_wolf", {
        variantOf: "wolf",
        primarySpread: { str: 3, dex: 1, agi: 0, vit: 1, int: 1, wis: 1 },
      }),
    ]);
    expect(result.issues).toEqual([]);
    expect(result.pack).toBeDefined();
  });

  it("자기 자신을 대표로 가리키면 오류다", () => {
    expect(codes(packWith([creature("wolf", { variantOf: "wolf" })]))).toContain("creature_variant_self");
  });

  it("없는 대표를 가리키면 참조 오류다", () => {
    const result = packWith([creature("fire_wolf", { variantOf: "wolf" })]);
    expect(result.pack).toBeUndefined();
    expect(result.issues.some((issue) => issue.id === "fire_wolf" && issue.path === "variantOf")).toBe(true);
  });

  it("변종을 다시 대표로 삼으면(두 단계) 오류다", () => {
    const result = packWith([
      creature("wolf"),
      creature("fire_wolf", { variantOf: "wolf" }),
      creature("lava_wolf", { variantOf: "fire_wolf" }),
    ]);
    expect(result.issues.filter((issue) => issue.code === "creature_variant_chain")).toMatchObject([
      { id: "lava_wolf", path: "variantOf" },
    ]);
  });

  it("스탯 오차는 0~10 정수 여섯 칸이어야 한다", () => {
    const tooBig = packWith([
      creature("wolf", { primarySpread: { str: 11, dex: 1, agi: 1, vit: 1, int: 1, wis: 1 } }),
    ]);
    expect(tooBig.pack).toBeUndefined();
    const missing = packWith([creature("wolf", { primarySpread: { str: 1 } })]);
    expect(missing.pack).toBeUndefined();
  });
});

describe("크리쳐 초기 스탯 합(D-534)", () => {
  it("합이 100을 넘으면 오류다", () => {
    const result = packWith([
      creature("titan", { primaries: { str: 30, dex: 20, agi: 20, vit: 20, int: 6, wis: 5 } }),
    ]);
    expect(codes(result)).toContain("creature_stat_sum");
  });
});
