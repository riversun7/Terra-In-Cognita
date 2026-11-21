// 화면 주소 표 시험 — 표 규칙(점 없음·소문자·앞머리), 만들기·맞추기, 경로 예, 여는 역할(ADR 2026-10-29-app-shell 1·13절)
import { describe, expect, expectTypeOf, it } from "vitest";
import { ROLES, type Role } from "./roles.ts";
import {
  type LoosePathOptions,
  type LooseRouteMatch,
  type PathParamNames,
  ROUTES,
  type RouteId,
  type RoutePathArgsIn,
  type RouteTable,
  type RouteTargetIn,
  buildPath,
  buildPathIn,
  canOpenRoute,
  isRouteId,
  isRouteParamValue,
  isRouteTarget,
  isRouteTargetIn,
  matchPath,
  matchPathIn,
  menuRoute,
  parentTarget,
  parentTargetIn,
  replaceSearch,
  routePathExamples,
  routePathExamplesIn,
  targetPath,
} from "./routes.ts";
import { SAVED_ID_PATTERN } from "./savedId.ts";

/** 서버·서비스 워커가 화면 경로로 보지 않는 앞머리(글자 앞부분만 본다) */
const RESERVED_PREFIXES = ["/api", "/ws", "/health"];
const STATIC_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PARAM_SEGMENT = /^:[a-z][a-zA-Z0-9]*$/;
const SEARCH_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** 표 규칙 위반 목록(ADR 37 1절 "경로 규칙"). 빈 목록이면 통과 */
function routeTableProblems(table: RouteTable): string[] {
  const problems: string[] = [];
  const shapes = new Map<string, string>();
  for (const [id, route] of Object.entries(table)) {
    if (!SAVED_ID_PATTERN.test(id)) problems.push(`${id}: 주소 ID 모양`);
    const { path } = route;
    if (path.includes(".")) problems.push(`${id}: 점`);
    if (!path.startsWith("/")) problems.push(`${id}: / 로 시작하지 않음`);
    if (RESERVED_PREFIXES.some((prefix) => path.startsWith(prefix))) problems.push(`${id}: 서버 앞머리`);
    if (path !== "/" && path.endsWith("/")) problems.push(`${id}: 끝의 /`);
    const segments = path === "/" ? [] : path.slice(1).split("/");
    const names: string[] = [];
    for (const segment of segments) {
      if (PARAM_SEGMENT.test(segment)) names.push(segment.slice(1));
      else if (!STATIC_SEGMENT.test(segment)) problems.push(`${id}: 조각 "${segment}"`);
    }
    if (new Set(names).size !== names.length) problems.push(`${id}: 매개변수 이름 겹침`);
    for (const name of Object.keys(route.params ?? {})) {
      if (!names.includes(name)) problems.push(`${id}: 경로에 없는 매개변수 ${name}`);
    }
    for (const name of route.search) {
      if (!SEARCH_NAME.test(name)) problems.push(`${id}: 검색어 "${name}"`);
    }
    if (new Set(route.search).size !== route.search.length) problems.push(`${id}: 검색어 겹침`);
    // 매개변수 이름만 다른 두 경로는 같은 주소다
    const shape = segments.map((segment) => (segment.startsWith(":") ? ":" : segment)).join("/");
    const other = shapes.get(shape);
    if (other) problems.push(`${id}: ${other}와 같은 경로`);
    shapes.set(shape, id);
    // 부모 경로의 매개변수는 모두 이 경로에 같은 이름·같은 값 규칙으로 있다(parentTarget이 이 주소의 값으로 부모 주소를 만든다)
    const parentRoute =
      route.parent !== null && Object.hasOwn(table, route.parent) ? table[route.parent] : undefined;
    for (const segment of parentRoute?.path.split("/") ?? []) {
      if (!segment.startsWith(":") || parentRoute === undefined) continue;
      const name = segment.slice(1);
      if (!names.includes(name))
        problems.push(`${id}: 부모 ${route.parent}의 매개변수 ${name}가 경로에 없음`);
      else if ((parentRoute.params?.[name] ?? "id") !== (route.params?.[name] ?? "id")) {
        problems.push(`${id}: 부모 ${route.parent}의 매개변수 ${name}와 값 규칙이 다름`);
      }
    }
    // 부모: 홈(/)만 없다. 따라가면 홈에 닿는다(돌지 않는다)
    if (route.parent === null) {
      if (path !== "/") problems.push(`${id}: 부모 없음`);
      continue;
    }
    let parent: string | null = route.parent;
    for (let step = 0; parent !== null; step++) {
      const next: RouteTable[string] | undefined = Object.hasOwn(table, parent) ? table[parent] : undefined;
      if (!next || step > Object.keys(table).length) {
        problems.push(`${id}: 부모 ${route.parent}에서 홈에 닿지 않음`);
        break;
      }
      parent = next.parent;
    }
  }
  return problems;
}

