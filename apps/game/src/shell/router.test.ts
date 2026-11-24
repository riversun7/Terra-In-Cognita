// 라우터 기록 처리 시험(가짜 history) — ADR 2026-10-29-app-shell 2절 표의 줄마다, 서랍에서 고르기(popstate 뒤 옮김),
// 새로고침 때 겹침 칸 빼기, 부모로 바꾸기(ADR 37 13절, 계획 W1 통과 기준 1)
import type { RouteTarget } from "@terra/shared";
import { describe, expect, it } from "vitest";
import {
  type EntryState,
  PENDING_TIMEOUT_MS,
  type RouterEnv,
  createRouter,
  readEntryState,
  routeKind,
} from "./router.ts";

interface FakeEntry {
  url: string;
  state: unknown;
}

/** 브라우저 history 흉내: go는 다음 틱에 칸을 옮기고 popstate를 낸다(브라우저처럼 비동기). state는 복사해 둔다 */
class FakeHistory {
  entries: FakeEntry[];
  at = 0;
  readonly listeners = new Set<() => void>();
  goCalls: number[] = [];

  constructor(url: string, state: unknown = null) {
    this.entries = [{ url, state }];
  }

  get state(): unknown {
    return structuredClone(this.entries[this.at]?.state ?? null);
  }

  get url(): string {
    return this.entries[this.at]?.url ?? "";
  }

  pushState(state: unknown, _unused: string, url: string): void {
    this.entries.splice(this.at + 1);
    this.entries.push({ url, state: structuredClone(state) });
    this.at += 1;
  }

  replaceState(state: unknown, _unused: string, url: string): void {
    this.entries[this.at] = { url, state: structuredClone(state) };
  }

  go(delta: number): void {
    this.goCalls.push(delta);
    const to = this.at + delta;
    if (delta === 0 || to < 0 || to >= this.entries.length) return;
    setTimeout(() => {
      this.at = to;
      for (const listener of this.listeners) listener();
    }, 0);
  }

  /** 사람이 브라우저 뒤로(앞으로)를 누름 */
  press(delta: number): void {
    this.go(delta);
    this.goCalls.pop();
  }

  urls(): string[] {
    return this.entries.map((entry) => entry.url);
  }
}

/** 칸 옮기기(setTimeout 0)를 모두 끝낸다 */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

function setup(url = "/", state: unknown = null, history = new FakeHistory(url, state)) {
  let keys = 0;
  let clock = 0;
  const env: RouterEnv = {
    history,
    currentUrl: () => history.url,
    onPopState(listener) {
      history.listeners.add(listener);
      return () => history.listeners.delete(listener);
    },
    newKey: () => `k${++keys}`,
    now: () => clock,
  };
  const router = createRouter(env);
  const seen: string[] = [];
  router.subscribe(() => seen.push(router.getSnapshot().url));
  router.start();
  const go = async (target: RouteTarget, options?: { replace?: boolean }): Promise<void> => {
    router.navigate(target, options);
    await settle();
  };
  return {
    history,
    router,
    seen,
    go,
    advance: (ms: number) => {
      clock += ms;
    },
    entry: (): EntryState => router.getSnapshot().entry,
  };
}

describe("화면 종류", () => {
  it("홈 / 첫 단계 화면(부모 홈 + 틀 보임) / 나머지(지도·상세·없는 화면)", () => {
    expect(routeKind("home")).toBe("home");
    for (const id of ["units", "economy", "faction", "inbox", "mail", "settings", "admin", "dev"] as const) {
      expect(routeKind(id), id).toBe("top");
    }
    for (const id of ["map", "map_planet", "dev_planet_editor", "dev_gpu_bench"] as const) {
      expect(routeKind(id), id).toBe("push");
    }
    expect(routeKind(null)).toBe("push");
  });
});

