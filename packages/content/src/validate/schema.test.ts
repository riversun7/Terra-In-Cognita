// 1단계(스키마) 시험 — 실패 경우마다 한 건씩
import { describe, expect, it } from "vitest";
import { formatIssue } from "../issue.ts";
import { ITEM_FIELDS, fixture } from "../testFixtures.ts";
import { validatePack } from "./pack.ts";

const issuesOf = (overrides: Record<string, unknown>, packId?: string) =>
  validatePack(fixture(overrides, packId)).issues;

const items = (...entries: Record<string, unknown>[]) => ({
  "items.json": { entries: entries.map((entry) => ({ ...ITEM_FIELDS, ...entry })) },
});

describe("1단계: 스키마", () => {
  it("올바른 팩은 통과하고 파싱 결과를 돌려준다", () => {
    const result = validatePack(fixture());
    expect(result.issues).toEqual([]);
    expect(result.pack?.manifest.version).toBe(1);
    expect(result.pack?.entries.get("items")?.map((entry) => entry.id)).toEqual(["iron_ore", "copper_ore"]);
  });

  it("JSON 문법 오류는 줄·칸과 함께 알린다 (V8이 위치를 주는 경우)", () => {
    // 끝의 쉼표
    const [issue, ...rest] = issuesOf({ "items.json": '{\n  "entries": [],\n}' });
    expect(rest).toEqual([]);
    expect(issue).toMatchObject({ stage: "schema", file: "items.json", line: 3, column: 1 });
    expect(issue?.message).toBe(
      "JSON 문법 오류입니다(Expected double-quoted property name). 쉼표·따옴표·괄호를 확인하세요.",
    );
  });

  it("JSON 문법 오류의 원문 조각은 문구에서 뺀다 (V8이 위치를 주지 않는 경우)", () => {
    const [issue] = issuesOf({ "items.json": '{"entries": [}' });
    expect(issue).toMatchObject({ file: "items.json" });
    expect(issue?.line).toBeUndefined();
    expect(issue?.message).toBe("JSON 문법 오류입니다(Unexpected token '}'). 쉼표·따옴표·괄호를 확인하세요.");
  });

  it("영어 이름이 없으면 실패한다 (ID와 항목 안 경로로 위치를 알린다)", () => {
    const issues = issuesOf(items({ id: "iron_ore", name: { ko: "철광석" } }));
    expect(issues).toEqual([
      {
        stage: "schema",
        level: "error",
        file: "items.json",
        id: "iron_ore",
        path: "name.en",
        message: "영어(en)가 없습니다. ko·en을 함께 적으세요.",
      },
    ]);
    expect(formatIssue(issues[0] ?? { stage: "schema", level: "error", message: "" }, "content/core/")).toBe(
      "✗ [스키마] content/core/items.json › iron_ore › name.en: 영어(en)가 없습니다. ko·en을 함께 적으세요.",
    );
  });

  it("한국어가 비어 있거나 공백뿐이면 실패한다", () => {
    const issues = issuesOf(
      items(
        { id: "iron_ore", name: { ko: "", en: "Iron ore" } },
        { id: "copper_ore", name: { ko: "  ", en: "x" } },
      ),
    );
    expect(issues.map((issue) => [issue.id, issue.path, issue.message])).toEqual([
      ["iron_ore", "name.ko", "한국어(ko)가 비어 있습니다. ko·en을 함께 적으세요."],
      ["copper_ore", "name.ko", "한국어(ko)가 비어 있습니다. ko·en을 함께 적으세요."],
    ]);
  });

  it("설명(description)은 없어도 되지만, 있으면 ko·en이 모두 있어야 한다", () => {
    expect(
      issuesOf(items({ id: "iron_ore", name: { ko: "철", en: "Iron" }, description: { ko: "설명" } })),
    ).toEqual([expect.objectContaining({ id: "iron_ore", path: "description.en" })]);
  });

  it("모르는 필드(오타)는 실패한다", () => {
    const issues = issuesOf(items({ id: "iron_ore", name: { ko: "철", en: "Iron" }, colour: "red" }));
    expect(issues).toEqual([
      expect.objectContaining({
        id: "iron_ore",
        path: "",
        message: expect.stringContaining("모르는 필드입니다: colour"),
      }),
    ]);
  });

  it("ID 형식이 틀리면 실패한다 (위치는 항목 번호)", () => {
    for (const id of ["Iron", "1st", "a", "iron-ore", "x".repeat(49)]) {
      const issues = issuesOf(items({ id, name: { ko: "철", en: "Iron" } }));
      expect(issues).toEqual([
        expect.objectContaining({
          path: "entries[0].id",
          message: expect.stringMatching(/^ID 형식이 아닙니다/),
        }),
      ]);
    }
  });

  it("형식 버전이 코드와 다르면 실패한다", () => {
    const issues = issuesOf({ "manifest.json": { formatVersion: 2, packId: "core", version: 1 } });
    expect(issues).toEqual([
      expect.objectContaining({
        file: "manifest.json",
        path: "formatVersion",
        message: expect.stringContaining("팩 2, 코드 1"),
      }),
    ]);
  });

  it("팩 ID가 폴더 이름과 다르면 실패한다", () => {
    const issues = issuesOf({ "manifest.json": { formatVersion: 1, packId: "other", version: 1 } });
    expect(issues).toEqual([expect.objectContaining({ path: "packId" })]);
  });

  it("버전은 1 이상의 정수다", () => {
    for (const version of [0, 1.5, "1"]) {
      const issues = issuesOf({ "manifest.json": { formatVersion: 1, packId: "core", version } });
      expect(issues).toEqual([expect.objectContaining({ file: "manifest.json", path: "version" })]);
    }
  });

  it("manifest.json과 id-changes.json은 꼭 있어야 한다", () => {
    expect(issuesOf({ "manifest.json": null })).toEqual([
      expect.objectContaining({ file: "manifest.json", message: expect.stringMatching(/^파일이 없습니다/) }),
    ]);
    expect(issuesOf({ "id-changes.json": null })).toEqual([
      expect.objectContaining({
        file: "id-changes.json",
        message: expect.stringMatching(/^파일이 없습니다/),
      }),
    ]);
  });

  it("분류 파일이 없으면 빈 분류로 본다", () => {
    const result = validatePack(fixture({ "items.json": null }));
    expect(result.issues).toEqual([]);
    expect(result.pack?.entries.get("items")).toEqual([]);
  });

  it("변경표의 보상 방식이 틀리면 실패한다", () => {
    const issues = issuesOf({
      "id-changes.json": {
        renamed: [],
        removed: [{ category: "items", id: "old_ore", since: 1, compensation: { kind: "refund" } }],
      },
    });
    expect(issues).toEqual([
      expect.objectContaining({
        file: "id-changes.json",
        path: "removed[0].compensation.kind",
        message: expect.stringContaining("보상 방식은"),
      }),
    ]);
  });

  it("스키마 오류가 있으면 2·4단계는 돌리지 않는다", () => {
    // 중복 ID(2단계 오류)도 있지만 스키마 오류만 나온다
    const issues = issuesOf(
      items({ id: "iron_ore", name: { ko: "철" } }, { id: "iron_ore", name: { ko: "철", en: "x" } }),
    );
    expect(issues.every((issue) => issue.stage === "schema")).toBe(true);
  });
});
