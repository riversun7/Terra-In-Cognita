// 콘텐츠 검사 스크립트 시험 — 임시 git 저장소에서 실제로 실행해 기준 커밋 비교(4b)·출력 형식을 확인한다
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./check-content.mjs", import.meta.url));
// git 훅(푸시 전 검사) 안에서 돌면 GIT_DIR·GIT_INDEX_FILE 등이 이 저장소를 가리킨다 → 임시 저장소 명령이 진짜 저장소를 건드리지 않게 뺀다
const ENV = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")));
let repo;

function git(...args) {
  const result = spawnSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd: repo, encoding: "utf8", env: ENV },
  );
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function writePack({ version = 1, ids = ["iron_ore", "copper_ore"], removed = [] } = {}) {
  const dir = path.join(repo, "content", "core");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "manifest.json"), json({ formatVersion: 1, packId: "core", version }));
  writeFileSync(
    path.join(dir, "items.json"),
    json({
      entries: ids.map((id) => ({
        id,
        name: { ko: `이름 ${id}`, en: `Name ${id}` },
        category: "raw",
        tier: 0,
        startPrice: 1,
        enabled: true,
      })),
    }),
  );
  writeFileSync(path.join(dir, "id-changes.json"), json({ renamed: [], removed }));
}

function commit(message) {
  git("add", "-A");
  git("commit", "-q", "--allow-empty", "-m", message);
}

function run(args = [], env = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...ENV, GITHUB_ACTIONS: "", ...env },
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), "terra-check-content-"));
  git("init", "-q", "-b", "main");
  git("config", "core.hooksPath", "/dev/null");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("check-content.mjs", () => {
  it("기준 커밋이 없으면(첫 커밋) 4b를 건너뛴다", () => {
    writePack();
    commit("첫 커밋");
    const result = run();
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("기준 커밋이 없어 호환 검사(4b)를 건너뜁니다");
  });

  it("기준 커밋에 팩이 없으면(새 팩) 4b를 건너뛴다", () => {
    writeFileSync(path.join(repo, "README.txt"), "x");
    commit("첫 커밋");
    writePack();
    commit("팩 추가");
    const result = run();
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("새 팩이라 호환 검사(4b)를 건너뜁니다");
    expect(result.stdout).toMatch(
      /✓ 콘텐츠 검증 통과 — core@1 \([0-9a-f]{12}\), 단계 1·2·4a·4b\(기준 [0-9a-f]{7}\)/,
    );
  });

  it("기준 커밋에 있던 ID를 기록 없이 지우면 실패한다 (기준 커밋은 인자로도 받는다)", () => {
    writePack();
    commit("v1");
    const base = git("rev-parse", "HEAD");
    writePack({ version: 2, ids: ["copper_ore"] });
    const failed = run([base]);
    expect(failed.code).toBe(1);
    expect(failed.stderr).toContain(
      `✗ [호환] content/core/items.json › iron_ore: 기준 커밋(${base.slice(0, 7)}, core@1)에는 있는데 지금은 없습니다.`,
    );
    writePack({
      version: 2,
      ids: ["copper_ore"],
      removed: [{ category: "items", id: "iron_ore", since: 2, compensation: { kind: "none" } }],
    });
    expect(run([base]).code).toBe(0);
  });

  it("--no-compat이면 4b를 하지 않는다", () => {
    writePack();
    commit("v1");
    writePack({ version: 2, ids: ["copper_ore"] });
    const result = run(["--no-compat"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("단계 1·2·4a\n");
  });

  it("스키마 오류가 있으면 실패하고 4b는 돌리지 않는다. Actions에서는 파일·줄 표시를 붙인다", () => {
    writePack();
    commit("v1");
    writeFileSync(
      path.join(repo, "content", "core", "items.json"),
      '{\n  "entries": [\n    { "id": "copper_ore", "name": { "ko": "구리" } }\n  ]\n}\n',
    );
    // iron_ore도 사라졌지만(4b 오류감) 스키마 오류가 있어 4b는 돌지 않는다
    const result = run(["HEAD"], { GITHUB_ACTIONS: "true" });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain(
      "✗ [스키마] content/core/items.json › copper_ore › name.en: 영어(en)가 없습니다.",
    );
    expect(result.stderr).toContain(
      "::error file=content/core/items.json,line=3,title=콘텐츠 검증 [스키마]::",
    );
    expect(result.stderr).not.toContain("[호환]");
  });

  it("기준 커밋에 있던 팩 폴더가 사라지면 실패한다", () => {
    writePack();
    mkdirSync(path.join(repo, "content", "extra"));
    writeFileSync(path.join(repo, "content", "extra", "manifest.json"), "{}");
    commit("v1");
    rmSync(path.join(repo, "content", "extra"), { recursive: true });
    const result = run(["HEAD"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("✗ [호환] content/extra: 기준 커밋");
  });

  it("--print는 서버 팩의 버전·해시만 표준 출력에 찍는다", () => {
    writePack({ version: 3 });
    commit("v3");
    const result = run(["--print"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toMatch(/^content_version=core@3\ncontent_hash=[0-9a-f]{64}\n$/);
    expect(result.stderr).toContain("✓ 콘텐츠 검증 통과");
  });

  it("모르는 옵션은 거절한다", () => {
    writePack();
    expect(run(["--nope"]).code).toBe(2);
  });
});
