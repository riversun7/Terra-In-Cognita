import { EMPTY_SETTINGS, type UserSettings } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { type DeviceSettings, EMPTY_DEVICE_SETTINGS } from "./storage.ts";
import {
  LOCALE_RELOAD_GUARD_MS,
  afterUpload,
  applyChange,
  canReloadForLocale,
  groupPatch,
  hasGroup,
  parseLocaleReloadMark,
  pendingPatch,
  planSignIn,
  splitByGroup,
} from "./syncRules.ts";

const ME = "user-me";
const OTHER = "user-other";
const device = (overrides: Partial<DeviceSettings> = {}): DeviceSettings => ({
  ...EMPTY_DEVICE_SETTINGS,
  ...overrides,
});
const account = (overrides: Partial<UserSettings> = {}): UserSettings => ({
  ...EMPTY_SETTINGS,
  ...overrides,
});

describe("로그인한 동안 바꿈", () => {
  it("기기에 저장하고 묶음을 '올릴 것'으로 표시한다 → 올릴 값", () => {
    const changed = applyChange(device(), { theme: "dark", followSystem: false }, ME);
    expect(changed).toMatchObject({
      theme: "dark",
      followSystem: false,
      pending: { appearance: { by: ME } },
    });
    expect(pendingPatch(changed, ME)).toEqual({ theme: "dark", followSystem: false });
  });

  it("올리기에 성공하면 표시를 지운다", () => {
    const changed = applyChange(device({ locale: "ko" }), { locale: "en" }, ME);
    const sent = pendingPatch(changed, ME) ?? {};
    expect(sent).toEqual({ locale: "en" });
    const done = afterUpload(changed, sent);
    expect(done.pending).toEqual({});
    expect(done.locale).toBe("en");
  });

  it("올리는 사이에 또 바꿨으면 표시를 남긴다(새 값은 따로 올린다)", () => {
    const first = applyChange(device(), { theme: "dark", followSystem: false }, ME);
    const sent = pendingPatch(first, ME) ?? {};
    const second = applyChange(first, { theme: "station", followSystem: false }, ME);
    expect(afterUpload(second, sent).pending).toEqual({ appearance: { by: ME } });
  });

  it("올리기에 실패하면(표시가 남으면) 다음 로그인 때 계정보다 기기 값을 올린다", () => {
    const changed = applyChange(device(), { theme: "station", followSystem: false }, ME);
    const plan = planSignIn(changed, account({ theme: "dark" }), ME);
    expect(plan.upload).toEqual({ theme: "station", followSystem: false });
    expect(plan.device.theme).toBe("station");
    expect(plan.device.pending).toEqual({ appearance: { by: ME } });
  });
});

describe("로그인하지 않은 동안 바꿈", () => {
  it("로그인 화면에서 바꾼 언어는 로그인할 때 계정에 올리고 그대로 둔다", () => {
    const changed = applyChange(device({ locale: "ko" }), { locale: "en" }, null);
    expect(changed.pending).toEqual({ locale: { by: null } });
    const plan = planSignIn(changed, account({ theme: "dark", locale: "ko" }), ME);
    expect(plan.upload).toEqual({ locale: "en" });
    // 언어는 기기 값, 화면은 계정 값
    expect(plan.device).toMatchObject({ locale: "en", theme: "dark", followSystem: false });
    expect(afterUpload(plan.device, plan.upload ?? {}).pending).toEqual({});
  });

  it("다른 사용자가 바꾸고 못 올린 값은 이 사용자 계정에 올리지 않는다(계정 값이 덮는다)", () => {
    const changed = applyChange(device(), { theme: "station", followSystem: false }, OTHER);
    const plan = planSignIn(changed, account({ theme: "dark" }), ME);
    expect(plan.upload).toBeNull();
    expect(plan.device).toMatchObject({ theme: "dark", pending: {} });
    expect(pendingPatch(changed, ME)).toBeNull();
  });
});