/** 타입 검사(pnpm typecheck)만 하는 함수 — 실행하지 않는다. @ts-expect-error 줄에 타입 오류가 없으면 타입 검사가 실패한다 */
function buildPathTypeErrors(maybe: string | undefined): void {
  // 지금 주소에서 읽은 값처럼 없을 수 있는 값은 그대로 넘긴다(undefined는 넣지 않는다)
  buildPath("inbox", { search: { item: maybe } });
  // @ts-expect-error 없는 주소 ID
  buildPath("nope");
  // @ts-expect-error 검색어를 받지 않는 주소
  buildPath("units", { search: { item: "x" } });
  // @ts-expect-error 검색어를 받지 않는 주소(undefined 값도)
  buildPath("units", { search: { item: maybe } });
  // @ts-expect-error inbox가 받지 않는 검색어
  buildPath("inbox", { search: { tab: "x" } });
  // @ts-expect-error 매개변수가 없는 주소에 매개변수
  buildPath("units", { params: { unitId: "u1" } });
}

/** 시험용 표의 buildPath. 타입은 buildPath와 같은 모양(RoutePathArgsIn)이라 매개변수 주소의 타입 검사를 여기서 본다 */
function buildFixturePath<Id extends keyof typeof FIXTURE>(
  id: Id,
  ...args: RoutePathArgsIn<typeof FIXTURE, Id>
): string;
function buildFixturePath(id: string, options?: LoosePathOptions): string {
  return buildPathIn(FIXTURE, id, options);
}

/** 타입 검사만 하는 함수(실행하지 않는다): 매개변수 주소의 params·검색어와 가리키는 화면(target) */
function fixtureTypeErrors(): RouteTargetIn<typeof FIXTURE>[] {
  // @ts-expect-error 매개변수 주소에 params가 없다
  buildFixturePath("market_city");
  // @ts-expect-error cityId가 빠졌다
  buildFixturePath("market_city", { params: { itemId: "iron_ore" } });
  // @ts-expect-error 경로에 없는 매개변수
  buildFixturePath("market_city", { params: { itemId: "iron_ore", cityId: "c1", tab: "x" } });
  // @ts-expect-error 매개변수 이름 오타
  buildFixturePath("map_key", { params: { mapkey: "12" } });
  // @ts-expect-error 받지 않는 검색어(이름 오타)
  buildFixturePath("market", { search: { bnad: "b2" } });
  // @ts-expect-error 매개변수가 없는 주소에 params
  buildFixturePath("market", { params: { itemId: "iron_ore" } });
  // @ts-expect-error 매개변수 주소를 가리키는데 params가 없다
  const missing: RouteTargetIn<typeof FIXTURE> = { route: "market_city" };
  // @ts-expect-error 가리키는 화면의 params에 cityId가 빠졌다
  const partial: RouteTargetIn<typeof FIXTURE> = { route: "market_city", params: { itemId: "a" } };
  const full: RouteTargetIn<typeof FIXTURE> = { route: "market_city", params: { itemId: "a", cityId: "b" } };
  return [missing, partial, full, { route: "market", search: { band: undefined } }];
}

/** 시험용 표: 매개변수 주소와 정적 주소가 겹친다(ADR 37 1절 예약 주소 모양과 매개변수 값 규칙 digits) */
const FIXTURE = {
  home: { path: "/", search: [], parent: null, frame: "shown", access: "everyone" },
  // 매개변수 줄을 정적 줄보다 먼저 둔다: 표 순서와 상관없이 정적 조각이 이겨야 한다
  map_key: {
    path: "/map/:mapKey",
    search: [],
    parent: "home",
    frame: "hidden",
    access: "everyone",
    params: { mapKey: "digits" },
  },
  map_planet: { path: "/map/planet", search: [], parent: "home", frame: "hidden", access: "everyone" },
  economy_section: {
    path: "/economy/:section",
    search: [],
    parent: "home",
    frame: "shown",
    access: "everyone",
  },
  market: { path: "/economy/market", search: ["band"], parent: "home", frame: "shown", access: "everyone" },
  market_item: {
    path: "/economy/market/:itemId",
    search: [],
    parent: "market",
    frame: "shown",
    access: "everyone",
  },
  // 부모(market_item)에 매개변수가 있다: 부모 주소는 이 주소의 itemId로 만든다
  market_city: {
    path: "/economy/market/:itemId/:cityId",
    search: [],
    parent: "market_item",
    frame: "shown",
    access: "everyone",
  },
  left_param: { path: "/x/:a/c", search: [], parent: "home", frame: "shown", access: "everyone" },
  right_param: { path: "/x/b/:z", search: [], parent: "home", frame: "shown", access: "everyone" },
} as const satisfies RouteTable;

