// 계정 설정 올리기·맞추기 시험 — 실제 tRPC 클라이언트(httpBatchLink)가 가짜 서버(tRPC fetch 어댑터)와 HTTP 묶음 요청을
// 그대로 주고받는다. 기기 저장소는 바꿀 때마다 저장 문자열로 쓰고 읽는다(localStorage와 같은 길).
// - 옛 서버: W2 전 서버처럼 settings.set의 바깥 칸을 엄격히 본다(nav·home이 오면 400 BAD_REQUEST).
// - 새 서버: 받은 칸을 그대로 저장한다(안쪽은 보지 않는다). 실제 서버의 검사·저장은 apps/server/src/settings/settings.db.test.ts.
import { EMPTY_SETTINGS, type SettingsObject, type UserSettings, isSettingsObject } from "@terra/shared";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createApiClient } from "../net/api.ts";
import { type DeviceStore, syncAtSignIn, uploadPending } from "./accountSync.ts";
import {
  type DeviceSettings,
  EMPTY_DEVICE_SETTINGS,
  parseDeviceSettings,
  serializeDeviceSettings,
} from "./storage.ts";
import { type SettingsPatch, applyChange } from "./syncRules.ts";

const ME = "user-me";
const TRPC_URL = "http://game.test/api/trpc";

/** 더 새 버전이 넣은 칸(extra)·목록에 없는 항목 ID(future_item)·모르는 카드가 든 값 */
const NAV = { layout: "a", menu: ["future_item", "cyborg", "home"], extra: { x: 1 } };
const HOME = { template: "dt_hybrid", cards: [{ id: "future_card", size: "3x3", pin: true }], extra: "kept" };

/** 기기 저장소 흉내 — 쓸 때마다 저장 문자열로 바꾸고, 읽을 때마다 다시 읽는다(다시 읽은 값은 늘 새 객체) */
function storageStore(initial: DeviceSettings): DeviceStore & { raw: () => string } {
  let raw = serializeDeviceSettings(initial);
  return {
    get: () => parseDeviceSettings(raw),
    replace: (next) => {
      raw = serializeDeviceSettings(next);
    },
    raw: () => raw,
  };
}

/** 가짜 서버가 받은 HTTP 요청 */
interface SeenRequest {
  url: string;
  method: string;
  status: number;
}

const t = initTRPC.create();

/** 옛 서버 settings.set 입력 검사: 바깥 칸은 theme·followSystem·locale만(strictObject), 빈 요청도 막는다 */
function oldSetInput(input: unknown): SettingsPatch {
  if (!isSettingsObject(input)) throw new Error("expected object");
  const unknownKeys = Object.keys(input).filter((key) => !["theme", "followSystem", "locale"].includes(key));
  if (unknownKeys.length > 0) throw new Error(`Unrecognized keys: ${unknownKeys.join(", ")}`);
  if (Object.keys(input).length === 0) throw new Error("EMPTY_PATCH");
  const patch: SettingsPatch = {};
  const { theme, followSystem, locale } = input;
  if (
    theme === null ||
    theme === "pastel" ||
    theme === "dark" ||
    theme === "contrast" ||
    theme === "station"
  ) {
    patch.theme = theme;
  }
  if (typeof followSystem === "boolean") patch.followSystem = followSystem;
  if (locale === null || locale === "ko" || locale === "en") patch.locale = locale;
  return patch;
}

/** 새 서버 입력 검사 흉내: JSON 객체이고 비어 있지 않으면 그대로(nav·home 안쪽 검사는 실제 서버 시험이 본다) */
function newSetInput(input: unknown): object {
  if (!isSettingsObject(input) || Object.keys(input).length === 0) throw new Error("bad input");
  return input;
}

/** 가짜 서버: 받은 칸을 계정 값에 덮어 저장한다 */
function fakeServer(kind: "old" | "new", initial: UserSettings | null = null) {
  let account: UserSettings | null = initial;
  const requests: SeenRequest[] = [];
  const save = (patch: object): UserSettings => {
    account = { ...EMPTY_SETTINGS, ...account, ...patch };
    return account;
  };
  const router = t.router({
    settings: t.router({
      get: t.procedure.query(() => account),
      set:
        kind === "old"
          ? t.procedure.input(oldSetInput).mutation(({ input }) => save(input))
          : t.procedure.input(newSetInput).mutation(({ input }) => save(input)),
    }),
  });
  const client = createApiClient({
    url: TRPC_URL,
    fetch: async (url, init) => {
      const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      const request = new Request(href, {
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers ?? {}),
        ...(init?.body === undefined || init.body === null ? {} : { body: init.body }),
      });
      const response = await fetchRequestHandler({ endpoint: "/api/trpc", req: request, router });
      requests.push({ url: href, method: request.method, status: response.status });
      return response;
    },
  });
  return { client, requests, account: () => account };
}

/** 묶음 4개를 이 사용자가 바꾸고 아직 못 올린 기기 */
function changedDevice(): DeviceSettings {
  let device = applyChange(EMPTY_DEVICE_SETTINGS, { theme: "dark", followSystem: false }, ME);
  device = applyChange(device, { locale: "en" }, ME);
  device = applyChange(device, { nav: NAV }, ME);
  return applyChange(device, { home: HOME }, ME);
}