describe("그 밖에 로그인할 때", () => {
  it("계정 값이 오래된 기기 값을 덮는다(올리지 않는다)", () => {
    const plan = planSignIn(
      device({ theme: "dark", locale: "ko" }),
      account({ theme: "station", locale: "en" }),
      ME,
    );
    expect(plan.upload).toBeNull();
    expect(plan.device).toEqual({ theme: "station", followSystem: false, locale: "en", pending: {} });
  });

  it("계정에 값이 없으면 기기 값을 올린다(정한 묶음만)", () => {
    const plan = planSignIn(device({ theme: "contrast" }), null, ME);
    expect(plan.upload).toEqual({ theme: "contrast", followSystem: false });
    expect(plan.device.pending).toEqual({ appearance: { by: ME } });
  });

  it("묶음마다 따로: 계정에 화면만 있으면 화면은 계정 값, 언어는 기기 값을 올린다", () => {
    const plan = planSignIn(device({ theme: "dark", locale: "en" }), account({ followSystem: true }), ME);
    expect(plan.device).toMatchObject({ theme: null, followSystem: true, locale: "en" });
    expect(plan.upload).toEqual({ locale: "en" });
  });

  it("다른 사용자의 표시가 있어도 계정에 값이 없으면 기기 값을 이 사용자 이름으로 올린다", () => {
    const changed = applyChange(device(), { locale: "en" }, OTHER);
    const plan = planSignIn(changed, null, ME);
    expect(plan.upload).toEqual({ locale: "en" });
    expect(plan.device.pending).toEqual({ locale: { by: ME } });
  });

  it("양쪽 다 정한 것이 없으면 아무것도 하지 않는다", () => {
    expect(planSignIn(device(), null, ME)).toEqual({ device: device(), upload: null });
    expect(planSignIn(device(), account(), ME)).toEqual({ device: device(), upload: null });
  });

  it("계정 값이 '정하지 않음'이면 기기 값을 지우지 않는다(묶음에 값이 없는 것으로 본다)", () => {
    const plan = planSignIn(device({ theme: "station" }), account({ locale: "ko" }), ME);
    expect(plan.device).toMatchObject({ theme: "station", locale: "ko" });
    expect(plan.upload).toEqual({ theme: "station", followSystem: false });
  });
});

describe("계정 언어로 새로고침", () => {
  it("처음이거나 다른 언어면 한다", () => {
    expect(canReloadForLocale(null, "en", 1_000)).toBe(true);
    expect(canReloadForLocale({ locale: "ko", at: 1_000 }, "en", 1_001)).toBe(true);
  });

  it("같은 언어로 1분 안에 또 새로고침하지 않는다(시계가 뒤로 가도)", () => {
    expect(canReloadForLocale({ locale: "en", at: 10_000 }, "en", 10_000 + LOCALE_RELOAD_GUARD_MS - 1)).toBe(
      false,
    );
    expect(canReloadForLocale({ locale: "en", at: 10_000 }, "en", 10_000 - 5)).toBe(false);
    expect(canReloadForLocale({ locale: "en", at: 10_000 }, "en", 10_000 + LOCALE_RELOAD_GUARD_MS)).toBe(
      true,
    );
  });

  it("표시 읽기: 모양이 틀리면 null", () => {
    expect(parseLocaleReloadMark(JSON.stringify({ locale: "en", at: 5 }))).toEqual({ locale: "en", at: 5 });
    expect(parseLocaleReloadMark(null)).toBeNull();
    expect(parseLocaleReloadMark("{bad")).toBeNull();
    expect(parseLocaleReloadMark(JSON.stringify({ locale: "en", at: "5" }))).toBeNull();
  });
});

// ── 메뉴(nav)·홈(home) 묶음(ADR 2026-10-29-app-shell 5절): 화면·언어와 같은 규칙, 값은 모양을 모르는 JSON 객체 ──

/** 더 새 버전이 넣은 칸(extra)·목록에 없는 항목 ID(future_item)가 든 메뉴 값 */
const NAV = { layout: "a", menu: ["future_item", "home", "map"], extra: { x: 1 } };
const NAV_ACCOUNT = { layout: "c", menu: ["cyborg", "home"] };
/** 모르는 카드·카드 안의 모르는 칸이 든 홈 값 */
const HOME = {
  template: "dt_hybrid",
  cards: [
    { id: "inbox", size: "2x1" },
    { id: "future_card", size: "3x3", pin: true },
  ],
};
const HOME_ACCOUNT = { template: "dt_hybrid", cards: [] };