describe("주소 표", () => {
  it("ADR 37 1절 표 + 개발자 영역 3줄(ADR 38 1절)과 같다", () => {
    const rows = Object.fromEntries(
      Object.entries(ROUTES).map(([id, r]) => [id, [r.path, r.parent, r.frame, r.access, r.search]]),
    );
    expect(rows).toEqual({
      home: ["/", null, "shown", "everyone", ["template"]],
      // 첫 접속(docs/adr/2026-11-01-first-login-cyborg.md 1절)
      start: ["/start", "home", "hidden", "everyone", []],
      map: [
        "/map",
        "home",
        "hidden",
        "everyone",
        // ?key= 2차맵 키(docs/adr/2026-11-07-play-flow.md "WP2 지도 흐름"), ?at= 1차맵에서 고른 배치 칸(WP7)
        ["key", "at", "pixel-ratio", "second-map-time", "second-map-sky", "second-map-neighbours"],
      ],
      map_planet: [
        "/map/planet",
        "home",
        "hidden",
        "everyone",
        [
          "key",
          "stage",
          "planet-debug",
          "pixel-ratio",
          "planet-time",
          "planet-sky",
          "planet-sky-skip",
          "planet-sky-bench",
          "planet-view",
        ],
      ],
      units: ["/units", "home", "shown", "everyone", []],
      economy: ["/economy", "home", "shown", "everyone", []],
      // 인벤토리(docs/adr/2026-11-14-inventory-screen.md) — /economy/warehouse는 옛 주소(인벤토리 [창고별]로 바꿔 연다)
      inventory: ["/inventory", "home", "shown", "everyone", ["tab", "unit"]],
      economy_warehouse: ["/economy/warehouse", "economy", "shown", "everyone", []],
      economy_production: ["/economy/production", "economy", "shown", "everyone", []],
      economy_market: ["/economy/market", "economy", "shown", "everyone", []],
      economy_market_item: ["/economy/market/:itemId", "economy_market", "shown", "everyone", []],
      economy_market_city: [
        "/economy/market/:itemId/:cityId",
        "economy_market_item",
        "shown",
        "everyone",
        [],
      ],
      economy_orders: ["/economy/orders", "economy", "shown", "everyone", []],
      // 건물 재무 화면(docs/adr/2026-11-15-building-screen.md)
      building_books: ["/buildings/:buildingId/books", "map", "shown", "everyone", []],
      economy_exchange: ["/economy/exchange", "economy", "shown", "everyone", []],
      faction: ["/faction", "home", "shown", "everyone", []],
      cyborg: ["/cyborg", "home", "shown", "everyone", []],
      // 랭킹 판(docs/adr/2026-11-07-ranking.md, D-6010 사이보그·세력 화면 안)
      cyborg_ranking: ["/cyborg/ranking", "cyborg", "shown", "everyone", ["path"]],
      faction_ranking: ["/faction/ranking", "faction", "shown", "everyone", ["house"]],
      faction_identity: ["/faction/identity", "faction", "shown", "everyone", []],
      inbox: ["/inbox", "home", "shown", "everyone", ["item"]],
      mail: ["/mail", "home", "shown", "everyone", []],
      settings: ["/settings", "home", "shown", "everyone", []],
      admin: ["/admin", "home", "shown", "admin", []],
      // 운영자 콘솔(docs/adr/2026-11-08-operator-console.md)
      ops: ["/ops", "home", "shown", "ops", ["tab", "user", "faction", "unit"]],
      dev_ops_grants: ["/dev/ops-grants", "dev", "shown", "dev", []],
      dev: ["/dev", "home", "shown", "dev_admin", []],
      dev_planet_editor: ["/dev/planet-editor", "dev", "hidden", "dev_admin", []],
      dev_star_system: ["/dev/star-system", "dev", "hidden", "dev_admin", []],
      dev_second_map: ["/dev/second-map", "dev", "hidden", "dev_admin", []],
      dev_tuning: ["/dev/tuning", "dev", "shown", "dev_admin", []],
      // 밸런스 화면(docs/adr/2026-11-01-balance-screen.md 7절)
      dev_balance: ["/dev/balance", "dev", "shown", "dev_admin", []],
      // 2차 스탯 전용 편집·시뮬레이터 화면
      dev_secondary_stats: ["/dev/secondary-stats", "dev", "shown", "dev_admin", ["target"]],
      // 유닛 공통 경험치 테이블 편집·시각화 화면
      dev_exp_table: ["/dev/exp-table", "dev", "shown", "dev_admin", []],
      // 스킬 편집기·행동별 소모(docs/adr/2026-11-01-skill-editor.md 5절)
      dev_skills: ["/dev/skills", "dev", "shown", "dev_admin", ["skill"]],
      // 아이템 편집기(docs/adr/2026-11-01-item-editor.md)
      dev_items: ["/dev/items", "dev", "shown", "dev_admin", ["item"]],
      // 효과 사전(docs/adr/2026-11-01-item-editor.md "바뀜 (2026-11-09)")
      dev_effects: ["/dev/effects", "dev", "shown", "dev_admin", ["effect", "create"]],
      dev_buildings: ["/dev/buildings", "dev", "shown", "dev_admin", ["facility"]],
      // 생산 편집기(docs/adr/2026-11-11-production-six.md). 옛 1차 생산 티어 확률 주소는 그 화면의 확률 분포 탭으로 열린다
      dev_production: ["/dev/production", "dev", "shown", "dev_admin", ["tab"]],
      dev_gather_tiers: ["/dev/gather-tiers", "dev_production", "shown", "dev_admin", []],
      dev_creatures: ["/dev/creatures", "dev", "shown", "dev_admin", ["creature"]],
      // 시작 국가 설정(docs/adr/2026-11-10-nation-editor.md)
      dev_nations: ["/dev/nations", "dev", "shown", "dev_admin", ["nation"]],
      // 영토 층(docs/adr/2026-11-03-territory-layer.md 5절)
      dev_territory: ["/dev/territory", "dev", "shown", "dev_admin", []],
      // 세계 배치(D-528)
      dev_world_layout: ["/dev/world-layout", "dev", "shown", "dev_admin", []],
      // 구인 카드 시험(D-469)
      dev_recruit: ["/dev/recruit", "dev", "shown", "dev_admin", ["city"]],
      // 2차맵·지형 오브젝트 통합 화면(D-536)
      dev_terrain_objects: ["/dev/terrain-objects", "dev", "hidden", "dev_admin", []],
      // 채집 오브젝트 편집기(D-552)
      dev_gather_objects: ["/dev/gather-objects", "dev", "shown", "dev_admin", []],
      // 전투 다시보기(docs/adr/2026-11-01-battle-replay.md 7절)
      dev_battle_replay: ["/dev/battle-replay", "dev", "hidden", "dev_admin", []],
      dev_gpu_bench: ["/dev/gpu-bench", "dev", "shown", "dev_admin", []],
    });
  });

  it("경로 규칙을 지킨다: 소문자, 점 없음, 서버 앞머리 없음, 겹침 없음, 부모가 홈에 닿음", () => {
    expect(routeTableProblems(ROUTES)).toEqual([]);
    expect(routeTableProblems(FIXTURE)).toEqual([]);
  });

  it("규칙 검사가 틀린 줄을 잡는다", () => {
    const bad = {
      home: { path: "/", search: [], parent: null, frame: "shown", access: "everyone" },
      dot: { path: "/units.json", search: [], parent: "home", frame: "shown", access: "everyone" },
      upper: { path: "/Units", search: [], parent: "home", frame: "shown", access: "everyone" },
      apiary: { path: "/apiary", search: [], parent: "home", frame: "shown", access: "everyone" },
      healthy: { path: "/healthy", search: [], parent: "home", frame: "shown", access: "everyone" },
      wsx: { path: "/wsx", search: [], parent: "home", frame: "shown", access: "everyone" },
      slash: { path: "/mail/", search: [], parent: "home", frame: "shown", access: "everyone" },
      same_a: { path: "/a/:x", search: [], parent: "home", frame: "shown", access: "everyone" },
      same_b: { path: "/a/:y", search: ["Tab"], parent: "nowhere", frame: "shown", access: "everyone" },
      Bad: { path: "/b", search: [], parent: "home", frame: "shown", access: "everyone" },
      p_parent: { path: "/p/:pid", search: [], parent: "home", frame: "shown", access: "everyone" },
      p_lost: { path: "/q/:qid", search: [], parent: "p_parent", frame: "shown", access: "everyone" },
      p_kind: {
        path: "/p/:pid/k",
        search: [],
        parent: "p_parent",
        frame: "shown",
        access: "everyone",
        params: { pid: "digits" },
      },
    } as const satisfies RouteTable;
    expect(routeTableProblems(bad)).toEqual([
      "dot: 점",
      'dot: 조각 "units.json"',
      'upper: 조각 "Units"',
      "apiary: 서버 앞머리",
      "healthy: 서버 앞머리",
      "wsx: 서버 앞머리",
      "slash: 끝의 /",
      'slash: 조각 ""',
      'same_b: 검색어 "Tab"',
      "same_b: same_a와 같은 경로",
      "same_b: 부모 nowhere에서 홈에 닿지 않음",
      "Bad: 주소 ID 모양",
      "p_lost: 부모 p_parent의 매개변수 pid가 경로에 없음",
      "p_kind: 부모 p_parent의 매개변수 pid와 값 규칙이 다름",
    ]);
  });

  it("isRouteId는 표의 주소 ID만 받는다", () => {
    expect(isRouteId("dev_gpu_bench")).toBe(true);
    expect(isRouteId("toString")).toBe(false);
    expect(isRouteId("Home")).toBe(false);
    expect(isRouteId(undefined)).toBe(false);
  });
});

