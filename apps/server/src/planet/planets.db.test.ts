// 행성 경로 로그인 DB 통합 시험 — TEST_DATABASE_URL이 있을 때만. 아이디·비밀번호는 모두 시험용 가짜 값이다.
// 실제 세션 쿠키로 목록 정보·타일을 받는다(시험용 testViewer 없이).
import { gunzipSync } from "node:zlib";
import { planetTileIds } from "@terra/planet";
import { decodePlanetTile, planetManifestPath, planetManifestSchema, planetTilePath } from "@terra/protocol";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import {
  TEST_DATABASE_URL,
  TEST_SETTINGS,
  type TestDatabase,
  createTestDatabase,
  enter,
  sessionCookie,
} from "../testDb.ts";
import { createInlineBaker } from "./baker.ts";
import { smallSource } from "./testSupport.ts";

const PASSWORD = "fake pass phrase 2";

describe.skipIf(!TEST_DATABASE_URL)("행성 경로 로그인 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let cookie = "";

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildApp({
      contentVersion: "test",
      logger: false,
      metricsIntervalMs: 0,
      db: test.db,
      auth: { settings: TEST_SETTINGS, openSignup: true },
      planets: { sources: [smallSource()], baker: createInlineBaker() },
    });
    await app.ready();
    cookie = sessionCookie(
      await enter(app, { id: "Fake_S2Player", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("세션 쿠키가 있으면 목록 정보·타일 200, 없으면 401", async () => {
    let manifest = planetManifestSchema.parse(
      (
        await app.inject({ method: "GET", url: planetManifestPath("test_planet"), headers: { cookie } })
      ).json(),
    );
    for (let tries = 0; tries < 200 && manifest.status !== "ready"; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const res = await app.inject({
        method: "GET",
        url: planetManifestPath("test_planet"),
        headers: { cookie },
      });
      manifest = planetManifestSchema.parse(res.json());
    }
    expect(manifest.status).toBe("ready");
    expect((await app.inject({ method: "GET", url: planetManifestPath("test_planet") })).statusCode).toBe(
      401,
    );

    const id = planetTileIds(5)[3];
    if (!id) throw new Error("tile id");
    const url = planetTilePath(manifest.tileUrlTemplate, id.key);
    const res = await app.inject({ method: "GET", url, headers: { cookie, "accept-encoding": "gzip" } });
    expect(res.statusCode).toBe(200);
    expect(decodePlanetTile(gunzipSync(res.rawPayload))).toMatchObject({
      face: id.face,
      mapLevel: id.mapLevel,
    });
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
  });
});