describe("앱을 켬", () => {
  it("앱이 쓰지 않은 칸(바로 연 주소)은 사슬의 첫 칸 상태로 바꾼다. 홈이면 홈 칸, 첫 단계 화면이면 그 칸", () => {
    const home = setup("/");
    expect(home.entry()).toEqual({ terra: 1, key: "k1", index: 0, root: 0, home: 0, top: null });
    expect(home.router.getSnapshot()).toMatchObject({ via: "initial", url: "/", overlay: null });
    const units = setup("/units?x=1#frag");
    expect(units.entry()).toMatchObject({ index: 0, root: 0, home: null, top: 0 });
    // 주소는 그대로(모르는 검색어·#조각 포함), 화면 주소에서는 #조각만 뺀다
    expect(units.history.url).toBe("/units?x=1#frag");
    expect(units.router.getSnapshot().url).toBe("/units?x=1");
    expect(units.router.getSnapshot().match?.id).toBe("units");
  });

  it("겹침 칸의 아래 칸 열쇠(base)는 겹침 칸에만 있다", () => {
    const overlay = { terra: 1, key: "b", index: 2, root: 0, home: 0, top: 1, overlay: "drawer", base: "a" };
    expect(readEntryState(overlay)).toEqual(overlay);
    // 앞 판의 겹침 칸(아래 칸 열쇠 없음)도 읽는다
    const { base: _base, ...older } = overlay;
    expect(readEntryState(older)).toEqual(older);
    expect(readEntryState({ terra: 1, key: "a", index: 1, root: 0, home: 0, top: 1, base: "x" })).toBeNull();
    expect(readEntryState({ ...overlay, base: "" })).toBeNull();
    expect(readEntryState({ ...overlay, base: 3 })).toBeNull();
  });

  it("모양이 틀린 state(다른 판·다른 앱)는 앱 칸이 아니다", () => {
    expect(readEntryState(null)).toBeNull();
    expect(readEntryState({ terra: 2, key: "a", index: 0, root: 0, home: null, top: null })).toBeNull();
    expect(readEntryState({ terra: 1, key: "a", index: 1, root: 2, home: null, top: null })).toBeNull();
    expect(readEntryState({ terra: 1, key: "a", index: 1, root: 0, home: 5, top: null })).toBeNull();
    expect(
      readEntryState({ terra: 1, key: "a", index: 1, root: 0, home: 0, top: 1, overlay: "x" }),
    ).toBeNull();
    const saved = { terra: 1, key: "a", index: 3, root: 1, home: 1, top: 2, overlay: "drawer" };
    expect(readEntryState(saved)).toEqual(saved);
    const foreign = setup("/economy", { some: "thing" });
    expect(foreign.entry()).toMatchObject({ key: "k1", index: 0, root: 0, top: 0 });
  });

  it("모르는 경로는 없는 화면(match null)이고 쌓는 종류로 본다", () => {
    const { router, entry } = setup("/nope");
    expect(router.getSnapshot().match).toBeNull();
    expect(entry()).toMatchObject({ home: null, top: null });
  });
});