describe("buildPath", () => {
  it("검색어는 표 순서로, 값은 % 글자로 바꿔 넣고 undefined는 뺀다", () => {
    expect(buildPath("home")).toBe("/");
    expect(buildPath("dev_planet_editor")).toBe("/dev/planet-editor");
    expect(buildPath("inbox", { search: { item: "unit_idle:city_12" } })).toBe(
      "/inbox?item=unit_idle%3Acity_12",
    );
    expect(buildPath("map_planet", { search: { "planet-debug": "cracks" } })).toBe(
      "/map/planet?planet-debug=cracks",
    );
    // 1차맵 하늘 시험 주소: 표 순서로, 시각의 ":"·"+"는 % 글자로
    expect(
      buildPath("map_planet", {
        search: { "planet-sky-skip": "moon,clouds", "planet-time": "2026-10-01T06:00:00+09:00" },
      }),
    ).toBe("/map/planet?planet-time=2026-10-01T06%3A00%3A00%2B09%3A00&planet-sky-skip=moon%2Cclouds");
    expect(buildPath("home", { search: {} })).toBe("/");
    expect(buildPath("inbox", { search: { item: undefined } })).toBe("/inbox");
    expect(buildPathIn(FIXTURE, "market", { search: { band: "a b&c" } })).toBe(
      "/economy/market?band=a%20b%26c",
    );
  });

  it("매개변수 값은 숫자·영문 소문자·_만. 점·대문자·/·빈 값·너무 긴 값·숫자 규칙 위반은 예외", () => {
    expect(buildPathIn(FIXTURE, "market_city", { params: { itemId: "iron_ore", cityId: "city_12" } })).toBe(
      "/economy/market/iron_ore/city_12",
    );
    expect(buildPathIn(FIXTURE, "map_key", { params: { mapKey: "40213" } })).toBe("/map/40213");
    for (const itemId of ["iron.ore", "Iron", "a/b", "", "a".repeat(65), "a-b", "a%2Eb"]) {
      expect(() => buildPathIn(FIXTURE, "market_city", { params: { itemId, cityId: "c1" } }), itemId).toThrow(
        RangeError,
      );
    }
    expect(() => buildPathIn(FIXTURE, "market_city", { params: { itemId: "x" } })).toThrow(RangeError);
    expect(() => buildPathIn(FIXTURE, "map_key", { params: { mapKey: "planet" } })).toThrow(RangeError);
    expect(() => buildPathIn(FIXTURE, "nope")).toThrow("unknown route id");
  });

  it("digits 값은 0으로 시작하지 않는 10진수이고 안전 정수 이하다(한 값에 주소 하나, 셀 키 16자리까지)", () => {
    // 셀 키(packages/planet)의 가장 큰 값 = 6 × 2^49 − 10. 16자리다
    for (const value of ["0", "7", "40213", "3377699720527862", String(Number.MAX_SAFE_INTEGER)]) {
      expect(isRouteParamValue("digits", value), value).toBe(true);
    }
    for (const value of [
      "007",
      "00",
      "-1",
      "1e3",
      "9007199254740992",
      "9999999999999999",
      "1".repeat(17),
      "",
    ]) {
      expect(isRouteParamValue("digits", value), value).toBe(false);
    }
    expect(matchPathIn(FIXTURE, "/map/007")).toBeNull();
    expect(matchPathIn(FIXTURE, "/map/7")?.params).toEqual({ mapKey: "7" });
    expect(isRouteParamValue("id", "007")).toBe(true);
  });

  it("틀린 주소 ID·검색어·매개변수는 타입 검사가 잡는다(pnpm typecheck)", () => {
    expect(buildPathTypeErrors).toBeTypeOf("function");
    expect(fixtureTypeErrors).toBeTypeOf("function");
    expectTypeOf<PathParamNames<"/economy/market/:itemId/:cityId">>().toEqualTypeOf<"itemId" | "cityId">();
    expectTypeOf<PathParamNames<"/units">>().toEqualTypeOf<never>();
    // 시험용 표의 만들기(타입은 buildPath와 같은 모양)
    expect(buildFixturePath("market_city", { params: { itemId: "iron_ore", cityId: "c1" } })).toBe(
      "/economy/market/iron_ore/c1",
    );
    expect(buildFixturePath("market", { search: { band: "b2" } })).toBe("/economy/market?band=b2");
  });
});

