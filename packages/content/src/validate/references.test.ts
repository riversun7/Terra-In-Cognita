// 2단계(참조 무결성) 시험 — 중복 ID, 없는 참조(오타 제안), 모르는 파일, 고아 항목
import { describe, expect, it } from "vitest";
import { formatIssue } from "../issue.ts";
import { fixture, named, testRegistry } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";
import { editDistance, suggestId } from "./references.ts";

const kit = (id: string, items: string[], tag?: string) => ({
  ...named(id),
  parts: items.map((item) => ({ item, count: 1 })),
  ...(tag ? { tag } : {}),
});

/** 시험용 분류 목록(items·kits·tags)으로 검사한다. tags는 꼭 참조되어야 하는 분류 */
const check = (overrides: Record<string, unknown>) =>
  validatePack(fixture({ "tags.json": { entries: [named("shiny")] }, ...overrides }), testRegistry).issues;

describe("2단계: 참조 무결성", () => {
  it("참조가 모두 맞으면 통과한다", () => {
    expect(
      check({ "kits.json": { entries: [kit("starter_kit", ["iron_ore", "copper_ore"], "shiny")] } }),
    ).toEqual([]);
  });

  it("중복 ID는 실패한다", () => {
    const issues = check({
      "items.json": { entries: [named("iron_ore"), named("copper_ore"), named("iron_ore")] },
      "kits.json": { entries: [kit("starter_kit", [], "shiny")] },
    });
    expect(issues).toEqual([
      expect.objectContaining({
        stage: "references",
        file: "items.json",
        id: "iron_ore",
        message: expect.stringContaining("entries[0]와 entries[2]"),
      }),
    ]);
  });

  it("없는 ID를 참조하면 실패하고, 비슷한 ID가 있으면 제안한다", () => {
    const issues = check({
      "kits.json": { entries: [kit("starter_kit", ["iron_oer", "gold_bar"], "shiny")] },
    });
    expect(issues.map((issue) => formatIssue(issue))).toEqual([
      '✗ [참조] kits.json › starter_kit › parts[0].item: 없는 items ID "iron_oer"입니다. 혹시 "iron_ore"?',
      '✗ [참조] kits.json › starter_kit › parts[1].item: 없는 items ID "gold_bar"입니다. items.json에 있는 ID인지 확인하세요.',
    ]);
  });

  it("팩 폴더의 모르는 파일·폴더는 고아로 실패한다", () => {
    const issues = check({
      "kits.json": { entries: [kit("starter_kit", [], "shiny")] },
      "item.json": { entries: [] },
      "notes/": "",
    });
    expect(issues.map((issue) => issue.file)).toEqual(["item.json", "notes/"]);
    expect(issues[0]?.message).toMatch(/^모르는 파일입니다/);
  });

  it("꼭 참조되어야 하는 분류의 항목을 아무도 참조하지 않으면 고아로 실패한다", () => {
    const issues = check({ "kits.json": { entries: [kit("starter_kit", [])] } });
    expect(issues).toEqual([
      expect.objectContaining({
        file: "tags.json",
        id: "shiny",
        message: expect.stringContaining("참조하지 않는"),
      }),
    ]);
  });

  it("기본 분류(items)는 참조되지 않아도 된다", () => {
    expect(validatePack(fixture()).issues).toEqual([]);
  });
});

describe("오타 제안", () => {
  it("편집 거리", () => {
    expect(editDistance("iron_ore", "iron_ore")).toBe(0);
    expect(editDistance("iron_oer", "iron_ore")).toBe(2);
    expect(editDistance("iron", "iron_ore")).toBe(4);
    expect(editDistance("", "ab")).toBe(2);
  });

  it("거리 2 이하에서 가장 가까운 것, 같으면 사전 순", () => {
    expect(suggestId("iron_oer", ["copper_ore", "iron_ore"])).toBe("iron_ore");
    expect(suggestId("ab", ["ac", "aa"])).toBe("aa");
    expect(suggestId("gold_bar", ["iron_ore"])).toBeUndefined();
  });
});