describe("2절 표: 탭·메뉴로 옮기기", () => {
  it("홈에서 다른 첫 단계 화면: 쌓고 '앞 칸이 홈'을 적는다", async () => {
    const { history, go, entry } = setup("/");
    await go({ route: "units" });
    expect(history.urls()).toEqual(["/", "/units"]);
    expect(history.at).toBe(1);
    expect(entry()).toMatchObject({ index: 1, root: 0, home: 0, top: 1 });
  });

  it("홈이 아닌 첫 단계 화면끼리: 바꾸고 표시를 이어 적는다", async () => {
    const { history, go, entry, router } = setup("/");
    await go({ route: "units" });
    await go({ route: "economy" });
    await go({ route: "settings" });
    expect(history.urls()).toEqual(["/", "/settings"]);
    expect(entry()).toMatchObject({ index: 1, home: 0, top: 1 });
    expect(router.getSnapshot().via).toBe("replace");
  });

  it("홈으로: 앞 칸이 앱 홈이면 history.back(). 뒤로 → 홈 → 앱 닫힘이 같다", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "units" });
    await go({ route: "economy" });
    await go({ route: "home" });
    expect(history.goCalls).toEqual([-1]);
    expect(history.at).toBe(0);
    expect(router.getSnapshot()).toMatchObject({ url: "/", via: "pop" });
  });

  it("홈으로: 바로 연 주소(앞에 앱 홈이 없음)면 홈으로 바꾼다", async () => {
    const { history, go, entry } = setup("/economy");
    await go({ route: "home" });
    expect(history.urls()).toEqual(["/"]);
    expect(history.goCalls).toEqual([]);
    expect(entry()).toMatchObject({ index: 0, root: 0, home: 0, top: null });
    // 그 뒤 탭은 다시 홈에서 쌓는다
    await go({ route: "units" });
    expect(history.urls()).toEqual(["/", "/units"]);
  });

  it("지금 화면을 다시 누름: 기록은 그대로, 다시 고름(맨 위로)만 는다", async () => {
    const { history, go, router, seen } = setup("/");
    await go({ route: "units" });
    const before = router.getSnapshot();
    await go({ route: "units" });
    const after = router.getSnapshot();
    expect(history.urls()).toEqual(["/", "/units"]);
    expect(after.reselects).toBe(before.reselects + 1);
    expect(after).toMatchObject({ version: before.version, via: before.via, focusId: null });
    // 켤 때 "/" 한 번, 쌓을 때 한 번, 다시 고름 한 번
    expect(seen).toEqual(["/", "/units", "/units"]);
  });

  it("지금 화면을 초점 칸과 함께 다시 고름(넓은 폭 [메뉴 편집] — 설정에서 설정의 메뉴 칸): 다시 고름에 칸 id가 실린다", async () => {
    const { history, router } = setup("/");
    router.navigate({ route: "settings" });
    await settle();
    const before = router.getSnapshot();
    router.navigate({ route: "settings" }, { focusId: "nav-settings" });
    await settle();
    const after = router.getSnapshot();
    expect(history.urls()).toEqual(["/", "/settings"]);
    expect(after).toMatchObject({
      version: before.version,
      reselects: before.reselects + 1,
      focusId: "nav-settings",
    });
    // 다른 화면에서 누르면 옮긴 뒤 그 칸이다(화면이 바뀜)
    router.navigate({ route: "units" });
    await settle();
    router.navigate({ route: "settings" }, { focusId: "nav-settings" });
    await settle();
    expect(router.getSnapshot()).toMatchObject({ version: after.version + 2, focusId: "nav-settings" });
  });

  it("탭으로 홈(앞 칸이 앱 홈): 다시 고름이 아니라 홈 칸으로 돌아간다(그 칸에서 보던 곳)", async () => {
    const { go, router } = setup("/");
    await go({ route: "units" });
    const before = router.getSnapshot();
    await go({ route: "home" });
    expect(router.getSnapshot()).toMatchObject({
      url: "/",
      via: "pop",
      version: before.version + 1,
      reselects: before.reselects,
    });
  });

  it("같은 화면의 다른 검색어는 바꾼다(예: /inbox?item= → /inbox)", async () => {
    const { history, go } = setup("/");
    await go({ route: "inbox", search: { item: "unit_idle:city_12" } });
    await go({ route: "inbox" });
    expect(history.urls()).toEqual(["/", "/inbox"]);
  });
});

describe("2절 표: 지도·상세는 쌓는다", () => {
  it("지도는 어디서든 쌓고, 지도의 [뒤로]는 앞 화면으로", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "units" });
    await go({ route: "map" });
    expect(history.urls()).toEqual(["/", "/units", "/map"]);
    expect(router.getSnapshot().entry).toMatchObject({ index: 2, home: 0, top: 1 });
    router.back();
    await settle();
    expect(history.at).toBe(1);
    expect(router.getSnapshot().url).toBe("/units");
  });

  it("지도 모드 전환(replace): 뒤로 = 지도를 떠남", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "map" });
    await go({ route: "map_planet" }, { replace: true });
    expect(history.urls()).toEqual(["/", "/map/planet"]);
    router.back();
    await settle();
    expect(router.getSnapshot().url).toBe("/");
  });

  it("상세에서 탭: 첫 단계 화면 칸까지 돌아가 바꾼다. 중간 칸은 화면에 내보내지 않는다", async () => {
    const { history, go, seen } = setup("/");
    await go({ route: "dev" });
    await go({ route: "dev_gpu_bench" });
    expect(history.urls()).toEqual(["/", "/dev", "/dev/gpu-bench"]);
    seen.length = 0;
    await go({ route: "units" });
    expect(history.goCalls).toEqual([-1]);
    // 바꾸기는 앞으로 칸(상세)을 지우지 않는다(브라우저와 같다). 지금 칸까지만 본다
    expect(history.urls().slice(0, history.at + 1)).toEqual(["/", "/units"]);
    expect(history.at).toBe(1);
    expect(seen).toEqual(["/units"]);
  });

  it("상세에서 홈: 앱 홈 칸까지 한 번에 돌아간다", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "dev" });
    await go({ route: "dev_gpu_bench" });
    await go({ route: "home" });
    expect(history.goCalls).toEqual([-2]);
    expect(history.at).toBe(0);
    expect(router.getSnapshot().url).toBe("/");
  });

  it("홈에서 바로 연 상세(첫 단계 칸 없음)에서 탭: 홈 바로 위 칸을 바꾼다", async () => {
    const { history, go, entry } = setup("/");
    await go({ route: "dev_gpu_bench" });
    expect(entry()).toMatchObject({ index: 1, home: 0, top: null });
    await go({ route: "economy" });
    expect(history.urls()).toEqual(["/", "/economy"]);
    expect(history.goCalls).toEqual([]);
    expect(entry()).toMatchObject({ index: 1, home: 0, top: 1 });
  });

  it("바로 연 주소의 더 깊은 칸에서 탭·홈: 사슬의 첫 칸까지 돌아가 바꾼다", async () => {
    const { history, go, entry } = setup("/units");
    await go({ route: "map" });
    await go({ route: "economy" });
    expect(history.goCalls).toEqual([-1]);
    expect(history.at).toBe(0);
    expect(history.urls()[0]).toBe("/economy");
    await go({ route: "map" });
    await go({ route: "home" });
    expect(history.at).toBe(0);
    expect(history.urls()[0]).toBe("/");
    expect(entry()).toMatchObject({ index: 0, root: 0, home: 0, top: null });
  });
});