describe("메뉴·홈 묶음", () => {
  it("묶음 표: 값이 없으면 정하지 않음, 고르면 그 칸만", () => {
    expect(hasGroup(account(), "nav")).toBe(false);
    expect(hasGroup(account({ nav: {} }), "nav")).toBe(true);
    expect(hasGroup(account({ home: HOME }), "home")).toBe(true);
    expect(groupPatch(account({ nav: NAV, home: HOME }), "nav")).toEqual({ nav: NAV });
    expect(groupPatch(account(), "home")).toEqual({});
  });

  it("바꾸면 그 묶음만 '올릴 것'이고, 값은 고치지 않고 그대로 옮긴다(안쪽 모르는 칸 포함)", () => {
    const changed = applyChange(device({ theme: "dark" }), { nav: NAV }, ME);
    expect(changed.pending).toEqual({ nav: { by: ME } });
    expect(changed.nav).toBe(NAV);
    expect(pendingPatch(changed, ME)).toEqual({ nav: NAV });
  });

  it("계정 값이 덮는다(이 기기에서 바꾸지 않은 묶음)", () => {
    const plan = planSignIn(
      device({ nav: NAV, home: HOME }),
      account({ nav: NAV_ACCOUNT, home: HOME_ACCOUNT }),
      ME,
    );
    expect(plan.upload).toBeNull();
    expect(plan.device).toMatchObject({ nav: NAV_ACCOUNT, home: HOME_ACCOUNT, pending: {} });
  });

  it("로그인 전에 바꾼 값은 로그인할 때 올리고 기기 값을 지킨다", () => {
    const changed = applyChange(device(), { home: HOME }, null);
    expect(changed.pending).toEqual({ home: { by: null } });
    const plan = planSignIn(changed, account({ home: HOME_ACCOUNT }), ME);
    expect(plan.upload).toEqual({ home: HOME });
    expect(plan.device.home).toBe(HOME);
    expect(plan.device.pending).toEqual({ home: { by: ME } });
  });

  it("다른 계정이 바꾸고 못 올린 값은 버린다(계정 값이 덮고 표시도 지운다)", () => {
    const changed = applyChange(device(), { nav: NAV }, OTHER);
    expect(pendingPatch(changed, ME)).toBeNull();
    const plan = planSignIn(changed, account({ nav: NAV_ACCOUNT }), ME);
    expect(plan.upload).toBeNull();
    expect(plan.device).toMatchObject({ nav: NAV_ACCOUNT, pending: {} });
  });

  it("계정에 값이 없으면 기기 값을 올린다(옛 서버도 같다: 응답에 칸이 없다)", () => {
    const plan = planSignIn(device({ nav: NAV }), account({ theme: "dark" }), ME);
    expect(plan.upload).toEqual({ nav: NAV });
    expect(plan.device).toMatchObject({ theme: "dark", nav: NAV, pending: { nav: { by: ME } } });
  });

  it("묶음 4개가 따로 맞춰진다: 화면은 계정, 언어는 로그인 전 바꿈, 메뉴는 못 올린 바꿈, 홈은 계정", () => {
    let local = device({ theme: "station", locale: "ko", home: HOME });
    local = applyChange(local, { locale: "en" }, null);
    local = applyChange(local, { nav: NAV }, ME);
    const plan = planSignIn(
      local,
      account({ theme: "dark", locale: "ko", nav: NAV_ACCOUNT, home: HOME_ACCOUNT }),
      ME,
    );
    expect(plan.device).toEqual({
      theme: "dark",
      followSystem: false,
      locale: "en",
      nav: NAV,
      home: HOME_ACCOUNT,
      pending: { locale: { by: ME }, nav: { by: ME } },
    });
    expect(plan.upload).toEqual({ locale: "en", nav: NAV });
  });

  it("올릴 값을 묶음마다 나눈다(묶음 표 순서, 묶음 안의 칸은 함께)", () => {
    expect(splitByGroup({ home: HOME, locale: "en", followSystem: false, theme: "dark", nav: NAV })).toEqual([
      { theme: "dark", followSystem: false },
      { locale: "en" },
      { nav: NAV },
      { home: HOME },
    ]);
    expect(splitByGroup({ followSystem: true })).toEqual([{ followSystem: true }]);
    expect(splitByGroup({})).toEqual([]);
  });

  it("올린 뒤: 다시 읽어 다른 객체여도 JSON이 같으면 표시를 지우고, 그새 바꿨으면 남긴다", () => {
    const changed = applyChange(device(), { nav: NAV }, ME);
    const sent = { nav: structuredClone(NAV) };
    expect(afterUpload(changed, sent).pending).toEqual({});
    const again = applyChange(changed, { nav: { ...NAV, layout: "c" } }, ME);
    expect(afterUpload(again, sent).pending).toEqual({ nav: { by: ME } });
  });

  it("값이 없는 메뉴·홈 표시(다른 판이 남긴 것)는 올리지 않고, 계정 값을 막지 않는다", () => {
    const dangling = device({ pending: { nav: { by: ME }, home: { by: null } } });
    expect(pendingPatch(dangling, ME)).toBeNull();
    const plan = planSignIn(dangling, account({ nav: NAV_ACCOUNT }), ME);
    expect(plan.upload).toBeNull();
    expect(plan.device).toMatchObject({ nav: NAV_ACCOUNT, pending: {} });
    expect(Object.hasOwn(plan.device, "home")).toBe(false);
  });
});
