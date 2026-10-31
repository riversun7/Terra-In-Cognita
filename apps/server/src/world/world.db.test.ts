// 2차맵 로그인·권한 DB 통합 시험 — TEST_DATABASE_URL이 있을 때만. 아이디·비밀번호는 모두 시험용 가짜 값이다.
// 실제 세션 쿠키로 WebSocket을 열고(출처 검사 포함) 구독·명령·지형 파일을 확인한다.
import { Socket } from "node:net";
import {
  type ClientMessageOf,
  PROTOCOL_VERSION,
  S1_TEST_MAP_KEY,
  type ServerMessage,
  decodeServerMessage,
  encodeMessage,
  terrainPath,
} from "@terra/protocol";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import {
  TEST_DATABASE_URL,
  TEST_ORIGIN,
  TEST_SETTINGS,
  type TestDatabase,
  createTestDatabase,
  enter,
  rows,
  sessionCookie,
} from "../testDb.ts";

const PASSWORD = "fake pass phrase 1";

type RequestMessage = ClientMessageOf<"subscribe" | "remove_building">;

function resultOf(messages: ServerMessage[]): ServerMessage | undefined {
  return messages.find((m) => m.t === "result");
}

/** 건물 1 치우기(없는 건물) */
function remove(id: number): RequestMessage {
  return { t: "remove_building", id, mapKey: S1_TEST_MAP_KEY, buildingId: 1 };
}

describe.skipIf(!TEST_DATABASE_URL)("2차맵 로그인·권한 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let adminCookie = "";
  let playerCookie = "";

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildApp({
      contentVersion: "test",
      logger: false,
      metricsIntervalMs: 0,
      db: test.db,
      auth: { settings: TEST_SETTINGS, openSignup: true },
      world: { testBots: 5, paths: { kind: "inline" } },
    });
    await app.ready();
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    await executeCommand(
      parseCliArgs(["create-user", "--id", "Fake_S1Admin", "--roles", "player,admin"]),
      { TIC_ACTOR: "test:runner", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    adminCookie = sessionCookie(await enter(app, { id: "Fake_S1Admin", password: PASSWORD }));
    playerCookie = sessionCookie(
      await enter(app, { id: "Fake_S1Player", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  /**
   * 연결하고 인사한 뒤, 요청 하나를 보내고 그 결과까지 받은 메시지.
   * injectWS의 가짜 요청에는 소켓이 없어 접속 주소(request.ip)를 못 읽는다 → 주소만 있는 소켓을 넣는다
   */
  async function request(headers: Record<string, string>, message: RequestMessage): Promise<ServerMessage[]> {
    const socket = new Socket();
    Object.defineProperty(socket, "remoteAddress", { value: "198.51.100.77" });
    const ws = await app.injectWS("/ws", { headers, socket });
    const messages: ServerMessage[] = [];
    const done = new Promise<void>((resolve) => {
      ws.on("message", (data: Buffer) => {
        const decoded = decodeServerMessage(data.toString());
        messages.push(decoded);
        if (decoded.t === "welcome") ws.send(encodeMessage(message));
        if (decoded.t === "result" && decoded.id === message.id) setTimeout(resolve, 50);
      });
    });
    ws.send(encodeMessage({ t: "hello", protocolVersion: PROTOCOL_VERSION, clientBuild: "test" }));
    await done;
    ws.terminate();
    return messages;
  }

  const subscribe: RequestMessage = { t: "subscribe", id: 1, mapKey: S1_TEST_MAP_KEY };

  it("세션 쿠키 + 앱 출처: 구독되고 스냅샷이 온다", async () => {
    const messages = await request({ cookie: adminCookie, origin: TEST_ORIGIN }, subscribe);
    expect(resultOf(messages)).toEqual({ t: "result", id: 1, ok: true });
    expect(messages.some((m) => m.t === "map_snapshot")).toBe(true);
    // 접속 상태(S3 ADR 4절): 로그인 연결이 인사하면 접속 기록이 생기고, 끊긴 뒤에는 끊긴 시각이 적힌다
    for (let i = 0; i < 50; i++) {
      const found = await rows<{ offline_since_ms: string | null }>(
        test.db,
        "select offline_since_ms from world_presence",
      );
      if (found.length > 0 && found[0]?.offline_since_ms !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const presence = await rows<{ offline_since_ms: string | null }>(
      test.db,
      "select offline_since_ms from world_presence",
    );
    expect(presence).toHaveLength(1);
    expect(presence[0]?.offline_since_ms).not.toBeNull();
  });

  it("다른 출처에서 연 연결은 쿠키가 있어도 로그인하지 않은 것으로 본다", async () => {
    const messages = await request({ cookie: adminCookie, origin: "https://evil.example.test" }, subscribe);
    expect(resultOf(messages)).toEqual({ t: "result", id: 1, ok: false, code: "sign_in_required" });
  });

  it("쿠키가 없으면 sign_in_required", async () => {
    const messages = await request({ origin: TEST_ORIGIN }, subscribe);
    expect(resultOf(messages)).toMatchObject({ ok: false, code: "sign_in_required" });
  });

  it("명령: player는 forbidden, admin은 된다", async () => {
    expect(resultOf(await request({ cookie: playerCookie, origin: TEST_ORIGIN }, remove(5)))).toEqual({
      t: "result",
      id: 5,
      ok: false,
      code: "forbidden",
    });
    // admin은 권한을 통과해 판정까지 간다(건물이 없어 unknown_building)
    expect(resultOf(await request({ cookie: adminCookie, origin: TEST_ORIGIN }, remove(6)))).toEqual({
      t: "result",
      id: 6,
      ok: false,
      code: "unknown_building",
    });
  });

  it("지형 파일: 쿠키가 있으면 200, 없으면 401", async () => {
    const url = terrainPath(S1_TEST_MAP_KEY, 1);
    expect((await app.inject({ method: "GET", url, headers: { cookie: playerCookie } })).statusCode).toBe(
      200,
    );
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
  });
});
