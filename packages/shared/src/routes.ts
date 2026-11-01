// 화면 주소 표 — 첫 단계 화면마다 주소를 준다(ADR 2026-10-29-app-shell 1절, 개발자 영역 3줄은 ADR 2026-10-29-planet-editor-stage1 1절).
// 표는 여기 하나다. 게임 앱 라우터, 서버 화면 경로 판정 시험(apps/server/src/spaFallback.test.ts),
// 서비스 워커 검사(scripts/pwa-build.mjs가 이 파일을 Node로 바로 읽는다)가 같이 쓴다. 나중의 푸시도 이 표로 열 주소를 만든다.
// 그래서 지울 수 있는 TS 문법만 쓰고(tsconfig erasableSyntaxOnly), 맨 위에서 부르는 코드를 두지 않는다("sideEffects": false).
//
// 경로 규칙(routes.test.ts가 표 전체를 본다)
// - 조각은 영어 소문자·숫자·`-`다. 점(.)을 쓰지 않는다. 서버는 점 있는 경로를 파일로 보고 404를 준다.
// - 매개변수(`:이름`) 값에도 점을 넣지 않는다. 값 규칙은 RouteParamKind다(id = 숫자·영문 소문자·`_`, digits = 10진수).
// - `/api`·`/ws`·`/health`로 시작하지 않는다. 서버는 글자 앞부분만 본다(`/apiary`도 화면이 아니다).
// - 경로에 언어를 넣지 않는다. 화면 제목은 메시지 키다.
// - 모르는 검색어는 무시하되 주소에서 지우지 않는다. matchPath는 주소를 고치지 않는다.
// 경로를 지우거나 바꾸면 옛 경로를 새 경로로 넘긴다(docs/PROTECTED.md). 즐겨찾기와 나중의 푸시가 옛 주소를 가리킨다.
import type { Role } from "./roles.ts";

/** 틀(위 띠·하단 탭·사이드 메뉴)을 그리는지. 화면 전체를 덮는 화면(지도·행성 편집기)은 hidden */
export type RouteFrame = "shown" | "hidden";

/** 누가 여는지. 화면에서 가리는 것은 편의이고, 서버가 요청마다 권한을 본다 */
export type RouteAccess = "everyone" | "dev_admin" | "admin";

/**
 * 매개변수 값 규칙
 * - id: 숫자·영문 소문자·_ 1~64자(기본). `-`·대문자가 든 ID(uuid, base64url 토큰)는 못 쓴다. 그런 ID를 주소에 넣는 화면을
 *   만들 때 종류를 더하거나 ID 모양을 맞춘다.
 * - digits: 0 또는 0으로 시작하지 않는 10진수이고 안전 정수(2^53 − 1) 이하다. 그래서 한 값에 주소가 하나다(`/x/007` 없음).
 *   셀 키 같은 숫자 ID용이다(셀 키는 16자리까지 간다: packages/planet MAX_CELL_KEY = 6 × 2^49 − 10).
 */
export type RouteParamKind = "id" | "digits";

export interface RouteDefinition {
  /** 경로 패턴. 매개변수는 `:이름`이다(예: `/units/:unitId`) */
  readonly path: string;
  /** 받는 검색어 이름(`?item=…` → "item"). 표에 없는 검색어는 matchPath 결과에 넣지 않는다 */
  readonly search: readonly string[];
  /** 부모 주소 ID — 바로 연 주소(푸시·즐겨찾기)에서 화면 안 [뒤로]가 가는 곳(ADR 37 2절). 홈만 null */
  readonly parent: string | null;
  readonly frame: RouteFrame;
  readonly access: RouteAccess;
  /** 매개변수마다 값 규칙. 적지 않은 매개변수는 id */
  readonly params?: { readonly [name: string]: RouteParamKind };
}

/** 주소 표의 모양. 시험은 같은 함수(…In)에 다른 표를 넣어 매개변수 주소를 본다 */
export type RouteTable = { readonly [id: string]: RouteDefinition };

/**
 * 화면 주소 표. 줄 순서는 메뉴 순서와 상관없다(메뉴는 navigation.ts).
 * 예약만 한 주소(`/units/:unitId`, `/economy/market/:itemId`, `/battle/:battleId` 등)는 ADR 37 1절에 있다.
 * 그 화면을 만들 때 여기에 줄을 더한다. 개발자 도구는 도구마다 정적 줄(`/dev/<도구>`, 조각은 영어 소문자·`-`)이다.
 */
