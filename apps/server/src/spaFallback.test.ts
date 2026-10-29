// 화면 경로 판정 시험 — 화면 주소 표의 모든 경로 예가 index.html을 받는다(ADR 2026-10-29-app-shell 1·13절)
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { routePathExamples } from "@terra/shared";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.ts";
import { NON_PAGE_PREFIXES, isPagePath } from "./spaFallback.ts";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("isPagePath", () => {
  it("주소 표의 모든 경로 예는 화면 경로다(검색어 값의 점·쌍점은 보지 않는다)", () => {
    const examples = routePathExamples();
    expect(examples.length).toBeGreaterThan(10);
    expect(examples.some((example) => example.includes("?") && example.includes("."))).toBe(true);
    for (const example of examples) {
      expect(isPagePath("GET", example), example).toBe(true);
      // 끝의 / 하나(라우터가 같은 화면으로 본다)
      const [pathname = "", query] = example.split("?");
      if (pathname !== "/") {
        const slashed = `${pathname}/${query === undefined ? "" : `?${query}`}`;
        expect(isPagePath("GET", slashed), slashed).toBe(true);
      }
    }
  });

  it("API·WebSocket·상태 경로는 글자 앞부분만 보고 뺀다", () => {
    expect(NON_PAGE_PREFIXES).toEqual(["/api", "/ws", "/health"]);
    for (const url of [
      "/api",
      "/api/trpc/system.info",
      "/api?x=1",
      "/apiary",
      "/ws",
      "/wsx",
      "/health",
      "/healthz",
      "/health/live",
    ]) {
      expect(isPagePath("GET", url), url).toBe(false);
    }
    // 뒤 조각의 api는 상관없다
    expect(isPagePath("GET", "/settings/api")).toBe(true);
  });

  it("마지막 조각에 점이 있으면 파일로 본다. GET만 화면이다", () => {
    for (const url of ["/sw.js", "/index.html", "/assets/missing-abc.js", "/units.json", "/a/b.c?x=1"]) {
      expect(isPagePath("GET", url), url).toBe(false);
    }
    expect(isPagePath("GET", "/a.b/c")).toBe(true);
    expect(isPagePath("POST", "/units")).toBe(false);
    expect(isPagePath("HEAD", "/units")).toBe(false);
  });
});

describe("정적 파일 서버", () => {
  it("주소 표의 모든 경로 예에 index.html을 준다", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "terra-spa-"));
    try {
      writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>t</title>");
      app = await buildApp({ contentVersion: "test", logger: false, metricsIntervalMs: 0, staticDir: dir });
      for (const example of routePathExamples()) {
        const res = await app.inject({ method: "GET", url: example });
        expect(res.statusCode, example).toBe(200);
        expect(res.headers["content-type"], example).toContain("text/html");
      }
      // 상태 경로 앞머리는 화면이 아니다(/health 자체는 상태 응답)
      expect((await app.inject({ method: "GET", url: "/healthz" })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/health" })).headers["content-type"]).toContain(
        "application/json",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