describe("matchPath", () => {
  it("모든 경로 예가 제 주소로 돌아온다", () => {
    for (const [id] of Object.entries(ROUTES)) {
      const examples = routePathExamples().filter((path) => matchPath(path)?.id === id);
      expect(examples.length, id).toBeGreaterThan(0);
    }
    for (const path of routePathExamples()) expect(matchPath(path), path).not.toBeNull();
  });

  it("검색어: 표에 있는 것만, 같은 이름은 처음 것, +는 빈칸, 잘못된 %는 그 검색어만 버린다", () => {
    expect(matchPath("/inbox?item=unit_idle%3Acity_12&tab=x")).toEqual({
      id: "inbox",
      params: {},
      search: { item: "unit_idle:city_12" },
    });
    expect(matchPath("/inbox?item=a+b&item=c")?.search).toEqual({ item: "a b" });
    expect(matchPath("/inbox?item=%E0%A4%A")?.search).toEqual({});
    expect(matchPath("/inbox?item")?.search).toEqual({ item: "" });
    // 받지 않는 주소의 검색어는 무시한다(주소에서 지우지는 않는다 — matchPath는 주소를 고치지 않는다)
    expect(matchPath("/units?item=x")).toEqual({ id: "units", params: {}, search: {} });
  });

  it("경로는 글자 그대로 비교하고 끝의 / 하나와 #조각은 무시한다", () => {
    expect(matchPath("/units/")?.id).toBe("units");
    expect(matchPath("/units#top")?.id).toBe("units");
    expect(matchPath("/units?x=1#h")?.id).toBe("units");
    expect(matchPath("/")?.id).toBe("home");
    expect(matchPath("/?template=dt_city")?.search).toEqual({ template: "dt_city" });
    for (const path of [
      "/Units",
      "/units//",
      "/unit",
      "/units/x",
      "/%75nits",
      "units",
      "",
      "/dev/planet_editor",
    ]) {
      expect(matchPath(path), path).toBeNull();
    }
  });

  it("정적 조각이 매개변수 조각보다 먼저다(표 순서와 상관없이, 왼쪽 조각부터)", () => {
    expect(matchPathIn(FIXTURE, "/map/planet")?.id).toBe("map_planet");
    expect(matchPathIn(FIXTURE, "/map/40213")).toEqual({
      id: "map_key",
      params: { mapKey: "40213" },
      search: {},
    });
    // mapKey는 숫자만
    expect(matchPathIn(FIXTURE, "/map/abc")).toBeNull();
    expect(matchPathIn(FIXTURE, "/economy/market?band=b2")).toEqual({
      id: "market",
      params: {},
      search: { band: "b2" },
    });
    expect(matchPathIn(FIXTURE, "/economy/orders")?.id).toBe("economy_section");
    expect(matchPathIn(FIXTURE, "/economy/market/iron_ore/city_12")?.params).toEqual({
      itemId: "iron_ore",
      cityId: "city_12",
    });
    expect(matchPathIn(FIXTURE, "/x/b/c")?.id).toBe("right_param");
    expect(matchPathIn(FIXTURE, "/x/q/c")?.id).toBe("left_param");
    // 매개변수 값에 점·대문자가 있으면 맞지 않는다
    expect(matchPathIn(FIXTURE, "/economy/market/iron.ore/c1")).toBeNull();
    expect(matchPathIn(FIXTURE, "/economy/Orders")).toBeNull();
  });

  it("주소 ID로 좁히면 검색어 타입이 따라온다", () => {
    const match = matchPath("/inbox?item=a%3Ab");
    if (match?.id === "inbox") expectTypeOf(match.search.item).toEqualTypeOf<string | undefined>();
    expect(match?.id).toBe("inbox");
    expectTypeOf<NonNullable<ReturnType<typeof matchPath>>["id"]>().toEqualTypeOf<RouteId>();
  });
});