export const ROUTES = {
  // ?template=: 저장하지 않고 다른 템플릿을 본다(검토·사진용). dev·admin에게만 듣는다(ADR 37 6절)
  home: { path: "/", search: ["template"], parent: null, frame: "shown", access: "everyone" },
  // 첫 접속(6-6, ADR 37 1절 예약 → docs/adr/2026-11-01-first-login-cyborg.md): 사이보그 만들기 6단계. 틀을 숨긴 전체 화면이고,
  // 사이보그가 없는 계정은 틀(shell/Shell.tsx)이 다른 주소를 여기로 바꾼다. 만들면 홈으로
  start: { path: "/start", search: [], parent: "home", frame: "hidden", access: "everyone" },
  // 시험·측정용(map/SecondaryMapScreen.tsx): ?pixel-ratio= 픽셀 비율 상한, 2차맵 낮밤(map/secondMapSky.ts,
  // ADR 2026-10-28-s1-second-map "2차맵 낮밤"): ?second-map-time= 지역 시각 멈춤, ?second-map-sky=off 낮밤 끔,
  // ?second-map-neighbours=all 이웃 8장을 처음부터(개발자 3×3 이어 보기, ADR 2026-10-31-second-map-from-planet WP-4)
  map: {
    path: "/map",
    search: ["pixel-ratio", "second-map-time", "second-map-sky", "second-map-neighbours"],
    parent: "home",
    frame: "hidden",
    access: "everyone",
  },
  // 시험·측정용(map/PlanetMapScreen.tsx): ?planet-debug=cracks 타일 틈 찾기, ?pixel-ratio= 픽셀 비율 상한(pixelRatioParam.ts),
  // 1차맵 하늘(map/planetSky.ts, ADR 2026-10-29-primary-map-sky 9절): ?planet-time= 시각 멈춤, ?planet-sky=off 하늘 끔,
  // ?planet-sky-skip= 요소 끔, ?planet-sky-bench= GPU 몫 재기, ?planet-view= 처음 볼 곳(map/planetViewParam.ts)
  map_planet: {
    path: "/map/planet",
    search: [
      "planet-debug",
      "pixel-ratio",
      "planet-time",
      "planet-sky",
      "planet-sky-skip",
      "planet-sky-bench",
      "planet-view",
    ],
    parent: "home",
    frame: "hidden",
    access: "everyone",
  },
  units: { path: "/units", search: [], parent: "home", frame: "shown", access: "everyone" },
  economy: { path: "/economy", search: [], parent: "home", frame: "shown", access: "everyone" },
  // 경제 칸(ADR 37 1절 "경제", 끝의 "구현하며 정한 것 (경제·거래창 화면)"): 예약한 /economy/:section을 칸마다 정적 줄로 둔다.
  // 칸끼리는 바꾸기(replace, 화면이 replace를 준다), 거래창은 물건 → 도시 차례로 쌓고 부모도 그 차례다
  economy_warehouse: {
    path: "/economy/warehouse",
    search: [],
    parent: "economy",
    frame: "shown",
    access: "everyone",
  },
  economy_production: {
    path: "/economy/production",
    search: [],
    parent: "economy",
    frame: "shown",
    access: "everyone",
  },
  economy_market: {
    path: "/economy/market",
    search: [],
    parent: "economy",
    frame: "shown",
    access: "everyone",
  },
  economy_market_item: {
    path: "/economy/market/:itemId",
    search: [],
    parent: "economy_market",
    frame: "shown",
    access: "everyone",
  },
  economy_market_city: {
    path: "/economy/market/:itemId/:cityId",
    search: [],
    parent: "economy_market_item",
    frame: "shown",
    access: "everyone",
  },
  // 내 주문(휴대폰 자리, D-329 = 질문 94 가). 처리할 일 order_filled·order_expired도 이리로 온다
  economy_orders: {
    path: "/economy/orders",
    search: [],
    parent: "economy",
    frame: "shown",
    access: "everyone",
  },
  economy_exchange: {
    path: "/economy/exchange",
    search: [],
    parent: "economy",
    frame: "shown",
    access: "everyone",
  },
  faction: { path: "/faction", search: [], parent: "home", frame: "shown", access: "everyone" },
  cyborg: { path: "/cyborg", search: [], parent: "home", frame: "shown", access: "everyone" },
  // ?item=<항목 ID>: 한 항목을 강조한다(inbox.ts 항목 ID 규칙)
  inbox: { path: "/inbox", search: ["item"], parent: "home", frame: "shown", access: "everyone" },
  mail: { path: "/mail", search: [], parent: "home", frame: "shown", access: "everyone" },
  settings: { path: "/settings", search: [], parent: "home", frame: "shown", access: "everyone" },
  admin: { path: "/admin", search: [], parent: "home", frame: "shown", access: "admin" },
  // 개발자 영역(ADR 38 1절): 개발 도구는 모두 /dev 아래에 둔다
  dev: { path: "/dev", search: [], parent: "home", frame: "shown", access: "dev_admin" },
  dev_planet_editor: {
    path: "/dev/planet-editor",
    search: [],
    parent: "dev",
    frame: "hidden",
    access: "dev_admin",
  },
  // 항성계 편집기(ADR 2026-10-31-star-system-editor): 틀을 숨긴 전체 화면(행성 편집기와 같다)
  dev_star_system: {
    path: "/dev/star-system",
    search: [],
    parent: "dev",
    frame: "hidden",
    access: "dev_admin",
  },
  // 2차맵 시험(ADR 2026-10-31-second-map-from-planet "구현하며 정한 것 (개발자 2차맵 시험)"): 틀을 숨긴 전체 화면. 보기 전용
  dev_second_map: {
    path: "/dev/second-map",
    search: [],
    parent: "dev",
    frame: "hidden",
    access: "dev_admin",
  },
  // 설정 칸 패널(docs/adr/2026-11-01-dev-settings-panel.md 12절): 틀 안 빽빽한 목록. 바꾼 값은 그 세계에 바로 든다
  dev_tuning: {
    path: "/dev/tuning",
    search: [],
    parent: "dev",
    frame: "shown",
    access: "dev_admin",
  },
  // 밸런스 화면(docs/adr/2026-11-01-balance-screen.md 7절): 틀 안 빽빽한 표. 가중치 칸을 바꾸면 그 세계에 바로 든다
  dev_balance: {
    path: "/dev/balance",
    search: [],
    parent: "dev",
    frame: "shown",
    access: "dev_admin",
  },
  // 스킬 편집기·행동별 소모(docs/adr/2026-11-01-skill-editor.md 5절): 틀 안 빽빽한 편집 화면. 저장하면 그 세계에 바로 든다
  dev_skills: {
    path: "/dev/skills",
    search: [],
    parent: "dev",
    frame: "shown",
    access: "dev_admin",
  },
  // 전투 다시보기(docs/adr/2026-11-01-battle-replay.md 7절): 틀을 숨긴 전체 화면. 서버가 시범 6 대 6을 기록해 3D 지도에서 재생한다
  dev_battle_replay: {
    path: "/dev/battle-replay",
    search: [],
    parent: "dev",
    frame: "hidden",
    access: "dev_admin",
  },
  dev_gpu_bench: {
    path: "/dev/gpu-bench",
    search: [],
    parent: "dev",
    frame: "shown",
    access: "dev_admin",
  },
} as const satisfies RouteTable;

