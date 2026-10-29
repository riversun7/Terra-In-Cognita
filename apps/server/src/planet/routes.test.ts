// 앱에 붙인 행성 경로 시험(DB 없음, 로그인 사용자는 testViewer로) — 목록 정보·타일, 로그인·굽는 중·버전·속도 제한
import { gunzipSync } from "node:zlib";
import { planetTileIds } from "@terra/planet";
import {
  PLANET_TILE_CACHE_CONTROL,
  decodePlanetTile,
  planetManifestPath,
  planetManifestSchema,
  planetTilePath,
  planetTileUrlTemplate,
  planetTileVersion,
} from "@terra/protocol";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import type { Viewer } from "../trpc/context.ts";
import { createInlineBaker } from "./baker.ts";
import { PLANET_MANIFEST_CACHE_CONTROL, type PlanetRouteLimits } from "./routes.ts";
import { type ControlledSource, controlledSource, smallSource } from "./testSupport.ts";

const PLAYER: Viewer = {
  id: "00000000-0000-4000-8000-000000000002",
  loginId: "Fake_Player",
  roles: ["player"],
};

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function makeApp(
  options: { viewer?: Viewer | null; source?: ControlledSource; limits?: Partial<PlanetRouteLimits> } = {},
) {
  const source = options.source ?? controlledSource(smallSource());
  app = await buildApp({
    contentVersion: "test",
    logger: false,
    metricsIntervalMs: 0,
    planets: { sources: [source], baker: createInlineBaker(), limits: options.limits },
    testViewer: () => Promise.resolve(options.viewer === undefined ? PLAYER : options.viewer),
  });
  await app.ready();
  return { server: app, source };
}