describe("검색어 제자리 바꾸기(replaceSearch)", () => {
  it("바꾼 검색어만 고치고 경로·#조각·다른 검색어(모르는 것도)는 글자 그대로 둔다", () => {
    expect(replaceSearch("/map?at=1&foo=bar#h", { at: "2" })).toBe("/map?at=2&foo=bar#h");
    expect(replaceSearch("/map?foo=bar", { at: "x y:z" })).toBe("/map?foo=bar&at=x%20y%3Az");
    expect(replaceSearch("/map", { at: "1" })).toBe("/map?at=1");
    // 모르는 검색어의 + 글자·잘못된 % 글자도 그대로다
    expect(replaceSearch("/map?q=a+b&bad=%E0%A4%A&at=1", { at: "2" })).toBe("/map?q=a+b&bad=%E0%A4%A&at=2");
    expect(replaceSearch("/units/?x=1", { y: "2" })).toBe("/units/?x=1&y=2");
    expect(replaceSearch("/map?at=1", {})).toBe("/map?at=1");
  });

  it("같은 이름은 첫 자리에 하나만 남고, null·undefined는 지우고, 빈 검색어는 ?도 뺀다", () => {
    expect(replaceSearch("/inbox?item=a&x=1&item=b", { item: "c" })).toBe("/inbox?item=c&x=1");
    expect(replaceSearch("/map?at=1&foo=bar&at=2", { at: null })).toBe("/map?foo=bar");
    expect(replaceSearch("/units?item=x#top", { item: undefined })).toBe("/units#top");
    expect(replaceSearch("/map?&&at=1&", {})).toBe("/map?at=1");
    // 이름은 % 글자를 푼 뒤 비교한다(matchPath와 같다)
    expect(replaceSearch("/map?%61t=1", { at: "2" })).toBe("/map?at=2");
  });

  it("바꾼 주소를 다시 맞추면 새 값을 읽고, 표에 없는 검색어는 남아 있다", () => {
    const url = replaceSearch("/inbox?item=a&future=1", { item: "unit_idle:city_12" });
    expect(url).toBe("/inbox?item=unit_idle%3Acity_12&future=1");
    expect(matchPath(url)?.search).toEqual({ item: "unit_idle:city_12" });
  });
});

