// 설정 칸 차이를 팩에 넣는 스크립트 시험 — 임시 팩 폴더에 적용해 value만 바뀌고 판이 오르는지 본다
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashEntry } from "@terra/content/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyDiffToPack } from "./apply-tuning-diff.mjs";

const SCRIPT = fileURLToPath(new URL("./apply-tuning-diff.mjs", import.meta.url));
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
let dir;
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });

const entry = (id, value, extra = {}) => ({
  id,
  code: "N9",
  name: { ko: `이름 ${id}`, en: `Name ${id}` },
  value,
  structural: false,
  ...extra,
});

const diff = (changes, packId = "core") => ({
  format: "terra-tuning-diff",
  formatVersion: 1,
  exportedAt: "2026-11-01T04:00:00.000Z",
  packId,
  contentVersion: `${packId}@3`,
  contentHash: "abc",
  changes,
});

const skill = (id, cost) => ({
  id,
  name: { ko: id, en: id },
  shape: "single",
  trigger: "active",
  resource: "stamina",
  cost,
  castMs: 0,
  cooldownMs: 1000,
  target: "enemy",
  range: 1,
  radius: 0,
  damage: "physical",
  base: "physical",
  formula: [],
  conditions: [],
  effects: [],
  gradePm: [1000],
  enabled: true,
});

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "tuning-apply-"));
  writeFileSync(path.join(dir, "manifest.json"), json({ formatVersion: 1, packId: "core", version: 3 }));
  writeFileSync(
    path.join(dir, "tuning.json"),
    json({
      entries: [entry("n9_initial_sum", 60, { unit: "points", min: 6, max: 600 }), entry("n9_other", 1)],
    }),
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("pnpm tuning:apply", () => {
  it("value만 바꾸고 manifest 판을 하나 올린다(다른 칸·키 차례 그대로)", () => {
    const outcome = applyDiffToPack(dir, diff([{ id: "n9_initial_sum", code: "N9", from: 60, to: 66 }]));
    expect(outcome).toEqual({
      applied: [{ id: "n9_initial_sum", from: 60, to: 66 }],
      skipped: [],
      rows: { applied: [], skipped: [] },
      entries: { applied: [], skipped: [] },
      formulas: { applied: [], skipped: [] },
      version: 4,
    });
    const tuning = readFileSync(path.join(dir, "tuning.json"), "utf8");
    expect(tuning).toBe(
      json({
        entries: [entry("n9_initial_sum", 66, { unit: "points", min: 6, max: 600 }), entry("n9_other", 1)],
      }),
    );
    expect(JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8")).version).toBe(4);
  });

  it("바꿀 칸이 없으면 파일을 쓰지 않고, 다른 팩의 차이는 던진다", () => {
    const before = readFileSync(path.join(dir, "tuning.json"), "utf8");
    const outcome = applyDiffToPack(dir, diff([{ id: "n9_initial_sum", code: "N9", from: 59, to: 66 }]));
    expect(outcome.applied).toEqual([]);
    expect(outcome.skipped).toEqual([{ id: "n9_initial_sum", reason: "stale", current: 60 }]);
    expect(outcome.version).toBe(3);
    expect(readFileSync(path.join(dir, "tuning.json"), "utf8")).toBe(before);
    expect(() => applyDiffToPack(dir, diff([], "other"))).toThrow(/다릅니다/);
  });

  it("명령: 건너뛴 칸이 있으면 종료 코드 1, 사용법이 틀리면 2", () => {
    const file = path.join(dir, "diff.json");
    writeFileSync(
      file,
      json(
        diff([
          { id: "n9_initial_sum", code: "N9", from: 60, to: 70 },
          { id: "n9_initial_gone", code: "N9", from: 1, to: 2 },
        ]),
      ),
    );
    const result = run(file, "--pack", dir);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("n9_initial_sum: 60 → 70");
    expect(result.stderr).toContain("n9_initial_gone");
    expect(run().status).toBe(2);
    expect(run(file, "--pack", dir, "--bogus").status).toBe(2);
  });

  it("가중치 표 칸(statRows)도 stat_rows.json에 넣고 판은 한 번만 올린다(밸런스 화면)", () => {
    const hp = {
      id: "hp",
      name: { ko: "HP", en: "HP" },
      shape: "quantity",
      base: 0,
      weights: [1500, 1000, 1500, 3000, 1000, 1200],
      enabled: true,
    };
    writeFileSync(path.join(dir, "stat_rows.json"), json({ entries: [hp] }));
    const tuningBefore = readFileSync(path.join(dir, "tuning.json"), "utf8");
    const outcome = applyDiffToPack(dir, {
      ...diff([]),
      statRows: [
        { row: "hp", field: "vit", from: 3000, to: 3300 },
        { row: "hp", field: "cap", from: 0, to: 1 },
      ],
    });
    expect(outcome.rows.applied).toEqual([{ row: "hp", field: "vit", from: 3000, to: 3300 }]);
    expect(outcome.rows.skipped).toEqual([{ row: "hp", field: "cap", reason: "unknown" }]);
    expect(outcome.version).toBe(4);
    expect(readFileSync(path.join(dir, "stat_rows.json"), "utf8")).toBe(
      json({ entries: [{ ...hp, weights: [1500, 1000, 1500, 3300, 1000, 1200] }] }),
    );
    // 설정 칸 차이가 없으면 tuning.json은 그대로
    expect(readFileSync(path.join(dir, "tuning.json"), "utf8")).toBe(tuningBefore);
  });

  it("팩 항목(entries, 스킬 편집기)은 해시가 맞으면 통째로 바꾸고, 새 항목은 끝에 붙이고, 판은 한 번만 올린다", () => {
    writeFileSync(path.join(dir, "skills.json"), json({ entries: [skill("slash", 10), skill("bash", 5)] }));
    const outcome = applyDiffToPack(dir, {
      ...diff([]),
      entries: [
        { category: "skills", id: "slash", from: hashEntry(skill("slash", 10)), entry: skill("slash", 12) },
        { category: "skills", id: "bash", from: "0".repeat(64), entry: skill("bash", 1) },
        { category: "skills", id: "kick", from: null, entry: { ...skill("kick", 3), bareHand: true } },
        { category: "skills", id: "broken", from: null, entry: { ...skill("broken", 3), shape: "nope" } },
      ],
    });
    expect(outcome.entries.applied).toEqual([
      { category: "skills", id: "slash", kind: "replaced" },
      { category: "skills", id: "kick", kind: "added" },
    ]);
    expect(outcome.entries.skipped).toEqual([
      { category: "skills", id: "bash", reason: "stale" },
      { category: "skills", id: "broken", reason: "invalid" },
    ]);
    expect(outcome.version).toBe(4);
    expect(
      JSON.parse(readFileSync(path.join(dir, "skills.json"), "utf8")).entries.map((e) => [e.id, e.cost]),
    ).toEqual([
      ["slash", 12],
      ["bash", 5],
      ["kick", 3],
    ]);
  });

  it("계산식(formulas)은 formulas.json expression·stat_rows.json formula에 넣고 판은 한 번만 올린다(계산식 탭)", () => {
    const hp = {
      id: "hp",
      name: { ko: "HP", en: "HP" },
      shape: "quantity",
      base: 0,
      weights: [1500, 1000, 1500, 3000, 1000, 1200],
      enabled: true,
    };
    const hit = { id: "real_hit", name: { ko: "명중", en: "Hit" }, expression: "W" };
    writeFileSync(path.join(dir, "stat_rows.json"), json({ entries: [hp] }));
    writeFileSync(path.join(dir, "formulas.json"), json({ entries: [hit] }));
    const generated = "STR * 1.5 + DEX + AGI * 1.5 + VIT * 3 + INT + WIS * 1.2 + GEAR + BUFF";
    const outcome = applyDiffToPack(dir, {
      ...diff([]),
      statRows: [{ row: "hp", field: "vit", from: 3000, to: 3300 }],
      formulas: [
        { id: "hp.formula", from: generated, to: "VIT * 10 + STR" },
        { id: "real_hit", from: "W", to: "W * 2" },
        { id: "real_crit", from: "W", to: "W + NOPE" },
        { id: "real_attack", from: "옛 식", to: "W" },
      ],
    });
    expect(outcome.formulas.applied.map((change) => change.id)).toEqual(["hp.formula", "real_hit"]);
    expect(outcome.formulas.skipped).toEqual([
      { id: "real_crit", reason: "unknown" },
      { id: "real_attack", reason: "unknown" },
    ]);
    expect(outcome.version).toBe(4);
    expect(JSON.parse(readFileSync(path.join(dir, "stat_rows.json"), "utf8")).entries[0]).toEqual({
      ...hp,
      weights: [1500, 1000, 1500, 3300, 1000, 1200],
      formula: "VIT * 10 + STR",
    });
    expect(JSON.parse(readFileSync(path.join(dir, "formulas.json"), "utf8")).entries[0].expression).toBe(
      "W * 2",
    );
  });
});