describe("2절 표: 화면 안 [뒤로]", () => {
  it("앱이 쌓은 칸이 있으면 history.back()", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "dev" });
    router.back();
    await settle();
    expect(history.goCalls).toEqual([-1]);
    expect(router.getSnapshot().url).toBe("/");
  });

  it("없으면(푸시·즐겨찾기로 바로 연 주소) 부모 화면으로 바꾼다", async () => {
    const { history, router, entry } = setup("/dev/gpu-bench");
    router.back();
    await settle();
    expect(history.urls()).toEqual(["/dev"]);
    expect(entry()).toMatchObject({ index: 0, top: 0, home: null });
    router.back();
    await settle();
    expect(history.urls()).toEqual(["/"]);
    expect(entry()).toMatchObject({ home: 0, top: null });
    // 홈은 부모가 없다
    router.back();
    await settle();
    expect(history.urls()).toEqual(["/"]);
    expect(history.goCalls).toEqual([]);
  });

  it("없는 화면의 부모는 홈이다", async () => {
    const { history, router } = setup("/no/such/page");
    router.back();
    await settle();
    expect(history.urls()).toEqual(["/"]);
  });
});

describe("2절 표: 겹침(서랍·편집 시트)", () => {
  it("겹침만 열고 닫으면 화면은 그대로다: version·via가 바뀌지 않는다(닫기 단추·뒤로 둘 다)", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "units" });
    const screen = router.getSnapshot();
    router.openOverlay("drawer");
    expect(router.getSnapshot()).toMatchObject({ overlay: "drawer", version: screen.version, via: "push" });
    expect(router.getSnapshot().entry).toMatchObject({ index: 2, overlay: "drawer", base: screen.entry.key });
    router.closeOverlay();
    await settle();
    expect(router.getSnapshot()).toMatchObject({ overlay: null, version: screen.version, via: "push" });
    expect(router.getSnapshot().entry).toEqual(screen.entry);
    router.openOverlay("sheet");
    history.press(-1);
    await settle();
    expect(router.getSnapshot()).toMatchObject({
      overlay: null,
      version: screen.version,
      reselects: screen.reselects,
    });
    // 바로 연 화면(처음 켬) 위에서 열고 닫아도 처음 켠 것으로 남는다(틀이 초점을 옮기지 않는다)
    const direct = setup("/settings");
    direct.router.openOverlay("drawer");
    direct.router.closeOverlay();
    await settle();
    expect(direct.router.getSnapshot()).toMatchObject({ via: "initial", version: 1, overlay: null });
  });

  it("열면 같은 주소로 한 칸 쌓고, 닫기 버튼·Esc·닫기 요청이면 그 칸을 history.back()으로 뺀다", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "units" });
    router.openOverlay("drawer");
    expect(history.urls()).toEqual(["/", "/units", "/units"]);
    expect(router.getSnapshot()).toMatchObject({ overlay: "drawer", url: "/units" });
    expect(router.closeOverlay()).toBe(true);
    await settle();
    expect(history.at).toBe(1);
    expect(router.getSnapshot().overlay).toBeNull();
    // 겹침 칸이 아니면 아무것도 하지 않는다
    expect(router.closeOverlay()).toBe(false);
  });

  it("뒤로를 누르면 그 칸이 빠지며 닫힌다(남는 칸 없음). 화면은 그대로라 온 길도 그대로다", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "units" });
    router.openOverlay("drawer");
    history.press(-1);
    await settle();
    expect(router.getSnapshot()).toMatchObject({ overlay: null, url: "/units", via: "push" });
    expect(history.at).toBe(1);
  });

  it("서랍에서 다른 화면을 고름: 겹침 칸을 빼고 popstate 뒤에 옮긴다", async () => {
    const { history, go, router, seen } = setup("/");
    router.openOverlay("drawer");
    seen.length = 0;
    await go({ route: "economy" });
    expect(history.goCalls).toEqual([-1]);
    expect(history.urls()).toEqual(["/", "/economy"]);
    expect(router.getSnapshot()).toMatchObject({ overlay: null, via: "push" });
    expect(router.getSnapshot().entry).toMatchObject({ home: 0, top: 1 });
    // 겹침이 닫힌 중간 칸은 내보내지 않는다
    expect(seen).toEqual(["/economy"]);
  });

  it("서랍에서 지금 화면을 다시 고름: 겹침 칸을 빼고 다시 고름(화면은 그대로). 초점 칸 id도 실린다", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "settings" });
    const screen = router.getSnapshot();
    router.openOverlay("drawer");
    await go({ route: "settings" });
    expect(history.at).toBe(1);
    expect(router.getSnapshot()).toMatchObject({
      overlay: null,
      version: screen.version,
      reselects: screen.reselects + 1,
      focusId: null,
    });
    router.openOverlay("drawer");
    router.navigate({ route: "settings" }, { focusId: "nav-settings" });
    await settle();
    expect(router.getSnapshot()).toMatchObject({
      overlay: null,
      version: screen.version,
      reselects: screen.reselects + 2,
      focusId: "nav-settings",
    });
  });

  it("서랍에서 홈을 고름(첫 단계 화면에서): 겹침 칸을 빼고 홈 칸까지 돌아간다", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "faction" });
    router.openOverlay("drawer");
    await go({ route: "home" });
    expect(history.goCalls).toEqual([-1, -1]);
    expect(history.at).toBe(0);
    expect(router.getSnapshot()).toMatchObject({ url: "/", overlay: null });
  });

  it("새로고침했는데 지금 칸이 겹침 칸: 그 칸을 바로 빼고 겹침은 다시 열지 않는다(처음 켠 화면 그대로)", async () => {
    const first = setup("/");
    await first.go({ route: "units" });
    first.router.openOverlay("drawer");
    first.router.stop();
    // 같은 history로 앱을 다시 켠다(state는 남는다)
    const again = setup("/units", null, first.history);
    expect(again.router.getSnapshot()).toMatchObject({ overlay: null, url: "/units", via: "initial" });
    expect(first.history.goCalls).toEqual([-1]);
    await settle();
    expect(first.history.at).toBe(1);
    // 아래 칸은 겹침이 연 화면이라 화면이 바뀐 것이 아니다: 처음 켠 것으로 남는다(틀이 초점·스크롤을 건드리지 않는다)
    expect(again.router.getSnapshot()).toMatchObject({
      overlay: null,
      url: "/units",
      via: "initial",
      version: 1,
    });
  });

  it("앞으로 가기로 겹침 칸에 오면 다시 뺀다(겹침은 누를 때만 연다). 화면은 그대로다", async () => {
    const { history, go, router, seen } = setup("/");
    await go({ route: "units" });
    router.openOverlay("sheet");
    router.closeOverlay();
    await settle();
    const screen = router.getSnapshot();
    seen.length = 0;
    history.press(1);
    await settle();
    expect(router.getSnapshot()).toMatchObject({ overlay: null, url: "/units", version: screen.version });
    expect(history.at).toBe(1);
    // 겹침은 한 번도 열린 것으로 내보내지 않았다
    expect(seen).toEqual(["/units", "/units"]);
  });

  it("겹침 칸 위에서 또 열지 않는다", async () => {
    const { history, router } = setup("/");
    router.openOverlay("drawer");
    router.openOverlay("sheet");
    expect(history.urls()).toEqual(["/", "/"]);
  });
});