/** 시험용: 맞는 주소만 쓴다 */
function mustMatch(table: RouteTable, url: string): LooseRouteMatch {
  const match = matchPathIn(table, url);
  if (match === null) throw new Error(`no route: ${url}`);
  return match;
}

describe("부모 화면(parentTarget)", () => {
  it("부모 경로의 매개변수는 자식 주소의 같은 이름 값을 쓰고, 검색어는 넘기지 않는다", () => {
    const city = mustMatch(FIXTURE, "/economy/market/iron_ore/city_12?x=1");
    const item = parentTargetIn(FIXTURE, city);
    expect(item).toEqual({ route: "market_item", params: { itemId: "iron_ore" } });
    expect(item && buildPathIn(FIXTURE, item.route, item)).toBe("/economy/market/iron_ore");
    expect(parentTargetIn(FIXTURE, mustMatch(FIXTURE, "/economy/market/iron_ore"))).toEqual({
      route: "market",
    });
    expect(parentTargetIn(FIXTURE, mustMatch(FIXTURE, "/economy/market?band=b2"))).toEqual({ route: "home" });
    expect(parentTargetIn(FIXTURE, mustMatch(FIXTURE, "/"))).toBeNull();
  });

  it("값이 없거나 규칙에 맞지 않으면·모르는 주소 ID면 예외다(표가 틀렸다)", () => {
    expect(() => parentTargetIn(FIXTURE, { id: "market_city", params: { cityId: "c1" } })).toThrow(
      RangeError,
    );
    expect(() => parentTargetIn(FIXTURE, { id: "market_city", params: { itemId: "a.b" } })).toThrow(
      RangeError,
    );
    expect(() => parentTargetIn(FIXTURE, { id: "nope", params: {} })).toThrow("unknown route id");
  });

  it("주소 표의 모든 줄: 부모는 표의 부모 칸이고, 홈만 null이다", () => {
    for (const path of routePathExamples()) {
      const match = matchPath(path);
      if (match === null) throw new Error(path);
      const target = parentTarget(match);
      expect(target?.route ?? null, path).toBe(ROUTES[match.id].parent);
      if (target !== null) expect(isRouteTarget(target), path).toBe(true);
    }
    const editor = matchPath("/dev/planet-editor");
    expect(editor && parentTarget(editor)).toEqual({ route: "dev" });
  });
});

describe("경로 예", () => {
  it("주소마다 하나, 검색어를 받는 주소는 검색어를 붙인 것 하나 더(점·쌍점이 든 값)", () => {
    const examples = routePathExamples();
    const withSearch = Object.values(ROUTES).filter((route) => route.search.length > 0).length;
    expect(examples).toHaveLength(Object.keys(ROUTES).length + withSearch);
    expect(examples).toContain("/inbox?item=x.1%3Ay_2");
    for (const path of examples) {
      const pathname = path.split("?", 1)[0] ?? "";
      expect(pathname, path).not.toContain(".");
      expect(
        RESERVED_PREFIXES.some((prefix) => pathname.startsWith(prefix)),
        path,
      ).toBe(false);
    }
  });

  it("매개변수 주소는 규칙에 맞는 값을 넣는다", () => {
    expect(routePathExamplesIn(FIXTURE)).toEqual([
      "/",
      "/map/12",
      "/map/planet",
      "/economy/sample_1",
      "/economy/market",
      "/economy/market?band=x.1%3Ay_2",
      "/economy/market/sample_1",
      "/economy/market/sample_1/sample_1",
      "/x/sample_1/c",
      "/x/b/sample_1",
    ]);
    for (const path of routePathExamplesIn(FIXTURE)) expect(matchPathIn(FIXTURE, path), path).not.toBeNull();
  });
});

