// 시설 건설 재료 검사 시험 — 레벨 구간(첫 from 1·늘어나기만·최고 레벨 이하)·같은 아이템 한 줄·꺼진 재료 알림(49 M14·D-508,
// docs/adr/2026-11-02-building-editor.md). 문제마다 코드(code)를 단다: 건물 편집기가 메시지 키로 보인다.
import { describe, expect, it } from "vitest";
import { ITEM_FIELDS, fixture } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const name = { ko: "이름", en: "Name" };
const items = {
  entries: [
    { id: "pine_log", name, ...ITEM_FIELDS },
    { id: "stone", name, ...ITEM_FIELDS },
    { id: "plank", name, ...ITEM_FIELDS, category: "processed", enabled: false },
  ],
};
const stack = (item: string, qty: number) => ({ item, qty });

function facility(build: unknown, extra: Record<string, unknown> = {}) {
  return { id: "farm", name, stage: "gather", slotsPerLevel: 10, build, ...extra };
}

function check(build: unknown, extra: Record<string, unknown> = {}) {
  return validatePack(
    fixture({ "items.json": items, "facilities.json": { entries: [facility(build, extra)] } }),
  ).issues;
}

const schemaCodes = (build: unknown, extra: Record<string, unknown> = {}) =>
  check(build, extra).filter((issue) => issue.stage === "schema").length;

const codes = (issues: ReturnType<typeof check>) =>
  issues.map((issue) => [issue.level, issue.code, issue.path]);

describe("시설 건설 재료(레벨 구간)", () => {
  it("Lv1 원자재·Lv2부터 가공품 구간은 통과한다: 위 구간의 꺼진 재료(아이템 편집기로 끈 판자)는 알리지 않는다", () => {
    const issues = check({
      mulPm: 800,
      levels: [
        { from: 1, materials: [stack("pine_log", 8), stack("stone", 2)] },
        { from: 2, materials: [stack("plank", 8)] },
      ],
    });
    expect(issues).toEqual([]);
  });

  it("처음 짓기(Lv1) 재료가 꺼져 있으면 알림(D-508: 처음 건물이 막히면 안 됨). 시설에는 켬·끔 칸이 없다(옛 enabled는 스키마 오류)", () => {
    const first = { mulPm: 800, levels: [{ from: 1, materials: [stack("stone", 1), stack("plank", 1)] }] };
    const issues = check(first);
    expect(codes(issues)).toEqual([
      ["warning", "build_material_disabled", "build.levels[0].materials[1].item"],
    ]);
    expect(issues[0]?.params).toEqual({ item: "plank" });
    // 시설은 늘 켜짐(팩 core@32, 사용자 답 2026-11-03): enabled 칸은 받지 않는다
    expect(schemaCodes(first, { enabled: false })).toBe(1);
  });

  it("첫 구간은 레벨 1, from은 늘어나기만, 최고 레벨 이하", () => {
    expect(codes(check({ mulPm: 800, levels: [{ from: 2, materials: [stack("stone", 1)] }] }))).toEqual([
      ["error", "build_levels_start", "build.levels[0].from"],
    ]);
    expect(
      codes(
        check({
          mulPm: 800,
          levels: [
            { from: 1, materials: [stack("stone", 1)] },
            { from: 3, materials: [stack("stone", 2)] },
            { from: 3, materials: [stack("stone", 3)] },
          ],
        }),
      ),
    ).toEqual([["error", "build_levels_order", "build.levels[2].from"]]);
    expect(
      codes(
        check(
          {
            mulPm: 800,
            levels: [
              { from: 1, materials: [stack("stone", 1)] },
              { from: 4, materials: [stack("stone", 2)] },
            ],
          },
          { maxLevel: 3 },
        ),
      ),
    ).toEqual([["error", "build_level_max", "build.levels[1].from"]]);
  });

  it("한 구간에 같은 아이템 두 줄은 오류", () => {
    expect(
      codes(check({ mulPm: 800, levels: [{ from: 1, materials: [stack("stone", 1), stack("stone", 2)] }] })),
    ).toEqual([["error", "build_material_duplicate", "build.levels[0].materials[1].item"]]);
  });

  it("스키마: 옛 모양(materials만)·레벨 6·빈 재료·최고 레벨 6은 받지 않는다", () => {
    expect(schemaCodes({ mulPm: 800, materials: [stack("stone", 1)] })).toBeGreaterThan(0);
    expect(
      schemaCodes({ mulPm: 800, levels: [{ from: 6, materials: [stack("stone", 1)] }] }),
    ).toBeGreaterThan(0);
    expect(schemaCodes({ mulPm: 800, levels: [{ from: 1, materials: [] }] })).toBeGreaterThan(0);
    expect(
      schemaCodes({ mulPm: 800, levels: [{ from: 1, materials: [stack("stone", 1)] }] }, { maxLevel: 6 }),
    ).toBeGreaterThan(0);
  });
});

describe("시설 2차맵 겉모습(look, docs/adr/2026-11-08-building-art.md 바뀜 2026-11-09)", () => {
  const build = { mulPm: 800, levels: [{ from: 1, materials: [stack("stone", 1)] }] };
  it("모델·벽·지붕 색·높이 배율(500~2000‰)은 받고, 모두 선택이다", () => {
    expect(
      schemaCodes(build, { look: { model: "temple", wall: "brick", roof: "teal", heightPm: 1500 } }),
    ).toBe(0);
    expect(schemaCodes(build, { look: {} })).toBe(0);
    expect(schemaCodes(build)).toBe(0);
  });
  it("모르는 모델·색 이름, 범위 밖 높이, 모르는 칸은 스키마 오류", () => {
    expect(schemaCodes(build, { look: { model: "castle" } })).toBe(1);
    expect(schemaCodes(build, { look: { wall: "neon" } })).toBe(1);
    expect(schemaCodes(build, { look: { heightPm: 2001 } })).toBe(1);
    expect(schemaCodes(build, { look: { heightPm: 499 } })).toBe(1);
    expect(schemaCodes(build, { look: { icon: "farm.png" } })).toBe(1);
  });
});

describe("시설 분류(기획 D-560)", () => {
  it("분류 칸은 아홉 이름표 가운데 하나만 받고, 없어도 된다", () => {
    const build = { mulPm: 800, levels: [{ from: 1, materials: [stack("stone", 1)] }] };
    expect(schemaCodes(build, { category: "gathering" })).toBe(0);
    expect(schemaCodes(build)).toBe(0);
    expect(schemaCodes(build, { category: "gather" })).toBeGreaterThan(0);
  });
});
