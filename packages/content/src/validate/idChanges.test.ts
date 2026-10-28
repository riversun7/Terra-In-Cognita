// 4a단계(ID 변경표) 시험 — 이름 바꾸기 사슬, 순환, 없는 대상, 옛 ID 다시 쓰기
import { describe, expect, it } from "vitest";
import { fixture } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const rename = (from: string, to: string, since = 2) => ({ category: "items", from, to, since });
const remove = (id: string, replaceWith?: string, since = 2) => ({
  category: "items",
  id,
  since,
  compensation: replaceWith ? { kind: "replace", with: replaceWith } : { kind: "none" },
});

/** 팩 버전 2(기본 항목 iron_ore, copper_ore)에 변경표를 넣어 검사한다 */
const check = (renamed: unknown[], removed: unknown[] = []) =>
  validatePack(
    fixture({
      "manifest.json": { formatVersion: 1, packId: "core", version: 2 },
      "id-changes.json": { renamed, removed },
    }),
  ).issues;

describe("4a단계: ID 변경표", () => {
  it("이름 바꾸기 사슬이 지금 있는 ID에 닿으면 통과한다", () => {
    expect(check([rename("iron_rock", "iron_lump", 1), rename("iron_lump", "iron_ore")])).toEqual([]);
  });

  it("지운 ID: 보상 없음, 다른 ID로 바꿔 줌, 바꿔 줄 ID가 나중에 이름이 바뀐 경우 모두 통과한다", () => {
    expect(
      check(
        [rename("copper_lump", "copper_ore")],
        [remove("junk"), remove("old_ore", "copper_lump"), remove("scrap", "junk")],
      ),
    ).toEqual([]);
  });

  it("이름을 바꾼 뒤 지운 ID로 끝나는 사슬도 통과한다", () => {
    expect(check([rename("tin_rock", "tin_ore")], [remove("tin_ore")])).toEqual([]);
  });

  it("순환하면 한 번만 알린다", () => {
    const issues = check([rename("ore_a", "ore_b"), rename("ore_b", "ore_c"), rename("ore_c", "ore_a")]);
    expect(issues).toEqual([
      expect.objectContaining({
        stage: "idChanges",
        file: "id-changes.json",
        path: "renamed[0]",
        message: expect.stringContaining("ore_a → ore_b → ore_c → ore_a"),
      }),
    ]);
  });

  it("가리키는 ID가 팩에도 변경표에도 없으면 실패한다", () => {
    expect(check([rename("iron_rock", "iron_bar")], [remove("junk", "gold_bar")])).toEqual([
      expect.objectContaining({ path: "renamed[0].to", message: expect.stringContaining('"iron_bar"') }),
      expect.objectContaining({
        path: "removed[0].compensation.with",
        message: expect.stringContaining('"gold_bar"'),
      }),
    ]);
  });

  it("바꾸거나 지운 옛 ID가 팩에 다시 나오면 실패한다", () => {
    expect(check([rename("iron_ore", "copper_ore")], [remove("copper_ore")])).toEqual([
      expect.objectContaining({
        path: "renamed[0]",
        message: expect.stringContaining('"iron_ore"가 팩에 아직 있습니다'),
      }),
      expect.objectContaining({
        path: "removed[0]",
        message: expect.stringContaining('"copper_ore"가 팩에 아직 있습니다'),
      }),
    ]);
  });

  it("같은 ID를 두 번 기록하면 실패한다", () => {
    expect(check([rename("iron_rock", "iron_ore")], [remove("iron_rock")])).toEqual([
      expect.objectContaining({ path: "removed[0]", message: expect.stringContaining("이미 renamed[0]에") }),
    ]);
  });

  it("자기 자신으로 바꾸면 실패한다", () => {
    expect(check([rename("iron_ore", "iron_ore")])).toEqual([
      expect.objectContaining({ path: "renamed[0]" }),
    ]);
  });

  it("since가 지금 팩 버전보다 크면 실패한다", () => {
    expect(check([rename("iron_rock", "iron_ore", 3)])).toEqual([
      expect.objectContaining({ path: "renamed[0].since" }),
    ]);
  });

  it("모르는 분류는 실패한다", () => {
    expect(check([{ category: "weapons", from: "old_sword", to: "new_sword", since: 1 }])).toEqual([
      expect.objectContaining({ path: "renamed[0].category", message: expect.stringContaining("items") }),
    ]);
  });
});
