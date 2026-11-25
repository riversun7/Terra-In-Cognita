// 크리쳐 검사 시험 — 초기 스탯 합 상한(D-534), 변종 그룹(variantOf: 자기 자신·없는 대표·변종을 대표로 삼기), 스탯 오차·모델 칸 형식,
// 분류 트리(creature_classes: 대·중·소 셋까지, 고리·자기 자신·없는 분류).
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
  elements: [0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0],
  skillSlots: { base: 2, perRebirth: 1, max: 5 },
  enabled: true,
  ...extra,
});

const BEAST = { id: "beast", name: { ko: "야수", en: "Beast" }, icon: "🐺" };

function packWith(
  entries: readonly Record<string, unknown>[],
  classes: readonly Record<string, unknown>[] = [BEAST],
) {
  return validatePack({
    packId: "test",
    files: new Map([
      ["manifest.json", JSON.stringify({ formatVersion: 1, packId: "test", version: 1 })],
      ["id-changes.json", JSON.stringify({ renamed: [], removed: [] })],
      ["creature_classes.json", JSON.stringify({ entries: classes })],
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

const cls = (id: string, parent?: string) => ({
  id,
  name: { ko: id, en: id },
  ...(parent ? { parent } : {}),
});

describe("크리쳐 분류 트리(creature_classes)", () => {
  it("대 › 중 › 소 세 단계와, 어느 단계든 가리키는 크리쳐는 통과한다", () => {
    const result = packWith(
      [creature("wolf"), creature("arctic_fox", { category: "arctic_foxes" })],
      [BEAST, cls("foxes", "beast"), cls("arctic_foxes", "foxes")],
    );
    expect(result.issues).toEqual([]);
  });

  it("넷째 단계는 오류다", () => {
    const result = packWith(
      [creature("wolf")],
      [BEAST, cls("foxes", "beast"), cls("arctic_foxes", "foxes"), cls("snow_foxes", "arctic_foxes")],
    );
    expect(result.issues.filter((issue) => issue.code === "creature_class_depth")).toMatchObject([
      { id: "snow_foxes", path: "parent" },
    ]);
  });

  it("고리와 자기 자신을 가리키는 위 분류는 오류다", () => {
    const loop = packWith([creature("wolf")], [BEAST, cls("a_kind", "b_kind"), cls("b_kind", "a_kind")]);
    expect(codes(loop).filter((code) => code === "creature_class_cycle")).toHaveLength(2);
    expect(codes(packWith([creature("wolf")], [BEAST, cls("foxes", "foxes")]))).toContain(
      "creature_class_self",
    );
  });

  it("없는 분류를 가리키는 크리쳐는 참조 오류다", () => {
    const result = packWith([creature("wolf", { category: "nope" })]);
    expect(result.pack).toBeUndefined();
    expect(result.issues.some((issue) => issue.id === "wolf" && issue.path === "category")).toBe(true);
  });
});
