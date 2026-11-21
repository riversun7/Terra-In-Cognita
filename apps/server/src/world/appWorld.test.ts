// 앱에 붙인 2차맵 시험(DB 없음, 로그인 사용자는 testViewer로) — WebSocket 버전 확인, 구독·명령, 지형 파일 경로
import { gunzipSync } from "node:zlib";
import {
  PROTOCOL_VERSION,
  S1_TEST_MAP_KEY,
  type ServerMessage,
  TERRAIN_CACHE_CONTROL,
  decodeServerMessage,
  decodeTerrain,
  encodeMessage,
  terrainPath,
} from "@terra/protocol";
import { generateTempTerrain, placementCostsFromTerrain, seedFromCellKey, terrainHash } from "@terra/sim";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import type { Viewer } from "../trpc/context.ts";

const ADMIN: Viewer = {
  id: "00000000-0000-4000-8000-000000000001",
  loginId: "Fake_Admin",
  roles: ["player", "admin"],
};

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function makeApp(options: { viewer?: Viewer | null; world?: boolean; bots?: number } = {}) {
  app = await buildApp({
    contentVersion: "test",
    logger: false,
    metricsIntervalMs: 0,
    ...(options.world === false ? {} : { world: { testBots: options.bots ?? 0, paths: { kind: "inline" } } }),
    testViewer: () => Promise.resolve(options.viewer ?? null),
  });
  await app.ready();
  return app;
}

/** 서버 메시지를 모으고, 조건에 맞는 메시지가 올 때까지 기다린다 */
function collector(ws: { on: (event: "message", cb: (data: Buffer) => void) => void }) {
  const messages: ServerMessage[] = [];
  const waiters: { test: (m: ServerMessage[]) => boolean; resolve: () => void }[] = [];
  ws.on("message", (data) => {
    messages.push(decodeServerMessage(data.toString()));
    for (const waiter of waiters.splice(0)) {
      if (waiter.test(messages)) waiter.resolve();
      else waiters.push(waiter);
    }
  });
  return {
    messages,
    until(test: (m: ServerMessage[]) => boolean): Promise<void> {
      if (test(messages)) return Promise.resolve();
      return new Promise((resolve) => waiters.push({ test, resolve }));
    },
  };
}

/** 스냅샷 마지막 조각까지 받았는가 */
function snapshotDone(messages: ServerMessage[]): boolean {
  return messages.some((x) => x.t === "map_snapshot" && x.part === x.parts - 1);
}

async function greet(server: FastifyInstance, protocolVersion = PROTOCOL_VERSION) {
  const ws = await server.injectWS("/ws");
  const inbox = collector(ws);
  ws.send(encodeMessage({ t: "hello", protocolVersion, clientBuild: "test" }));
  await inbox.until((m) => m.some((x) => x.t === "welcome"));
  return { ws, inbox };
}

