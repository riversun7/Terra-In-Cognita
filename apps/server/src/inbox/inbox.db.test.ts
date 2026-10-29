// 홈 자료(tRPC inbox.list·summary.get·dashboard.cards) 시험 — 로그인·시안 자료 권한·빈 상태(ADR 2026-10-29-app-shell 6·7·8·13절)
// 앞 묶음은 DB 없이 돈다(인증이 꺼진 서버). 뒤 묶음은 TEST_DATABASE_URL이 있을 때만 돈다. 아이디·비밀번호는 모두 시험용 가짜 값이다.
import type { inferRouterOutputs } from "@trpc/server";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.ts";
import { createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import {
  TEST_DATABASE_URL,
  TEST_SETTINGS,
  type TestDatabase,
  buildAuthApp,
  createTestDatabase,
  enter,
  sessionCookie,
  trpcQuery,
} from "../testDb.ts";
import type { AppRouter } from "../trpc/router.ts";

type Outputs = inferRouterOutputs<AppRouter>;

const PASSWORD = "fake pass phrase 1";
const EMPTY_COUNTS = { threat: 0, money_survival: 0, stalled: 0, decision: 0, done: 0 };
const SERVER_CARDS = ["cyborg", "units", "assets", "faction"];
/** 홈에 있는 카드 ID 그대로(모르는 ID·기기 카드 포함) */
const HOME_CARD_IDS = ["inbox", ...SERVER_CARDS, "maps", "nope"];

/** 홈이 여는 세 조회. preview를 넣으면 셋 다 시안 자료를 묻는다 */
function homeCalls(preview?: boolean): [string, object][] {
  const flag = preview === undefined ? {} : { preview };
  return [
    ["inbox.list", { ...flag }],
    ["summary.get", { ...flag }],
    ["dashboard.cards", { ids: HOME_CARD_IDS, ...flag }],
  ];
}

/** tRPC 오류 응답의 코드 */
const errorCode = (res: LightMyRequestResponse) =>
  res.json<{ error?: { data?: { code?: string } } }>().error?.data?.code;

describe("홈 자료 — 인증이 꺼진 서버(DB 없음)", () => {
  let app: FastifyInstance | undefined;
  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("로그인할 수 없으므로 셋 다 401 UNAUTHORIZED", async () => {
    app = await buildApp({ contentVersion: "test", logger: false, metricsIntervalMs: 0 });
    for (const [path, input] of homeCalls()) {
      const res = await trpcQuery(app, path, input);
      expect(res.statusCode, path).toBe(401);
      expect(errorCode(res), path).toBe("UNAUTHORIZED");
    }
  });
});

describe.skipIf(!TEST_DATABASE_URL)("홈 자료 — 로그인·시안 자료 권한 (DB)", () => {
  let test: TestDatabase;
  let app: FastifyInstance;
  let player = "";
  let dev = "";
  let admin = "";

  /** 200 응답의 결과 값(타입은 서버 프로시저 출력) */
  async function query<T>(path: string, input: unknown, cookie: string): Promise<T> {
    const res = await trpcQuery(app, path, input, cookie);
    expect(res.statusCode, path).toBe(200);
    return res.json<{ result: { data: T } }>().result.data;
  }
  const inboxList = (input: unknown, cookie: string) =>
    query<Outputs["inbox"]["list"]>("inbox.list", input, cookie);
  const summaryGet = (input: unknown, cookie: string) =>
    query<Outputs["summary"]["get"]>("summary.get", input, cookie);
  const dashboardCards = (input: unknown, cookie: string) =>
    query<Outputs["dashboard"]["cards"]>("dashboard.cards", input, cookie);

  /** 관리 명령으로 역할 있는 계정을 만들고 로그인한다(시험 준비) */
  const createWithRoles = async (id: string, roles: string) => {
    const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
    await executeCommand(
      parseCliArgs(["create-user", "--id", id, "--roles", roles]),
      { TIC_ACTOR: "test:runner", TIC_PASSWORD: PASSWORD },
      { db: test.db, auth },
      { out: () => {}, err: () => {} },
    );
    return sessionCookie(await enter(app, { id, password: PASSWORD }));
  };

  beforeAll(async () => {
    test = await createTestDatabase();
    app = await buildAuthApp(test.db);
    player = sessionCookie(
      await enter(app, { id: "Fake_Inbox1", password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
    );
    dev = await createWithRoles("Fake_InboxDev", "player,dev");
    admin = await createWithRoles("Fake_InboxAdmin", "player,admin");
  });

  afterAll(async () => {
    await app?.close();
    await test?.drop();
  });

  it("로그인하지 않으면 셋 다 401 UNAUTHORIZED(시안 자료를 물어도 같다)", async () => {
    for (const [path, input] of [...homeCalls(), ...homeCalls(true)]) {
      const res = await trpcQuery(app, path, input);
      expect(res.statusCode, path).toBe(401);
      expect(errorCode(res), path).toBe("UNAUTHORIZED");
    }
  });

  it("플레이어: 처리함은 비어 있고(분류별 0, 배지 없음), 복귀 요약은 건너뛰고, 서버 카드는 준비 중", async () => {
    const before = Date.now();
    const inbox = await inboxList(undefined, player);
    expect(inbox).toMatchObject({ items: [], counts: EMPTY_COUNTS, badges: {} });
    expect(inbox.generatedAt).toBeGreaterThanOrEqual(before);
    expect(inbox.generatedAt).toBeLessThanOrEqual(Date.now());

    expect(await summaryGet(undefined, player)).toMatchObject({ show: false, since: null, sections: [] });

    // 모르는 ID·기기 카드(처리할 일·지도)는 빼고, 서버 카드 4장을 요청 순서대로 준비 중으로 답한다
    expect(await dashboardCards({ ids: HOME_CARD_IDS }, player)).toEqual({
      cards: SERVER_CARDS.map((id) => ({ id, status: "not_ready" })),
    });
  });

  it("플레이어가 시안 자료를 부르면 셋 다 403 FORBIDDEN이고, preview: false는 자기 자료를 준다", async () => {
    for (const [path, input] of homeCalls(true)) {
      const res = await trpcQuery(app, path, input, player);
      expect(res.statusCode, path).toBe(403);
      expect(errorCode(res), path).toBe("FORBIDDEN");
    }
    for (const [path, input] of homeCalls(false)) {
      expect((await trpcQuery(app, path, input, player)).statusCode, path).toBe(200);
    }
  });

  it("dev·admin은 시안 자료를 받는다: 5분류 순서·항목마다 표시, 복귀 요약 칸 4종, 서버 카드는 그대로 준비 중", async () => {
    for (const cookie of [dev, admin]) {
      const inbox = await inboxList({ preview: true }, cookie);
      expect(inbox.items.map((item) => item.category)).toEqual([
        "threat",
        "threat",
        "money_survival",
        "money_survival",
        "stalled",
        "stalled",
        "decision",
        "done",
      ]);
      expect(inbox.items.every((item) => item.preview === true)).toBe(true);
      expect(inbox.items.find((item) => item.id === "unit_idle:preview_base_1")?.count).toBe(6);
      expect(inbox.counts).toEqual({ threat: 2, money_survival: 2, stalled: 2, decision: 1, done: 1 });
      expect(inbox.badges).toEqual({ faction: 1, economy: 1, units: 2 });

      const summary = await summaryGet({ preview: true }, cookie);
      expect(summary.show).toBe(true);
      expect(summary.since).toBe(summary.until - 8 * 3_600_000);
      expect(summary.sections.map((section) => [section.kind, section.preview])).toEqual([
        ["production", true],
        ["raid", true],
        ["injury", true],
        ["world_news", true],
      ]);

      expect(await dashboardCards({ ids: HOME_CARD_IDS, preview: true }, cookie)).toEqual({
        cards: SERVER_CARDS.map((id) => ({ id, status: "not_ready" })),
      });
    }
  });

  it("dev·admin도 preview를 넣지 않으면 자기 자료(빈 처리함, 복귀 요약 건너뜀)", async () => {
    expect(await inboxList(undefined, admin)).toMatchObject({ items: [] });
    expect(await summaryGet({}, dev)).toMatchObject({ show: false });
  });

  it("입력 형식이 틀리면 400 BAD_REQUEST(모르는 칸, 문자열 preview, 카드 25장, ids 없음·빈 ID)", async () => {
    for (const [path, input] of [
      ["inbox.list", { preview: true, userId: "someone" }],
      ["inbox.list", { preview: "yes" }],
      ["summary.get", { since: 0 }],
      ["dashboard.cards", { ids: Array.from({ length: 25 }, (_, i) => `card_${i}`) }],
      ["dashboard.cards", {}],
      ["dashboard.cards", { ids: [""] }],
    ] as const) {
      const res = await trpcQuery(app, path, input, admin);
      expect(res.statusCode, `${path} ${JSON.stringify(input)}`).toBe(400);
      expect(errorCode(res)).toBe("BAD_REQUEST");
    }
  });

  it("홈의 같은 틱 묶음 요청(HTTP 1번)은 부른 것마다 따로 답한다: 한 조회의 403이 다른 조회를 막지 않는다", async () => {
    const input = { 0: { preview: true }, 1: {}, 2: { ids: ["units"] } };
    const res = await app.inject({
      method: "GET",
      url: `/api/trpc/inbox.list,summary.get,dashboard.cards?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`,
      headers: { cookie: player },
    });
    const body = res.json<{ result?: { data?: unknown }; error?: { data?: { code?: string } } }[]>();
    expect(body).toHaveLength(3);
    expect(body[0]?.error?.data?.code).toBe("FORBIDDEN");
    expect(body[1]?.result?.data).toMatchObject({ show: false });
    expect(body[2]?.result?.data).toEqual({ cards: [{ id: "units", status: "not_ready" }] });
  });
});