describe("여는 역할", () => {
  const OPENS: Record<"everyone" | "dev_admin" | "dev" | "admin" | "ops", Record<Role, boolean>> = {
    everyone: { player: true, gm: true, dev: true, admin: true },
    dev_admin: { player: false, gm: false, dev: true, admin: true },
    dev: { player: false, gm: false, dev: true, admin: false },
    admin: { player: false, gm: false, dev: false, admin: true },
    ops: { player: false, gm: true, dev: true, admin: true },
  };

  it("누구나 / dev·admin / dev만 / admin만 / 운영자 콘솔(gm·dev·admin)", () => {
    for (const [id, route] of Object.entries(ROUTES)) {
      if (!isRouteId(id)) throw new Error(id);
      for (const role of ROLES)
        expect(canOpenRoute(id, [role]), `${id} ${role}`).toBe(OPENS[route.access][role]);
    }
    expect(canOpenRoute("dev", ["player", "dev"])).toBe(true);
    expect(canOpenRoute("admin", ["dev", "gm"])).toBe(false);
    expect(canOpenRoute("home", [])).toBe(true);
    expect(canOpenRoute("dev_planet_editor", [])).toBe(false);
    expect(canOpenRoute("dev_star_system", ["player"])).toBe(false);
    expect(canOpenRoute("dev_second_map", ["player"])).toBe(false);
    expect(canOpenRoute("dev_second_map", ["dev"])).toBe(true);
    expect(canOpenRoute("dev_tuning", ["player"])).toBe(false);
    expect(canOpenRoute("dev_tuning", ["admin"])).toBe(true);
  });
});

describe("가리키는 화면(target)", () => {
  it("아는 주소·맞는 매개변수만 받고, 모르는 검색어·매개변수 칸은 무시한다", () => {
    expect(isRouteTarget({ route: "inbox", search: { item: "unit_idle:city_12" } })).toBe(true);
    expect(isRouteTarget({ route: "inbox", search: { item: undefined } })).toBe(true);
    expect(isRouteTarget({ route: "units" })).toBe(true);
    // 더 새 서버가 넣은 칸: 받되 targetPath가 넣지 않는다
    expect(isRouteTarget({ route: "units", search: { focus: "x" } })).toBe(true);
    expect(isRouteTarget({ route: "units", params: { unitId: "u1" } })).toBe(true);
    expect(isRouteTarget({ route: "inbox", search: { item: 3 } })).toBe(false);
    expect(isRouteTarget({ route: "inbox", search: "item=x" })).toBe(false);
    expect(isRouteTarget({ route: "battle" })).toBe(false);
    expect(isRouteTarget({ route: "toString" })).toBe(false);
    expect(isRouteTarget("/units")).toBe(false);
    expect(isRouteTarget(null)).toBe(false);
    expect(isRouteTargetIn(FIXTURE, { route: "market_city", params: { itemId: "a", cityId: "b" } })).toBe(
      true,
    );
    expect(isRouteTargetIn(FIXTURE, { route: "market_city", params: { itemId: "a" } })).toBe(false);
    expect(isRouteTargetIn(FIXTURE, { route: "market_city", params: { itemId: "a.b", cityId: "c" } })).toBe(
      false,
    );
    expect(isRouteTargetIn(FIXTURE, { route: "market_city" })).toBe(false);
  });

  it("자기 칸만 읽고, 값·params·search는 배열이 아닌 객체여야 한다", () => {
    expect(isRouteTarget(Object.create({ route: "units" }))).toBe(false);
    expect(isRouteTarget(["units"])).toBe(false);
    expect(isRouteTarget({ route: "inbox", search: ["x"] })).toBe(false);
    expect(isRouteTarget({ route: "units", params: "x" })).toBe(false);
    expect(isRouteTarget({ route: "units", params: null })).toBe(false);
    expect(isRouteTarget({ route: "units", params: [] })).toBe(false);
    const params = Object.create({ itemId: "a", cityId: "b" });
    expect(isRouteTargetIn(FIXTURE, { route: "market_city", params })).toBe(false);
    expect(() => buildPathIn(FIXTURE, "market_city", { params })).toThrow(RangeError);
    // 원형에만 있는 검색어는 없는 것이다(읽기·만들기 모두)
    const search = Object.create({ item: 3 });
    expect(isRouteTarget({ route: "inbox", search })).toBe(true);
    expect(buildPathIn(ROUTES, "inbox", { search })).toBe("/inbox");
  });

  it("targetPath는 buildPath와 같은 주소를 만들고, 표에 없는 칸은 넣지 않는다", () => {
    const target = { route: "inbox", search: { item: "craft_done:4012" } } as const;
    expect(isRouteTarget(target)).toBe(true);
    expect(targetPath(target)).toBe(buildPath("inbox", { search: { item: "craft_done:4012" } }));
    expect(matchPath(targetPath(target))?.search).toEqual({ item: "craft_done:4012" });
    const newer: unknown = { route: "units", params: { unitId: "u1" }, search: { focus: "x" } };
    if (!isRouteTarget(newer)) throw new Error("newer target");
    expect(targetPath(newer)).toBe("/units");
  });
});

describe("menuRoute", () => {
  it("하위 화면은 부모를 따라 올라가 메뉴 항목(부모가 홈인 주소)이 된다", () => {
    expect(menuRoute("home")).toBe("home");
    expect(menuRoute("economy")).toBe("economy");
    expect(menuRoute("economy_market")).toBe("economy");
    expect(menuRoute("economy_market_city")).toBe("economy");
    expect(menuRoute("map_planet")).toBe("map_planet");
    expect(menuRoute("dev_planet_editor")).toBe("dev");
  });
});