describe("WebSocket 2차맵 메시지", () => {
  it("프로토콜 2로 인사하면 protocol_unsupported로 거절한다(시야 전송 3판부터, 걸러지지 않은 흐름을 남기지 않는다)", async () => {
    const server = await makeApp({ viewer: ADMIN });
    const ws = await server.injectWS("/ws");
    const inbox = collector(ws);
    ws.send(encodeMessage({ t: "hello", protocolVersion: 2, clientBuild: "test" }));
    await inbox.until((m) => m.some((x) => x.t === "reject"));
    expect(inbox.messages.at(-1)).toMatchObject({ t: "reject", code: "protocol_unsupported" });
    expect(inbox.messages.some((x) => x.t === "welcome")).toBe(false);
    ws.terminate();
  });

  it("로그인하지 않은 연결도 인사·ping은 되고, 구독은 sign_in_required", async () => {
    const server = await makeApp({ viewer: null });
    const { ws, inbox } = await greet(server);
    ws.send(encodeMessage({ t: "subscribe", id: 1, mapKey: S1_TEST_MAP_KEY }));
    await inbox.until((m) => m.some((x) => x.t === "result"));
    expect(inbox.messages.at(-1)).toEqual({ t: "result", id: 1, ok: false, code: "sign_in_required" });
    ws.terminate();
  });

  it("2차맵을 켜지 않은 서버는 unknown_map", async () => {
    const server = await makeApp({ viewer: ADMIN, world: false });
    const { ws, inbox } = await greet(server);
    ws.send(encodeMessage({ t: "subscribe", id: 1, mapKey: S1_TEST_MAP_KEY }));
    await inbox.until((m) => m.some((x) => x.t === "result"));
    expect(inbox.messages.at(-1)).toEqual({ t: "result", id: 1, ok: false, code: "unknown_map" });
    ws.terminate();
  });

  it("구독하면 시험 2차맵 스냅샷(봇 30개·지형 주소)을 받는다", async () => {
    const server = await makeApp({ viewer: ADMIN, bots: 30 });
    const { ws, inbox } = await greet(server);
    ws.send(encodeMessage({ t: "subscribe", id: 1, mapKey: S1_TEST_MAP_KEY, observe: true }));
    await inbox.until(snapshotDone);
    expect(inbox.messages.find((x) => x.t === "result")).toEqual({ t: "result", id: 1, ok: true });
    const snapshot = inbox.messages.filter((x) => x.t === "map_snapshot");
    expect(snapshot[0]).toMatchObject({
      mapKey: S1_TEST_MAP_KEY,
      part: 0,
      terrain: { url: terrainPath(S1_TEST_MAP_KEY, 1), generatorVersion: 1 },
    });
    expect(snapshot.flatMap((x) => (x.t === "map_snapshot" ? x.units : []))).toHaveLength(30);
    ws.terminate();
  });

  it("관리자 건물 명령: 보낸 연결은 결과를, 다른 구독자는 building_placed를 받는다", async () => {
    const server = await makeApp({ viewer: ADMIN, bots: 0 });
    const a = await greet(server);
    const b = await greet(server);
    for (const peer of [a, b])
      peer.ws.send(encodeMessage({ t: "subscribe", id: 1, mapKey: S1_TEST_MAP_KEY, observe: true }));
    await Promise.all([a.inbox.until(snapshotDone), b.inbox.until(snapshotDone)]);
    // 임시 지형에서 막히지 않은 첫 칸
    const costs = placementCostsFromTerrain(generateTempTerrain(seedFromCellKey(S1_TEST_MAP_KEY)));
    const open = costs.findIndex((cost) => cost > 0);
    const x = open % 256;
    const y = Math.floor(open / 256);
    a.ws.send(
      encodeMessage({
        t: "place_building",
        id: 2,
        mapKey: S1_TEST_MAP_KEY,
        x,
        y,
        width: 1,
        height: 1,
        rotation: 0,
      }),
    );
    await b.inbox.until((m) => m.some((msg) => msg.t === "building_placed"));
    await a.inbox.until((m) => m.some((msg) => msg.t === "result" && msg.id === 2));
    expect(a.inbox.messages.find((msg) => msg.t === "result" && msg.id === 2)).toEqual({
      t: "result",
      id: 2,
      ok: true,
      buildingId: 1,
    });
    expect(b.inbox.messages.find((msg) => msg.t === "building_placed")).toMatchObject({
      mapKey: S1_TEST_MAP_KEY,
      building: { id: 1, x, y, width: 1, height: 1, rotation: 0 },
    });
    a.ws.terminate();
    b.ws.terminate();
  });
});

describe("지형 파일 경로", () => {
  const url = terrainPath(S1_TEST_MAP_KEY, 1);

  it("로그인하지 않으면 401", async () => {
    const server = await makeApp({ viewer: null });
    const res = await server.inject({ method: "GET", url });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "SIGN_IN_REQUIRED" });
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("로그인하면 이진 파일과 1년 캐시 머리글, 읽으면 생성한 지형의 해시", async () => {
    const server = await makeApp({ viewer: ADMIN });
    const res = await server.inject({ method: "GET", url });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/octet-stream");
    expect(res.headers["cache-control"]).toBe(TERRAIN_CACHE_CONTROL);
    const decoded = decodeTerrain(res.rawPayload);
    const terrain = generateTempTerrain(seedFromCellKey(S1_TEST_MAP_KEY));
    expect(decoded.hash.toString(16).padStart(8, "0")).toBe(terrainHash(terrain));
    expect(decoded.mapKey).toBe(S1_TEST_MAP_KEY);

    const zipped = await server.inject({ method: "GET", url, headers: { "accept-encoding": "br, gzip" } });
    expect(zipped.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(zipped.rawPayload).equals(res.rawPayload)).toBe(true);
  });

  it("판 표지가 다르면 그 2차맵 지금 판 주소로 넘긴다(307, 저장 안 함). 표지 없음·없는 2차맵·숫자가 아닌 키는 404", async () => {
    const server = await makeApp({ viewer: ADMIN });
    const get = (path: string) => server.inject({ method: "GET", url: path });
    // 고정본 2차맵과 생성기 2차맵은 판 표지가 다를 수 있다 — 이웃 지형을 지금 2차맵 표지로 물어도 받게 한다(사용자 지적 2026-11-21 회색 2차맵)
    const moved = await get(terrainPath(S1_TEST_MAP_KEY, 2));
    expect(moved.statusCode).toBe(307);
    expect(moved.headers["cache-control"]).toBe("no-store");
    const location = String(moved.headers.location);
    expect(location).toMatch(new RegExp(`^/api/maps/${S1_TEST_MAP_KEY}/terrain\\?v=`));
    expect((await get(location)).statusCode).toBe(200);
    expect((await get(`/api/maps/${S1_TEST_MAP_KEY}/terrain`)).statusCode).toBe(404);
    expect((await get(terrainPath(12345, 1))).json()).toEqual({ error: "MAP_NOT_FOUND" });
    expect((await get("/api/maps/abc/terrain?v=1")).statusCode).toBe(404);
    expect((await get("/api/maps/1e5/terrain?v=1")).statusCode).toBe(404);
  });
});
