// 설정 칸 차이를 팩에 넣는 스크립트 시험 — 임시 팩 폴더에 적용해 value만 바뀌고 판이 오르는지 본다
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
});