/** 주소 ID */
export type RouteId = keyof typeof ROUTES;

/** 경로 패턴의 매개변수 이름들("/a/:x/b/:y" → "x" | "y") */
export type PathParamNames<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | PathParamNames<Rest>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

/** 표 T의 주소 Id가 받는 매개변수 값 */
export type RouteParamsIn<T extends RouteTable, Id extends keyof T> = {
  readonly [K in PathParamNames<T[Id]["path"]>]: string;
};

/**
 * 표 T의 주소 Id가 받는 검색어. 모두 넣지 않아도 된다. 값이 undefined인 검색어는 주소에 넣지 않으므로(buildPathIn)
 * `string | undefined` 값(지금 주소에서 읽은 값 등)을 그대로 넘겨도 된다(exactOptionalPropertyTypes).
 * 검색어를 받지 않는 주소는 어떤 이름도 받지 않는 모양이다(빈 객체 타입 {}은 아무 객체나 받아서 틀린 검색어를 못 잡는다)
 */
export type RouteSearchIn<T extends RouteTable, Id extends keyof T> = [T[Id]["search"][number]] extends [
  never,
]
  ? { readonly [name: string]: never }
  : { readonly [K in T[Id]["search"][number]]?: string | undefined };

/** 주소를 만들 때 줄 값: 매개변수가 있는 주소는 params가 꼭 있어야 한다 */
export type RoutePathOptionsIn<T extends RouteTable, Id extends keyof T> = [
  PathParamNames<T[Id]["path"]>,
] extends [never]
  ? { readonly search?: RouteSearchIn<T, Id> }
  : { readonly params: RouteParamsIn<T, Id>; readonly search?: RouteSearchIn<T, Id> };