/** 목록 정보를 받아 status가 ready가 될 때까지 */
async function readyManifest(server: FastifyInstance) {
  for (let tries = 0; tries < 200; tries++) {
    const res = await server.inject({ method: "GET", url: planetManifestPath("test_planet") });
    const manifest = planetManifestSchema.parse(res.json());
    if (manifest.status === "ready") return manifest;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("planet did not become ready");
}

describe("행성 목록 정보 경로", () => {
  it("로그인하지 않으면 401 (no-store)", async () => {
    const { server } = await makeApp({ viewer: null });
    const res = await server.inject({ method: "GET", url: planetManifestPath("test_planet") });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "SIGN_IN_REQUIRED" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("굽는 중에는 generating, 끝나면 ready. 매번 확인(no-cache)하고 ETag가 같으면 304", async () => {
    const source = controlledSource(smallSource());
    source.hold = true;
    const { server } = await makeApp({ source });
    const first = await server.inject({ method: "GET", url: planetManifestPath("test_planet") });
    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe(PLANET_MANIFEST_CACHE_CONTROL);
    expect(planetManifestSchema.parse(first.json()).status).toBe("generating");
    source.release();
    const manifest = await readyManifest(server);
    expect(manifest).toMatchObject({ id: "test_planet", faceLevel: 5, status: "ready" });
    const again = await server.inject({ method: "GET", url: planetManifestPath("test_planet") });
    const etag = again.headers.etag;
    expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    expect(etag).not.toBe(first.headers.etag);
    const cached = await server.inject({
      method: "GET",
      url: planetManifestPath("test_planet"),
      headers: { "if-none-match": String(etag) },
    });
    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe("");
  });

  it("없는 행성은 404 PLANET_NOT_FOUND", async () => {
    const { server } = await makeApp();
    const res = await server.inject({ method: "GET", url: planetManifestPath("other_planet") });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "PLANET_NOT_FOUND" });
  });
});

describe("행성 타일 경로", () => {
  it("로그인하지 않으면 401, 굽는 중이면 409 PLANET_NOT_READY + Retry-After", async () => {
    const source = controlledSource(smallSource());
    source.hold = true;
    const template = planetTileUrlTemplate(
      source.id,
      planetTileVersion(source.generatorVersion, source.definitionHash),
    );
    const url = planetTilePath(template, planetTileIds(5)[0]?.key ?? 0);
    const signedOut = await makeApp({ viewer: null, source });
    const anonymous = await signedOut.server.inject({ method: "GET", url });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: "SIGN_IN_REQUIRED" });
    await signedOut.server.close();

    const { server } = await makeApp({ source });
    const waiting = await server.inject({ method: "GET", url });
    expect(waiting.statusCode).toBe(409);
    expect(waiting.json()).toEqual({ error: "PLANET_NOT_READY" });
    expect(waiting.headers["retry-after"]).toBe("5");
    expect(waiting.headers["cache-control"]).toBe("no-store");
    source.release();
  });

  it("완료되면 압축한 타일을 그대로(gzip) 1년 immutable로, gzip을 받지 않는 기기에는 풀어서", async () => {
    const { server } = await makeApp();
    const manifest = await readyManifest(server);
    const ids = planetTileIds(5);
    for (const id of [ids[0], ids[25], ids.at(-1)]) {
      if (!id) throw new Error("tile id");
      const url = planetTilePath(manifest.tileUrlTemplate, id.key);
      const zipped = await server.inject({ method: "GET", url, headers: { "accept-encoding": "gzip, br" } });
      expect(zipped.statusCode).toBe(200);
      expect(zipped.headers["content-encoding"]).toBe("gzip");
      expect(zipped.headers["content-type"]).toBe("application/octet-stream");
      expect(zipped.headers["cache-control"]).toBe(PLANET_TILE_CACHE_CONTROL);
      expect(zipped.headers.vary).toBe("accept-encoding");
      const tile = decodePlanetTile(gunzipSync(zipped.rawPayload));
      expect(tile).toMatchObject({
        faceLevel: 5,
        mapLevel: id.mapLevel,
        face: id.face,
        i0: id.i0,
        j0: id.j0,
        size: id.size,
        generatorVersion: manifest.generatorVersion,
        definitionHash: manifest.definitionHash,
      });
      const plain = await server.inject({ method: "GET", url, headers: { "accept-encoding": "identity" } });
      expect(plain.headers["content-encoding"]).toBeUndefined();
      expect(plain.rawPayload.equals(gunzipSync(zipped.rawPayload))).toBe(true);
    }
  });

  it("버전이 다르거나 없는 타일·없는 행성·숫자가 아닌 키는 404 (코드로 구분)", async () => {
    const { server } = await makeApp();
    const manifest = await readyManifest(server);
    const key = planetTileIds(5)[0]?.key ?? 0;
    const get = async (url: string) => (await server.inject({ method: "GET", url })).json();
    expect(await get(planetTilePath(manifest.tileUrlTemplate.replace(/v=.*/, "v=9.9.9"), key))).toEqual({
      error: "TILE_VERSION_NOT_FOUND",
    });
    expect(await get(planetTilePath(manifest.tileUrlTemplate.replace(/\?v=.*/, ""), key))).toEqual({
      error: "TILE_VERSION_NOT_FOUND",
    });
    expect(await get(planetTilePath(manifest.tileUrlTemplate, 12_345))).toEqual({ error: "TILE_NOT_FOUND" });
    expect(await get(manifest.tileUrlTemplate.replace("{tileKey}", "1e5"))).toEqual({
      error: "TILE_NOT_FOUND",
    });
    expect(await get(manifest.tileUrlTemplate.replace("{tileKey}", "99999999999999999"))).toEqual({
      error: "TILE_NOT_FOUND",
    });
    // 앞에 0을 붙인 표기는 같은 타일이어도 받지 않는다(타일마다 주소 하나)
    expect(
      (await server.inject({ method: "GET", url: planetTilePath(manifest.tileUrlTemplate, key) })).statusCode,
    ).toBe(200);
    for (const padded of [`0${key}`, `00${key}`, "00"]) {
      expect(await get(manifest.tileUrlTemplate.replace("{tileKey}", padded)), padded).toEqual({
        error: "TILE_NOT_FOUND",
      });
    }
    expect(
      await get(planetTilePath(manifest.tileUrlTemplate.replace("test_planet", "other_planet"), key)),
    ).toEqual({
      error: "PLANET_NOT_FOUND",
    });
  });

  it("사용자별 속도 제한을 넘으면 429 RATE_LIMITED + Retry-After", async () => {
    const { server } = await makeApp({ limits: { tilesPerUser: { capacity: 2, refillPerMinute: 1 } } });
    const manifest = await readyManifest(server);
    const url = planetTilePath(manifest.tileUrlTemplate, planetTileIds(5)[0]?.key ?? 0);
    expect((await server.inject({ method: "GET", url })).statusCode).toBe(200);
    expect((await server.inject({ method: "GET", url })).statusCode).toBe(200);
    const limited = await server.inject({ method: "GET", url });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toEqual({ error: "RATE_LIMITED" });
    expect(Number(limited.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  it("로그인 확인 전 접속 주소별 제한도 있다", async () => {
    const { server } = await makeApp({
      viewer: null,
      limits: { perIp: { capacity: 1, refillPerMinute: 1 } },
    });
    expect((await server.inject({ method: "GET", url: planetManifestPath("test_planet") })).statusCode).toBe(
      401,
    );
    expect((await server.inject({ method: "GET", url: planetManifestPath("test_planet") })).statusCode).toBe(
      429,
    );
  });
});