describe("옛 서버(새 칸을 모름)에 올리기", () => {
  it("묶음 4개가 HTTP 요청 하나로 가고, 답은 부른 것마다 따로다: 화면·언어는 올라가고 메뉴·홈은 '올릴 것'으로 남는다", async () => {
    const server = fakeServer("old");
    const store = storageStore(changedDevice());
    await uploadPending(store, ME, 5_000, server.client);

    expect(server.requests).toHaveLength(1);
    const [request] = server.requests;
    expect(request?.method).toBe("POST");
    expect(
      request?.url.startsWith(`${TRPC_URL}/settings.set,settings.set,settings.set,settings.set?batch=1`),
    ).toBe(true);
    // 성공 2개·실패 2개가 섞인 묶음 응답은 207(Multi-Status)이다
    expect(request?.status).toBe(207);

    expect(server.account()).toEqual({ theme: "dark", followSystem: false, locale: "en" });
    const after = store.get();
    expect(after.pending).toEqual({ nav: { by: ME }, home: { by: ME } });
    // 기기 값은 그대로다(안쪽 모르는 칸 포함)
    expect(after).toMatchObject({ theme: "dark", locale: "en", nav: NAV, home: HOME });
  });

  it("로그인할 때: 화면은 계정 값이 덮고, 계정에 없는 메뉴·홈은 기기 값을 올리지만 400이라 '올릴 것'으로 남는다", async () => {
    const server = fakeServer("old", { theme: "dark", followSystem: false, locale: null });
    let device = applyChange({ ...EMPTY_DEVICE_SETTINGS, theme: "station" }, { nav: NAV }, ME);
    device = applyChange(device, { home: HOME }, ME);
    const store = storageStore(device);
    await syncAtSignIn(store, ME, server.client);

    expect(store.get()).toEqual({
      theme: "dark",
      followSystem: false,
      locale: null,
      nav: NAV,
      home: HOME,
      pending: { nav: { by: ME }, home: { by: ME } },
    });
    // 읽기 1번(GET) + 올리기 묶음 1번(POST, 둘 다 400이라 묶음 응답도 400)
    expect(server.requests.map(({ method, status }) => [method, status])).toEqual([
      ["GET", 200],
      ["POST", 400],
    ]);
    expect(server.account()).toEqual({ theme: "dark", followSystem: false, locale: null });
  });
});

describe("새 서버에 올리기", () => {
  it("묶음 4개가 모두 올라가 표시가 지워지고, 서버는 안쪽 모르는 칸까지 그대로 받는다", async () => {
    const server = fakeServer("new");
    const store = storageStore(changedDevice());
    await uploadPending(store, ME, 5_000, server.client);

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]?.status).toBe(200);
    expect(store.get().pending).toEqual({});
    expect(server.account()).toEqual({
      theme: "dark",
      followSystem: false,
      locale: "en",
      nav: NAV,
      home: HOME,
    });
  });

  it("기기 저장 → 올리기 → 서버 → 다른 기기에서 읽기: 더 새 버전이 넣은 안쪽 칸이 남는다", async () => {
    const server = fakeServer("new");
    await uploadPending(storageStore(changedDevice()), ME, 5_000, server.client);

    const other = storageStore(EMPTY_DEVICE_SETTINGS);
    await syncAtSignIn(other, ME, server.client);
    const read = other.get();
    expect(read.nav).toEqual(NAV);
    expect(read.home).toEqual(HOME);
    expect(read.pending).toEqual({});
    expect(JSON.parse(other.raw())).toMatchObject({
      v: 1,
      nav: { extra: { x: 1 }, menu: ["future_item", "cyborg", "home"] },
    });
  });

  it("올릴 것이 없으면 요청하지 않는다", async () => {
    const server = fakeServer("new");
    await uploadPending(storageStore(EMPTY_DEVICE_SETTINGS), ME, 5_000, server.client);
    expect(server.requests).toHaveLength(0);
  });

  it("요청·응답 타입: 메뉴·홈은 모양을 모르는 객체다(기기는 안쪽을 몰라도 보내고 받는다)", () => {
    type Client = ReturnType<typeof createApiClient>;
    type Sent = Parameters<Client["settings"]["set"]["mutate"]>[0];
    type Read = NonNullable<Awaited<ReturnType<Client["settings"]["get"]["query"]>>>;
    expectTypeOf<Sent["nav"]>().toEqualTypeOf<SettingsObject | undefined>();
    expectTypeOf<Sent["home"]>().toEqualTypeOf<SettingsObject | undefined>();
    // 응답은 tRPC 직렬화 타입(Record<string | number, unknown>)이고 기기 설정 값으로 그대로 쓸 수 있다
    expectTypeOf<Read["nav"]>().toExtend<SettingsObject | undefined>();
    expectTypeOf<Read["home"]>().toExtend<SettingsObject | undefined>();
    expectTypeOf<Read>().toExtend<UserSettings>();
  });
});
