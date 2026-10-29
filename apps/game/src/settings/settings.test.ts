// 설정 저장소(settings.ts) 시험 — 메뉴·홈 바꾸기(chooseNavigation·chooseHome)와 계정 요청 줄.
// 요청 줄: 올리기는 한 번에 하나만 보내고, 보내는 동안 바꾼 값은 끝난 뒤 한 번에 보낸다. 로그인 맞추기도 같은 줄에 선다.
// 계정 요청(accountSync.ts)·로그인 상태·Paraglide는 가짜로 바꾸고, 저장소·<html>은 흉내 낸다(node 환경).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_STORAGE_KEY } from "./storage.ts";

interface Pending {
  userId: string;
  resolve: () => void;
  reject: (error: Error) => void;
}

const mocks = vi.hoisted(() => {
  /** 시작한 올리기·로그인 맞추기(끝내기 전까지 기다린다) */
  const uploads: Pending[] = [];
  const syncs: Pending[] = [];
  /** 지금 로그인 상태(settings.ts는 kind·user.id만 읽는다) */
  const session: { current: { kind: string; user?: { id: string } } } = {
    current: { kind: "signed_in", user: { id: "user-me" } },
  };
  /** 로그인 상태 구독자(startSettings가 건다) */
  const listeners: (() => void)[] = [];
  return { uploads, syncs, session, listeners };
});

vi.mock("./accountSync.ts", () => ({
  uploadPending: (_store: unknown, userId: string) =>
    new Promise<void>((resolve, reject) => {
      mocks.uploads.push({ userId, resolve, reject });
    }),
  syncAtSignIn: (_store: unknown, userId: string) =>
    new Promise<void>((resolve, reject) => {
      mocks.syncs.push({ userId, resolve, reject });
    }),
}));
vi.mock("../auth/session.ts", () => ({
  getSessionState: () => mocks.session.current,
  subscribe: (listener: () => void) => {
    mocks.listeners.push(listener);
    return () => {};
  },
}));
vi.mock("../paraglide/runtime.js", () => ({ setLocale: async () => {} }));

/** 몇 틱 기다린다(동적 import·줄의 다음 차례가 돌 시간) */
const settle = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });

let stored: Map<string, string>;

beforeEach(() => {
  mocks.uploads.length = 0;
  mocks.syncs.length = 0;
  mocks.listeners.length = 0;
  mocks.session.current = { kind: "signed_in", user: { id: "user-me" } };
  stored = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => {
      stored.set(key, value);
    },
  });
  vi.stubGlobal("document", { documentElement: { dataset: {} }, querySelector: () => null });
  vi.stubGlobal("window", {
    addEventListener: () => {},
    matchMedia: () => ({ matches: false, addEventListener: () => {} }),
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("메뉴·홈 바꾸기", () => {
  it("기기에 복사본을 저장하고(부른 쪽 객체를 고쳐도 그대로) 올린다", async () => {
    const settings = await import("./settings.ts");
    const nav = { layout: "a", menu: ["future_item", "home"], extra: { x: 1 } };
    expect(settings.chooseNavigation(nav)).toBe(true);
    nav.menu.push("units");
    const device = settings.getSettingsSnapshot().device;
    expect(device.nav).toEqual({ layout: "a", menu: ["future_item", "home"], extra: { x: 1 } });
    expect(device.pending).toEqual({ nav: { by: "user-me" } });
    expect(JSON.parse(stored.get(SETTINGS_STORAGE_KEY) ?? "null")).toMatchObject({ v: 1, nav: device.nav });
    await vi.waitFor(() => expect(mocks.uploads).toHaveLength(1));
    expect(mocks.uploads[0]?.userId).toBe("user-me");
  });

  it("상한(4KB)을 넘거나 JSON으로 못 바꾸는 값은 저장하지 않고 false다(요청도 없다)", async () => {
    const settings = await import("./settings.ts");
    expect(settings.chooseHome({ extra: "x".repeat(4096) })).toBe(false);
    expect(settings.chooseNavigation({ big: 1n })).toBe(false);
    expect(settings.getSettingsSnapshot().device).not.toHaveProperty("home");
    expect(stored.size).toBe(0);
    await settle();
    expect(mocks.uploads).toHaveLength(0);
  });

  it("로그인 전에는 기기에만 저장하고 '올릴 것'(by null)을 남긴다", async () => {
    mocks.session.current = { kind: "signed_out" };
    const settings = await import("./settings.ts");
    expect(settings.chooseHome({ cards: [] })).toBe(true);
    expect(settings.getSettingsSnapshot().device.pending).toEqual({ home: { by: null } });
    await settle();
    expect(mocks.uploads).toHaveLength(0);
  });
});

describe("계정 요청 줄", () => {
  it("올리기는 한 번에 하나: 보내는 동안 바꾼 값은 앞의 것이 끝난 뒤 한 번에 보낸다", async () => {
    const settings = await import("./settings.ts");
    settings.chooseNavigation({ menu: ["home"] });
    await vi.waitFor(() => expect(mocks.uploads).toHaveLength(1));
    // 첫 올리기가 끝나기 전의 바꿈 셋(메뉴 두 번, 홈 한 번)은 다음 올리기 하나가 함께 보낸다
    settings.chooseNavigation({ menu: ["units"] });
    settings.chooseHome({ cards: [] });
    settings.chooseNavigation({ menu: ["economy"] });
    await settle();
    expect(mocks.uploads).toHaveLength(1);
    mocks.uploads[0]?.resolve();
    await vi.waitFor(() => expect(mocks.uploads).toHaveLength(2));
    mocks.uploads[1]?.resolve();
    await settle();
    expect(mocks.uploads).toHaveLength(2);
    expect(settings.getSettingsSnapshot().device).toMatchObject({
      nav: { menu: ["economy"] },
      home: { cards: [] },
    });
  });

  it("로그인할 때 맞추기가 끝나기 전에는 올리지 않는다(같은 줄에 선다)", async () => {
    const settings = await import("./settings.ts");
    settings.startSettings();
    await vi.waitFor(() => expect(mocks.syncs).toHaveLength(1));
    settings.chooseHome({ cards: [{ id: "inbox", size: "2x1" }] });
    await settle();
    expect(mocks.uploads).toHaveLength(0);
    mocks.syncs[0]?.resolve();
    await vi.waitFor(() => expect(mocks.uploads).toHaveLength(1));
  });

  it("앞의 요청이 실패해도 줄은 멈추지 않는다", async () => {
    const settings = await import("./settings.ts");
    settings.chooseNavigation({ menu: ["home"] });
    await vi.waitFor(() => expect(mocks.uploads).toHaveLength(1));
    settings.chooseNavigation({ menu: ["units"] });
    mocks.uploads[0]?.reject(new Error("offline"));
    await vi.waitFor(() => expect(mocks.uploads).toHaveLength(2));
  });
});