describe("로그아웃·다른 계정, 기다리는 일", () => {
  it("resetToHome: 사슬 안 앱 홈 칸까지 돌아가 새 열쇠의 홈으로 바꾼다(기록에 홈은 한 칸, 뒤로 = 앱 닫힘)", async () => {
    const plain = setup("/");
    await plain.go({ route: "units" });
    await plain.go({ route: "admin" });
    const homeKey = plain.history.entries[0]?.state;
    plain.router.resetToHome();
    await settle();
    expect(plain.history.goCalls).toEqual([-1]);
    expect(plain.history.at).toBe(0);
    expect(plain.history.urls()[0]).toBe("/");
    expect(plain.entry()).toMatchObject({ index: 0, root: 0, home: 0, top: null });
    // 새 열쇠(앞 계정이 보던 스크롤을 되돌리지 않는다), 바꾸기로 온 홈
    expect(plain.entry().key).not.toBe(readEntryState(homeKey)?.key);
    expect(plain.router.getSnapshot()).toMatchObject({ url: "/", via: "replace", overlay: null });

    // 겹침 칸 위: 그 칸도 함께 빠진다
    const drawer = setup("/");
    await drawer.go({ route: "mail" });
    drawer.router.openOverlay("drawer");
    drawer.router.resetToHome();
    await settle();
    expect(drawer.history.goCalls).toEqual([-2]);
    expect(drawer.history.at).toBe(0);
    expect(drawer.router.getSnapshot()).toMatchObject({ url: "/", overlay: null });

    // 바로 연 주소(앱 홈 칸이 없음): 사슬의 첫 칸을 홈으로 바꾼다
    const direct = setup("/units");
    await direct.go({ route: "map" });
    direct.router.resetToHome();
    await settle();
    expect(direct.history.at).toBe(0);
    expect(direct.history.urls()[0]).toBe("/");
    expect(direct.entry()).toMatchObject({ index: 0, root: 0, home: 0 });

    // 이미 홈(그 주소 그대로)이면 아무것도 하지 않는다. 홈의 다른 주소(?template=)는 바꾼다
    const home = setup("/");
    home.router.resetToHome();
    await settle();
    expect(home.history.goCalls).toEqual([]);
    expect(home.router.getSnapshot().version).toBe(1);
    const template = setup("/?template=dt_city");
    template.router.resetToHome();
    expect(template.history.urls()).toEqual(["/"]);
  });

  it("history.go 뒤 popstate를 기다리는 동안 다른 이동은 무시한다. 너무 오래되면 버린다", async () => {
    const { history, router, advance } = setup("/");
    router.navigate({ route: "units" });
    router.navigate({ route: "dev" });
    router.navigate({ route: "dev_gpu_bench" });
    router.openOverlay("drawer");
    // 서랍에서 고름: 겹침 칸을 빼러 간다(기다리는 일이 생긴다)
    expect(router.navigate({ route: "economy" })).toBe(true);
    expect(router.navigate({ route: "mail" })).toBe(false);
    // 브라우저가 옮기지 않은 경우(popstate 없음) 1초 뒤에는 다시 받는다
    history.listeners.clear();
    advance(PENDING_TIMEOUT_MS + 1);
    expect(router.navigate({ route: "settings" })).toBe(true);
  });

  it("예상과 다른 칸에 오면 기다리던 일을 버리고 그 칸을 보인다", async () => {
    const { history, go, router } = setup("/");
    await go({ route: "dev" });
    await go({ route: "dev_gpu_bench" });
    // 브라우저가 라우터가 부른 -1이 아니라 -2로 옮겼다(그 사이 사람이 한 번 더 뒤로를 누른 경우 등)
    const realGo = history.go.bind(history);
    history.go = (delta: number) => realGo(delta - 1);
    router.navigate({ route: "units" });
    await settle();
    expect(history.at).toBe(0);
    expect(router.getSnapshot()).toMatchObject({ url: "/", via: "pop" });
    expect(history.urls()).toEqual(["/", "/dev", "/dev/gpu-bench"]);
  });
});