/** buildPath의 나머지 인자: 매개변수가 없는 주소는 생략할 수 있다 */
export type RoutePathArgsIn<T extends RouteTable, Id extends keyof T> = [
  PathParamNames<T[Id]["path"]>,
] extends [never]
  ? [options?: RoutePathOptionsIn<T, Id>]
  : [options: RoutePathOptionsIn<T, Id>];

/** matchPath 결과: 주소 ID로 좁히면 매개변수·검색어 타입이 따라온다 */
export type RouteMatchIn<T extends RouteTable> = {
  readonly [Id in keyof T & string]: {
    readonly id: Id;
    readonly params: RouteParamsIn<T, Id>;
    readonly search: RouteSearchIn<T, Id>;
  };
}[keyof T & string];

/** 다른 곳이 가리키는 화면(처리할 일·복귀 요약의 target, 나중의 푸시). JSON으로 보낸다 */
export type RouteTargetIn<T extends RouteTable> = {
  readonly [Id in keyof T & string]: { readonly route: Id } & RoutePathOptionsIn<T, Id>;
}[keyof T & string];

export type RouteParams<Id extends RouteId> = RouteParamsIn<typeof ROUTES, Id>;
export type RouteSearch<Id extends RouteId> = RouteSearchIn<typeof ROUTES, Id>;
export type RoutePathArgs<Id extends RouteId> = RoutePathArgsIn<typeof ROUTES, Id>;
export type RouteMatch = RouteMatchIn<typeof ROUTES>;
export type RouteTarget = RouteTargetIn<typeof ROUTES>;

/** 표를 모르는 함수(…In)의 값 */
export interface LoosePathOptions {
  readonly params?: { readonly [name: string]: string };
  readonly search?: { readonly [name: string]: string | undefined };
}

export interface LooseRouteMatch {
  readonly id: string;
  readonly params: { readonly [name: string]: string };
  readonly search: { readonly [name: string]: string | undefined };
}

/** 매개변수 값 규칙(ADR 37 1절 "매개변수 값에도 점을 넣지 않는다"). digits는 안전 정수인지도 본다(isRouteParamValue) */
const PARAM_VALUE: { readonly [K in RouteParamKind]: RegExp } = {
  id: /^[a-z0-9_]{1,64}$/,
  digits: /^(?:0|[1-9][0-9]{0,15})$/,
};

/** 경로 예에 넣는 매개변수 값 */
const PARAM_EXAMPLE: { readonly [K in RouteParamKind]: string } = { id: "sample_1", digits: "12" };

/**
 * 경로 예에 넣는 검색어 값. 점·쌍점이 든 값이다: 서버·서비스 워커가 검색어가 아니라 경로만 보고 화면을 판정하는지 함께 본다.
 * (처리할 일 항목 ID는 `unit_idle:city_12`처럼 쌍점이 들어간다)
 */
const SEARCH_EXAMPLE = "x.1:y_2";

/** 경로 패턴 → 조각 목록("/" → [], "/a/:b" → ["a", ":b"]) */
function patternSegments(path: string): string[] {
  return path === "/" ? [] : path.slice(1).split("/");
}

function routeIn(table: RouteTable, id: string): RouteDefinition | undefined {
  return Object.hasOwn(table, id) ? table[id] : undefined;
}

function paramKind(route: RouteDefinition, name: string): RouteParamKind {
  return route.params?.[name] ?? "id";
}

