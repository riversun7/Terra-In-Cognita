// 4b단계(이전 버전 호환) 시험 — 기준 팩과 지금 팩을 비교한다
import { describe, expect, it } from "vitest";
import { formatIssue } from "../issue.ts";
import { BASE_ITEMS, ITEM_FIELDS, fixture, named } from "../testFixtures.ts";
import { type LiveUsage, comparePacks } from "./compat.ts";

const manifest = (version: number) => ({ "manifest.json": { formatVersion: 1, packId: "core", version } });
const compare = (base: Record<string, unknown>, head: Record<string, unknown>, liveUsage?: LiveUsage) =>
  comparePacks("core", fixture(base).files, fixture(head).files, {
    baseLabel: "abc1234",
    ...(liveUsage ? { liveUsage } : {}),
  });

/** 운영 데이터가 아무 ID도 쓰지 않는다 */
const unused: LiveUsage = async (_category, ids) => new Map(ids.map((id) => [id, 0]));
const removedIron = { category: "items", id: "iron_ore", since: 2, compensation: { kind: "none" } };
const onlyCopper = { "items.json": { entries: [named("copper_ore")] } };

describe("4b단계: 이전 버전 호환", () => {
  it("바뀐 것이 없으면 통과한다", async () => {
    expect(await compare({}, {})).toEqual([]);
  });

  it("기록 없이 ID가 사라지면 실패한다", async () => {
    const issues = await compare({}, { ...manifest(2), ...onlyCopper });
    expect(issues.map((issue) => formatIssue(issue))).toEqual([
      "✗ [호환] items.json › iron_ore: 기준 커밋(abc1234, core@1)에는 있는데 지금은 없습니다. 이름을 바꿨으면 id-changes.json renamed에, 지웠으면 removed에 적으세요.",
    ]);
  });

  it("지운 기록과 버전 올림이 있으면 통과한다", async () => {
    const head = {
      ...manifest(2),
      ...onlyCopper,
      "id-changes.json": { renamed: [], removed: [removedIron] },
    };
    expect(await compare({}, head)).toEqual([]);
  });

  it("운영 데이터가 쓰지 않는 ID는 기록 없이 지워도 된다 (LiveUsage)", async () => {
    expect(await compare({}, { ...manifest(2), ...onlyCopper }, unused)).toEqual([]);
  });

  it("기준에 있던 기록을 고치거나 지우면 실패한다", async () => {
    const base = {
      ...manifest(2),
      ...onlyCopper,
      "id-changes.json": { renamed: [], removed: [removedIron] },
    };
    const edited = { ...removedIron, compensation: { kind: "replace", with: "copper_ore" } };
    const editedIssues = await compare(base, {
      ...base,
      ...manifest(3),
      "id-changes.json": { renamed: [], removed: [edited] },
    });
    expect(editedIssues).toEqual([
      expect.objectContaining({
        file: "id-changes.json",
        path: "removed[0]",
        message: expect.stringContaining("추가만"),
      }),
    ]);
    const droppedIssues = await compare(base, {
      ...base,
      ...manifest(3),
      "id-changes.json": { renamed: [], removed: [] },
    });
    // 기록을 지워도 실패한다 (iron_ore는 기준에도 없어서 "사라진 ID"는 아니다)
    expect(droppedIssues).toEqual([expect.objectContaining({ path: "removed[0]" })]);
  });

  it("내용이 바뀌었는데 버전을 올리지 않으면 실패한다", async () => {
    const head = {
      "items.json": {
        entries: [...BASE_ITEMS, named("tin_ore")],
      },
    };
    expect(await compare({}, head)).toEqual([
      expect.objectContaining({
        file: "manifest.json",
        path: "version",
        message: expect.stringContaining("version을 2로"),
      }),
    ]);
    expect(await compare({}, { ...head, ...manifest(2) })).toEqual([]);
  });

  it("버전이 내려가면 실패한다", async () => {
    expect(await compare(manifest(3), manifest(2))).toEqual([
      expect.objectContaining({ path: "version", message: expect.stringContaining("3 → 2") }),
    ]);
  });

  it("줄 바꿈·키 순서·항목 순서만 바뀌면 내용 변경이 아니다", async () => {
    const reordered = {
      "items.json": JSON.stringify({
        entries: [
          { name: { en: "Copper ore", ko: "구리광석" }, id: "copper_ore", ...ITEM_FIELDS },
          { ...ITEM_FIELDS, id: "iron_ore", name: { ko: "철광석", en: "Iron ore" } },
        ],
      }),
    };
    expect(await compare({}, reordered)).toEqual([]);
  });

  it("새 기록의 since는 이번 변경의 버전이어야 한다", async () => {
    const head = (since: number) => ({
      ...manifest(3),
      ...onlyCopper,
      "id-changes.json": { renamed: [], removed: [{ ...removedIron, since }] },
    });
    expect(await compare(manifest(2), head(3))).toEqual([]);
    expect(await compare(manifest(2), head(2))).toEqual([
      expect.objectContaining({ path: "removed[0].since", message: expect.stringContaining("3~3") }),
    ]);
  });

  it("기준 팩이 지금 스키마로는 틀려도(옛 필드) 느슨하게 읽어 비교한다", async () => {
    const oldShape = {
      ...manifest(1),
      "items.json": {
        entries: [
          { id: "iron_ore", weight: 3 },
          { id: "copper_ore", label: "구리" },
        ],
      },
    };
    expect(await compare(oldShape, { ...manifest(2), ...onlyCopper })).toEqual([
      expect.objectContaining({ file: "items.json", id: "iron_ore" }),
    ]);
  });

  it("기준 팩의 JSON이 깨져 있으면 경고만 하고 건너뛴다", async () => {
    const issues = await compare({ "items.json": "{" }, {});
    expect(issues).toEqual([expect.objectContaining({ stage: "compat", level: "warning" })]);
  });

  it("분류 파일이 통째로 사라져도 그 ID들을 찾는다", async () => {
    const issues = await compare({}, { ...manifest(2), "items.json": null });
    expect(issues.map((issue) => issue.id)).toEqual(["iron_ore", "copper_ore"]);
  });
});
