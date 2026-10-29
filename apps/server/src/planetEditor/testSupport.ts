// 행성 편집기 시험 도우미 — 시험 파일끼리 서로 import하지 않게 여기에 둔다(게임 앱 선언 파일에는 넣지 않는다: tsconfig.api.json)
// 저장소 팩(content/core)을 서버 시작과 같은 길로 읽는다. 해시·시드 값은 적지 않고 팩·생성기에서 읽는다.
// 아이디·비밀번호는 모두 시험용 가짜 값이다.
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { buildApp } from "../app.ts";
import { type TerraAuth, createAuth } from "../auth/auth.ts";
import { executeCommand, parseCliArgs } from "../cli/commands.ts";
import { DEFAULT_CONTENT_DIR } from "../config.ts";
import { type ContentLoadResult, loadServerContent } from "../content.ts";
import { planetSpecsFromPack } from "../planet/sources.ts";
import {
  TEST_SETTINGS,
  type TestDatabase,
  createTestDatabase,
  enter,
  rows,
  sessionCookie,
  trpcMutation,
  trpcQuery,
} from "../testDb.ts";
import { type PlanetEditorBuild, buildPlanetEditorDefinitions } from "./definitions.ts";
import type { PlanetEditorLimits } from "./services.ts";
import type { JsonObject } from "./types.ts";

export type LoadedContent = Extract<ContentLoadResult, { ok: true }>;

/** 저장소 팩(검사 통과) */
export function loadPack(): LoadedContent {
  const loaded = loadServerContent(DEFAULT_CONTENT_DIR);
  if (!loaded.ok) throw new Error(loaded.lines.join("\n"));
  return loaded;
}