/** 배열이 아닌 객체인지(JSON 객체) */
function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 객체의 자기 칸(배열·원형의 칸은 보지 않는다). 객체가 아니면 undefined */
function ownField(value: unknown, key: string): unknown {
  return isRecord(value) && Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

/** 경로 패턴의 매개변수 이름들(왼쪽부터) */
function paramNames(route: RouteDefinition): string[] {
  return patternSegments(route.path)
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
}

// 검색어 읽기·쓰기 — URLSearchParams는 이 꾸러미의 타입(ES만, DOM·Node 타입 없음)에 없어서 같은 규칙을 직접 쓴다.
// 읽기는 application/x-www-form-urlencoded와 같다(+ = 빈칸). 쓰기는 encodeURIComponent(빈칸 = %20)라 둘 다 같은 값으로 읽힌다.

/** "a=1&b=x%3Ay" → 이름 → 값. 같은 이름이 여럿이면 처음 것. 잘못된 % 글자가 든 쌍만 버린다 */
function parseQuery(query: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const equals = pair.indexOf("=");
    const rawKey = equals < 0 ? pair : pair.slice(0, equals);
    const rawValue = equals < 0 ? "" : pair.slice(equals + 1);
    try {
      const key = decodeURIComponent(rawKey.replaceAll("+", " "));
      if (!values.has(key)) values.set(key, decodeURIComponent(rawValue.replaceAll("+", " ")));
    } catch {
      // URIError(잘못된 %): 그 검색어만 없는 것으로 본다
    }
  }
  return values;
}

function formatQuery(entries: readonly (readonly [string, string])[]): string {
  return entries.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
}

/** 검색어 쌍("a=1")의 이름(% 글자를 푼 것, + = 빈칸). 잘못된 % 글자면 null */
function pairName(pair: string): string | null {
  const equals = pair.indexOf("=");
  try {
    return decodeURIComponent((equals < 0 ? pair : pair.slice(0, equals)).replaceAll("+", " "));
  } catch {
    return null;
  }
}

/** 주소 → 경로, 검색어(? 뒤, ? 없이), #조각(# 포함). 없는 것은 빈 문자열 */
function splitUrl(url: string): { pathname: string; query: string; hash: string } {
  const hashAt = url.indexOf("#");
  const withoutHash = hashAt < 0 ? url : url.slice(0, hashAt);
  const queryAt = withoutHash.indexOf("?");
  return {
    pathname: queryAt < 0 ? withoutHash : withoutHash.slice(0, queryAt),
    query: queryAt < 0 ? "" : withoutHash.slice(queryAt + 1),
    hash: hashAt < 0 ? "" : url.slice(hashAt),
  };
}

/** 매개변수 값이 그 주소의 규칙에 맞는지 */
export function isRouteParamValue(kind: RouteParamKind, value: unknown): value is string {
  if (typeof value !== "string" || !PARAM_VALUE[kind].test(value)) return false;
  // 16자리 수는 안전 정수(9007199254740991)를 넘을 수 있다. 넘으면 JS 숫자로 정확히 읽지 못한다
  return kind !== "digits" || Number.isSafeInteger(Number(value));
}

/**
 * 표 T로 주소를 만든다(시험·검사용. 화면 코드는 buildPath를 쓴다).
 * 매개변수 값이 규칙에 맞지 않거나 없는 주소 ID면 예외다(점 든 경로를 만들지 않는다).
 * 검색어는 표에 있는 것만 표 순서로 넣는다. undefined(와 문자열이 아닌 값)는 넣지 않는다.
 * params·search는 자기 칸만 읽는다(isRouteTargetIn과 같다).
 */
export function buildPathIn(table: RouteTable, id: string, options: LoosePathOptions = {}): string {
  const route = routeIn(table, id);
  if (!route) throw new Error(`unknown route id: ${id}`);
  const segments = patternSegments(route.path).map((segment) => {
    if (!segment.startsWith(":")) return segment;
    const name = segment.slice(1);
    const value = ownField(options.params, name);
    if (!isRouteParamValue(paramKind(route, name), value)) {
      throw new RangeError(`route ${id}: param ${name} does not match the value rule: ${String(value)}`);
    }
    return value;
  });
  const entries: [string, string][] = [];
  for (const key of route.search) {
    const value = ownField(options.search, key);
    if (typeof value === "string") entries.push([key, value]);
  }
  const path = `/${segments.join("/")}`;
  return entries.length === 0 ? path : `${path}?${formatQuery(entries)}`;
}

