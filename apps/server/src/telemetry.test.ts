// 텔레메트리 수신 시험 (DB 없이). DB에 실제로 쓰는지는 db/db.test.ts에서 본다.
import { TELEMETRY_MAX_BODY_BYTES, TELEMETRY_PATHS } from "@terra/protocol";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.ts";
import { samplePerf } from "./testFixtures.ts";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function makeApp(): Promise<FastifyInstance> {
  app = await buildApp({ contentVersion: "test", logger: false, metricsIntervalMs: 0, now: () => 0 });
  await app.ready();
  return app;
}

const post = (server: FastifyInstance, url: string, payload: object) =>
  server.inject({ method: "POST", url, payload, headers: { "user-agent": "vitest" } });

describe("텔레메트리 수신", () => {
  it("형식에 맞는 오류·성능 보고는 204", async () => {
    const server = await makeApp();
    const error = await post(server, TELEMETRY_PATHS.errors, {
      clientBuild: "test",
      kind: "error",
      message: "boom",
    });
    expect(error.statusCode).toBe(204);
    expect((await post(server, TELEMETRY_PATHS.perf, samplePerf)).statusCode).toBe(204);
  });

  it("형식이 틀리면 400", async () => {
    const server = await makeApp();
    const res = await post(server, TELEMETRY_PATHS.errors, {
      clientBuild: "test",
      kind: "crash",
      message: "x",
    });
    expect(res.statusCode).toBe(400);
  });

  it("본문이 상한을 넘으면 413", async () => {
    const server = await makeApp();
    const message = "x".repeat(TELEMETRY_MAX_BODY_BYTES);
    const res = await post(server, TELEMETRY_PATHS.errors, { clientBuild: "test", kind: "error", message });
    expect(res.statusCode).toBe(413);
  });

  it("같은 주소에서 너무 많이 보내면 429 (오류는 분당 30건)", async () => {
    const server = await makeApp();
    const report = { clientBuild: "test", kind: "error", message: "boom" };
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await post(server, TELEMETRY_PATHS.errors, report)).statusCode);
    expect(codes.filter((code) => code === 204)).toHaveLength(30);
    expect(codes.at(-1)).toBe(429);
  });
});