/** 저장소 팩으로 만든 정의 조회 자료(서버 시작과 같다: 행성마다 확인 레벨로 한 번 생성) */
export function packEditorBuild(loaded: LoadedContent = loadPack()): PlanetEditorBuild {
  return buildPlanetEditorDefinitions({
    content: loaded.content,
    raw: loaded.raw,
    specs: planetSpecsFromPack(loaded.pack),
  });
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 팩 파일의 행성 항목(JSON 그대로 복사) */
export function rawPlanet(loaded: LoadedContent, id: string): JsonObject {
  const found = loaded.raw.planets.find((entry) => isJsonObject(entry) && entry.id === id);
  const copy: unknown = structuredClone(found);
  if (!isJsonObject(copy)) throw new Error(`content/core has no planet ${id}`);
  return copy;
}

/** 편집 전용 행성 ID(ADR 38 10절) */
export const EDITOR_PLANET_ID = "s2_editor_planet";
/** S2 시험 행성 ID */
export const TEST_PLANET_ID = "s2_test_planet";

// ── DB 시험(TEST_DATABASE_URL) ─────────────────────────────────────────────────────────────

const PASSWORD = "fake pass phrase 7";

/** 시험 계정: 이름 → [로그인 아이디, 역할] (player는 들어가기로 가입, 나머지는 관리 명령으로 만든다) */
export const EDITOR_TEST_ACCOUNTS = {
  player: ["Fake_EdPlayer", undefined],
  gm: ["Fake_EdGm", "player,gm"],
  dev: ["Fake_EdDev", "player,dev"],
  dev2: ["Fake_EdDev2", "dev"],
  admin: ["Fake_EdAdmin", "player,admin"],
} as const;
export type EditorAccount = keyof typeof EDITOR_TEST_ACCOUNTS;

export interface EditorTestApp {
  test: TestDatabase;
  app: FastifyInstance;
  auth: TerraAuth;
  loaded: LoadedContent;
  build: PlanetEditorBuild;
  cookie: Record<EditorAccount, string>;
  userId: Record<EditorAccount, string>;
  close(): Promise<void>;
}

/** 속도 제한을 사실상 끈 값(짧은 동안 많이 부르는 시험) */
export const RELAXED_LIMITS: Partial<PlanetEditorLimits> = {
  callsPerUser: { capacity: 100_000, refillPerMinute: 100_000 },
  definitionsPerUser: { capacity: 100_000, refillPerMinute: 100_000 },
};

export interface EditorTestAppOptions {
  /** 편집기 속도 제한 숫자 바꾸기(기본은 운영 값) */
  limits?: Partial<PlanetEditorLimits>;
}

/** 새 시험 DB + 인증·편집기를 켠 앱 + 시험 계정(세션 쿠키). 정의 조회 자료는 저장소 팩으로 만든다 */
export async function startEditorTestApp(options: EditorTestAppOptions = {}): Promise<EditorTestApp> {
  const loaded = loadPack();
  const build = packEditorBuild(loaded);
  const test = await createTestDatabase();
  const app = await buildApp({
    contentVersion: loaded.content.version,
    logger: false,
    metricsIntervalMs: 0,
    db: test.db,
    auth: { settings: TEST_SETTINGS, openSignup: true },
    planetEditor: { definitions: build.definitions, limits: options.limits },
  });
  await app.ready();
  const auth = createAuth({ db: test.db, settings: TEST_SETTINGS });
  const io = { out: () => {}, err: () => {} };
  /** 계정을 만들고 들어가서 세션 쿠키와 UUID를 돌려준다 */
  const account = async (name: EditorAccount): Promise<{ cookie: string; id: string }> => {
    const [loginId, roles] = EDITOR_TEST_ACCOUNTS[name];
    let cookie: string;
    if (roles === undefined) {
      cookie = sessionCookie(
        await enter(app, { id: loginId, password: PASSWORD, create: true, passwordConfirm: PASSWORD }),
      );
    } else {
      await executeCommand(
        parseCliArgs(["create-user", "--id", loginId, "--roles", roles]),
        { TIC_ACTOR: "test:planet-editor", TIC_PASSWORD: PASSWORD },
        { db: test.db, auth },
        io,
      );
      cookie = sessionCookie(await enter(app, { id: loginId, password: PASSWORD }));
    }
    const [row] = await rows<{ id: string }>(test.db, "select id from users where username = $1", [
      loginId.toLowerCase(),
    ]);
    if (!row) throw new Error(`account ${loginId} missing`);
    return { cookie, id: row.id };
  };
  const player = await account("player");
  const gm = await account("gm");
  const dev = await account("dev");
  const dev2 = await account("dev2");
  const admin = await account("admin");
  return {
    test,
    app,
    auth,
    loaded,
    build,
    cookie: { player: player.cookie, gm: gm.cookie, dev: dev.cookie, dev2: dev2.cookie, admin: admin.cookie },
    userId: { player: player.id, gm: gm.id, dev: dev.id, dev2: dev2.id, admin: admin.id },
    async close() {
      await app.close();
      await test.drop();
    },
  };
}

/** planetEditor.<path> 조회 */
export function editorQuery(app: FastifyInstance, path: string, input: unknown, cookie?: string) {
  return trpcQuery(app, `planetEditor.${path}`, input, cookie);
}

/** planetEditor.<path> 쓰기(기본은 같은 출처 브라우저처럼) */
export function editorMutation(
  app: FastifyInstance,
  path: string,
  input: unknown,
  cookie?: string,
  headers?: Record<string, string>,
) {
  return trpcMutation(app, `planetEditor.${path}`, input, cookie, headers);
}

/** 세션 쿠키("tic.session_token=<토큰>.<서명>") → DB sessions.token */
export function sessionTokenOf(cookie: string): string {
  return decodeURIComponent(cookie.split("=")[1] ?? "").split(".")[0] ?? "";
}

/** 그 세션의 만료 시각(ms) */
export async function sessionExpiresAt(test: TestDatabase, cookie: string): Promise<number> {
  const [row] = await rows<{ expires_at: Date }>(
    test.db,
    "select expires_at from sessions where token = $1",
    [sessionTokenOf(cookie)],
  );
  if (!row) throw new Error("session missing");
  return row.expires_at.getTime();
}

/** tRPC 응답의 결과 값 */
export function resultOf(res: LightMyRequestResponse): unknown {
  const body: unknown = res.json();
  return isJsonObject(body) && isJsonObject(body.result) ? body.result.data : undefined;
}

/** tRPC 오류 응답의 { code, reason, message } (오류가 아니면 null) */
export function errorOf(
  res: LightMyRequestResponse,
): { code: unknown; reason: unknown; message: unknown } | null {
  const body: unknown = res.json();
  if (!isJsonObject(body) || !isJsonObject(body.error)) return null;
  const data = isJsonObject(body.error.data) ? body.error.data : {};
  return { code: data.code, reason: data.reason, message: body.error.message };
}
