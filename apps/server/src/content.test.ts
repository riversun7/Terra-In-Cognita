// 서버 시작 때 콘텐츠 팩 검사 — 저장소의 실제 팩(content/core), 틀린 팩, 설정, /health의 버전·해시
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { DEFAULT_CONTENT_DIR, readConfig } from "./config.ts";
import { loadServerContent } from "./content.ts";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("loadServerContent", () => {
  it("저장소의 실제 팩(content/core)이 검사를 통과한다", () => {
    const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
    if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
    expect(loaded.content.version).toMatch(/^core@[1-9]\d*$/);
    expect(loaded.content.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(loaded.warnings).toEqual([]);
  });

  it("틀린 팩이면 오류 줄과 시작하지 않는다는 줄을 돌려준다", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "terra-pack-"));
    try {
      writeFileSync(
        path.join(dir, "manifest.json"),
        JSON.stringify({ formatVersion: 1, packId: "other_pack", version: 1 }),
      );
      writeFileSync(path.join(dir, "id-changes.json"), JSON.stringify({ renamed: [], removed: [] }));
      const loaded = loadServerContent(dir);
      if (loaded.ok) throw new Error("틀린 팩이 통과했다");
      expect(loaded.lines[0]).toContain(
        `✗ [스키마] ${dir}/manifest.json › packId: 팩 ID가 폴더 이름과 다릅니다`,
      );
      expect(loaded.lines.at(-1)).toContain("서버를 시작하지 않습니다");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("팩 폴더가 없으면 시작하지 않는다", () => {
    const loaded = loadServerContent(path.join(tmpdir(), "terra-no-such-pack"));
    if (loaded.ok) throw new Error("없는 폴더가 통과했다");
    expect(loaded.lines[0]).toContain("팩 폴더를 읽지 못했습니다(ENOENT)");
  });
});

describe("readConfig", () => {
  it("CONTENT_DIR이 있으면 쓰고, 없으면 저장소의 content/core", () => {
    expect(readConfig({ CONTENT_DIR: "/app/content/core" }).contentDir).toBe("/app/content/core");
    expect(readConfig({}).contentDir).toBe(DEFAULT_CONTENT_DIR);
    expect(DEFAULT_CONTENT_DIR.split(path.sep).slice(-2)).toEqual(["content", "core"]);
  });
});

describe("GET /health 콘텐츠 값", () => {
  it("팩 버전과 해시를 돌려준다", async () => {
    app = await buildApp({
      contentVersion: "core@7",
      contentHash: "a".repeat(64),
      logger: false,
      metricsIntervalMs: 0,
    });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.json()).toMatchObject({ contentVersion: "core@7", contentHash: "a".repeat(64) });
  });
});