/** 조각마다 정적(0)·매개변수(1). 왼쪽부터 비교해 작은 쪽이 먼저다(정적 조각이 매개변수 조각을 이긴다) */
function specificity(segments: readonly string[]): number[] {
  return segments.map((segment) => (segment.startsWith(":") ? 1 : 0));
}

function moreSpecific(a: readonly number[], b: readonly number[]): boolean {
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * 표 T에서 주소(경로 + 검색어 + #조각)를 찾는다(시험·검사용. 화면 코드는 matchPath를 쓴다). 없으면 null.
 * - 경로는 글자 그대로 비교한다(대문자·%로 바꾼 글자는 맞지 않는다). 끝의 `/` 하나는 무시한다(`/units/` = `/units`).
 * - 같은 주소에 여러 줄이 맞으면 왼쪽 조각부터 정적 조각이 있는 줄이 이긴다(`/economy/market` > `/economy/:section`).
 *   그래도 같으면 표 순서다. 그런 두 줄은 모양이 같은 경로라서 표 규칙 시험(routes.test.ts)이 막는다.
 * - 검색어는 표에 있는 것만 결과에 넣는다(같은 이름이 여럿이면 처음 것). 모르는 검색어는 무시한다.
 */
export function matchPathIn(table: RouteTable, url: string): LooseRouteMatch | null {
  const { pathname: rawPathname, query } = splitUrl(url);
  let pathname = rawPathname;
  if (!pathname.startsWith("/")) return null;
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  const parts = patternSegments(pathname);

  let best: { id: string; route: RouteDefinition; params: Record<string, string>; rank: number[] } | null =
    null;
  for (const [id, route] of Object.entries(table)) {
    const segments = patternSegments(route.path);
    if (segments.length !== parts.length) continue;
    const params: Record<string, string> = {};
    const matched = segments.every((segment, i) => {
      const part = parts[i] ?? "";
      if (!segment.startsWith(":")) return segment === part;
      const name = segment.slice(1);
      if (!isRouteParamValue(paramKind(route, name), part)) return false;
      params[name] = part;
      return true;
    });
    if (!matched) continue;
    const rank = specificity(segments);
    if (best === null || moreSpecific(rank, best.rank)) best = { id, route, params, rank };
  }
  if (best === null) return null;

  const given = parseQuery(query);
  const search: Record<string, string> = {};
  for (const key of best.route.search) {
    const value = given.get(key);
    if (value !== undefined) search[key] = value;
  }
  return { id: best.id, params: best.params, search };
}

/**
 * 주소의 검색어 몇 개만 바꾼다(제자리 바꾸기. 예: 지도 안 `?at=`, ADR 37 1절 "지도 주소").
 * 경로·#조각과 다른 검색어(이 기기가 모르는 것 포함)는 글자 그대로 둔다(ADR 37 1절 "모르는 검색어는 무시하되 지우지 않는다").
 * buildPath·targetPath로 주소를 다시 만들면 표에 없는 검색어가 빠지므로, 지금 주소를 고쳐 쓸 때는 이 함수를 쓴다.
 * - 문자열 값: 그 이름의 첫 쌍 자리에 넣고 같은 이름의 뒤 쌍은 지운다. 그 이름이 없으면 끝에 붙인다.
 * - null·undefined: 그 이름의 쌍을 모두 지운다.
 * - 이름은 % 글자를 푼 뒤 비교한다(matchPath와 같다). 빈 쌍(`&&`)은 뺀다. 검색어가 다 빠지면 `?`도 뺀다.
 */
export function replaceSearch(
  url: string,
  changes: { readonly [name: string]: string | null | undefined },
): string {
  const { pathname, query, hash } = splitUrl(url);
  const pairs: string[] = [];
  const placed = new Set<string>();
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const name = pairName(pair);
    if (name === null || !Object.hasOwn(changes, name)) {
      pairs.push(pair);
      continue;
    }
    if (placed.has(name)) continue;
    placed.add(name);
    const value = changes[name];
    if (typeof value === "string") pairs.push(formatQuery([[name, value]]));
  }
  for (const [name, value] of Object.entries(changes)) {
    if (!placed.has(name) && typeof value === "string") pairs.push(formatQuery([[name, value]]));
  }
  return `${pathname}${pairs.length === 0 ? "" : `?${pairs.join("&")}`}${hash}`;
}

/** 가리키는 화면의 느슨한 모양(표를 모르는 함수의 값) */
export interface LooseRouteTarget {
  readonly route: string;
  readonly params?: { readonly [name: string]: string };
}

/**
 * 표 T에서 맞춘 주소의 부모 화면(시험·검사용. 화면 코드는 parentTarget을 쓴다). 부모가 없으면(홈) null.
 * 부모 경로의 매개변수 값은 자식 주소의 같은 이름 값을 쓴다. 표 규칙(routes.test.ts): 부모 경로의 매개변수는 모두
 * 자식 경로에 같은 이름·같은 값 규칙으로 있다(예: `/economy/market/:itemId/:cityId`의 부모 `/economy/market/:itemId`).
 * 검색어는 넘기지 않는다. 값이 없거나 규칙에 맞지 않으면 예외다(표가 틀렸다).
 */
export function parentTargetIn(
  table: RouteTable,
  match: { readonly id: string; readonly params: { readonly [name: string]: string } },
): LooseRouteTarget | null {
  const route = routeIn(table, match.id);
  if (!route) throw new Error(`unknown route id: ${match.id}`);
  if (route.parent === null) return null;
  const parent = routeIn(table, route.parent);
  if (!parent) throw new Error(`route ${match.id}: unknown parent route id: ${route.parent}`);
  const names = paramNames(parent);
  if (names.length === 0) return { route: route.parent };
  const params: Record<string, string> = {};
  for (const name of names) {
    const value = ownField(match.params, name);
    if (!isRouteParamValue(paramKind(parent, name), value)) {
      throw new RangeError(
        `route ${match.id}: parent param ${name} does not match the value rule: ${String(value)}`,
      );
    }
    params[name] = value;
  }
  return { route: route.parent, params };
}

/**
 * 표 T의 경로 예. 줄마다 매개변수에 규칙에 맞는 값을 넣은 경로 하나, 검색어를 받는 줄은 검색어를 붙인 것 하나 더.
 * 서버 화면 경로 판정(apps/server isPagePath)과 서비스 워커 제외 규칙(scripts/pwa-build.mjs) 시험이 모두 대 본다.
 */
export function routePathExamplesIn(table: RouteTable): string[] {
  const examples: string[] = [];
  for (const [id, route] of Object.entries(table)) {
    const params: Record<string, string> = {};
    for (const segment of patternSegments(route.path)) {
      if (segment.startsWith(":"))
        params[segment.slice(1)] = PARAM_EXAMPLE[paramKind(route, segment.slice(1))];
    }
    examples.push(buildPathIn(table, id, { params }));
    if (route.search.length > 0) {
      const search = Object.fromEntries(route.search.map((key) => [key, SEARCH_EXAMPLE]));
      examples.push(buildPathIn(table, id, { params, search }));
    }
  }
  return examples;
}

/** 주소 표의 주소 ID인지 */
export function isRouteId(value: unknown): value is RouteId {
  return typeof value === "string" && Object.hasOwn(ROUTES, value);
}

/**
 * 주소를 만든다. 틀린 주소 ID·매개변수·검색어는 타입 검사가 잡는다.
 * 주소 ID는 글자 그대로(주소 하나) 넣는다. 주소 ID가 값으로 정해지는 곳(메뉴 표·처리할 일 등)은 RouteTarget과 targetPath를 쓴다.
 * 주소 ID 타입이 여러 주소의 합(union)이면 모든 주소의 검색어 이름이 열리고(맞지 않는 것은 말없이 빠진다),
 * 매개변수 주소가 하나라도 섞이면 모든 주소에 params를 요구하기 때문이다.
 * 합을 타입으로 막지는 않았다. 막으면 Id를 받아 그대로 넘기는 제네릭 감싸기 함수도 막힌다.
 */
export function buildPath<Id extends RouteId>(id: Id, ...args: RoutePathArgs<Id>): string;
export function buildPath(id: RouteId, options?: LoosePathOptions): string {
  return buildPathIn(ROUTES, id, options);
}

/** 주소(location.pathname + location.search)에 맞는 화면. 없으면 null("없는 화면") */
export function matchPath(url: string): RouteMatch | null;
export function matchPath(url: string): LooseRouteMatch | null {
  return matchPathIn(ROUTES, url);
}

/** 다른 곳이 가리키는 화면(target)의 주소 */
export function targetPath(target: RouteTarget): string {
  return buildPathIn(ROUTES, target.route, target);
}

/**
 * 맞춘 주소(matchPath 결과)의 부모 화면. 홈이면 null.
 * 바로 연 주소(푸시·즐겨찾기)라 앱 안에서 쌓은 기록이 없을 때 화면 안 [뒤로]가 이리로 바꾼다(replace, ADR 37 2절).
 */
export function parentTarget(match: RouteMatch): RouteTarget | null {
  const target = parentTargetIn(ROUTES, match);
  if (target === null) return null;
  // 표 규칙을 지키면 늘 맞다. 타입을 좁히려고 다시 본다
  if (!isRouteTarget(target)) throw new Error(`route ${match.id}: parent target does not fit the table`);
  return target;
}

/**
 * 받은 값이 표 T의 화면을 가리키는지(시험·검사용. 화면 코드는 isRouteTarget을 쓴다).
 * - 자기 칸만 읽는다(원형의 칸은 보지 않는다). 값·params·search는 배열이 아닌 객체여야 한다.
 * - 주소 ID가 표에 있고, 매개변수가 모두 규칙에 맞고, 표에 있는 검색어는 문자열(또는 undefined)이어야 한다.
 * - 표에 없는 검색어·매개변수 칸은 받는다(더 새 서버). targetPath가 넣지 않으므로 무시된다.
 */
export function isRouteTargetIn(table: RouteTable, value: unknown): boolean {
  const routeId = ownField(value, "route");
  const route = typeof routeId === "string" ? routeIn(table, routeId) : undefined;
  if (!route) return false;
  const params = ownField(value, "params");
  if (params !== undefined && !isRecord(params)) return false;
  if (!paramNames(route).every((name) => isRouteParamValue(paramKind(route, name), ownField(params, name)))) {
    return false;
  }
  const search = ownField(value, "search");
  if (search === undefined) return true;
  if (!isRecord(search)) return false;
  return route.search.every((key) => {
    const given = ownField(search, key);
    return given === undefined || typeof given === "string";
  });
}

/**
 * 받은 값이 이 기기가 아는 화면을 가리키는지(처리할 일·복귀 요약의 target).
 * 더 새 서버는 이 기기가 모르는 주소를 보낼 수 있다. 맞지 않으면 처리함으로 보낸다(ADR 37 7절).
 * 표에 없는 검색어·매개변수 칸은 받되 무시한다(targetPath가 넣지 않는다). 좁힌 타입(RouteTarget)에는 그 칸이 없다.
 */
export function isRouteTarget(value: unknown): value is RouteTarget {
  return isRouteTargetIn(ROUTES, value);
}

/** 주소 표의 모든 경로 예(routePathExamplesIn 참고) */
export function routePathExamples(): string[] {
  return routePathExamplesIn(ROUTES);
}

/**
 * 메뉴(하단 탭·사이드 메뉴)에서 이 주소가 속한 첫 단계 화면: 부모를 따라 올라가 부모가 홈인 주소. 홈은 홈이다.
 * 예: /economy/market/:itemId → economy. 하위 화면에서도 그 메뉴 항목을 지금 화면(aria-current)으로 보인다
 */
export function menuRoute(id: RouteId): RouteId {
  let current: RouteId = id;
  // 표 규칙(routes.test.ts)이 부모가 홈에 닿는 것을 보장한다. 틀린 표에서도 끝나게 줄 수만큼만 오른다
  for (let step = 0; step < Object.keys(ROUTES).length; step += 1) {
    const parent: string | null = ROUTES[current].parent;
    if (parent === null || parent === "home" || !isRouteId(parent)) return current;
    current = parent;
  }
  return current;
}

/** 누가 여는지 → 역할. null은 누구나 */
const ACCESS_ROLES: { readonly [A in RouteAccess]: readonly Role[] | null } = {
  everyone: null,
  dev_admin: ["dev", "admin"],
  admin: ["admin"],
};

/** 이 역할들로 그 화면을 여는지. 아니면 "권한 없음" + [홈](ADR 37 2절). 화면 편의일 뿐이고 서버가 요청마다 본다 */
export function canOpenRoute(id: RouteId, roles: readonly Role[]): boolean {
  const allowed = ACCESS_ROLES[ROUTES[id].access];
  return allowed === null || roles.some((role) => allowed.includes(role));
}
