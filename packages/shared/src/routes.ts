// 화면 주소 표 — 첫 단계 화면마다 주소를 준다(ADR 2026-10-29-app-shell 1절, 개발자 영역 3줄은 ADR 2026-10-29-planet-editor-stage1 1절).
// 표는 여기 하나다. 게임 앱 라우터, 서버 화면 경로 판정 시험(apps/server/src/spaFallback.test.ts),
// 서비스 워커 검사(scripts/pwa-build.mjs가 이 파일을 Node로 바로 읽는다)가 같이 쓴다. 나중의 푸시도 이 표로 열 주소를 만든다.
// 그래서 지울 수 있는 TS 문법만 쓰고(tsconfig erasableSyntaxOnly), 맨 위에서 부르는 코드를 두지 않는다("sideEffects": false).
//
// 경로 규칙(routes.test.ts가 표 전체를 본다)
// - 조각은 영어 소문자·숫자·`-`다. 점(.)을 쓰지 않는다. 서버는 점 있는 경로를 파일로 보고 404를 준다.
// - 매개변수(`:이름`) 값에도 점을 넣지 않는다. 값은 숫자·영문 소문자·`_`다(digits는 숫자만).
// - `/api`·`/ws`·`/health`로 시작하지 않는다. 서버는 글자 앞부분만 본다(`/apiary`도 화면이 아니다).
// - 경로에 언어를 넣지 않는다. 화면 제목은 메시지 키다.
// - 모르는 검색어는 무시하되 주소에서 지우지 않는다. matchPath는 주소를 고치지 않는다.
// 경로를 지우거나 바꾸면 옛 경로를 새 경로로 넘긴다(docs/PROTECTED.md). 즐겨찾기와 나중의 푸시가 옛 주소를 가리킨다.
import type { Role } from "./roles.ts";

/** 틀(위 띠·하단 탭·사이드 메뉴)을 그리는지. 화면 전체를 덮는 화면(지도·행성 편집기)은 hidden */
export type RouteFrame = "shown" | "hidden";

/** 누가 여는지. 화면에서 가리는 것은 편의이고, 서버가 요청마다 권한을 본다 */
export type RouteAccess = "everyone" | "dev_admin" | "admin";

/** 매개변수 값 규칙: id = 숫자·영문 소문자·_ 1~64자, digits = 숫자 1~16자 */
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
 * 예약만 한 주소(`/start`, `/units/:unitId`, `/map/:mapKey`, `/battle/:battleId`, `/dev/:tool` 등)는 ADR 37 1절에 있다.
 * 그 화면을 만들 때 여기에 줄을 더한다.
 */
export const ROUTES = {
  // ?template=: 저장하지 않고 다른 템플릿을 본다(검토·사진용). dev·admin에게만 듣는다(ADR 37 6절)
  home: { path: "/", search: ["template"], parent: null, frame: "shown", access: "everyone" },
  map: { path: "/map", search: [], parent: "home", frame: "hidden", access: "everyone" },
  // ?planet-debug=cracks: 타일 틈 찾기(시험용, map/PlanetMapScreen.tsx)
  map_planet: {
    path: "/map/planet",
    search: ["planet-debug"],
    parent: "home",
    frame: "hidden",
    access: "everyone",
  },
  units: { path: "/units", search: [], parent: "home", frame: "shown", access: "everyone" },
  economy: { path: "/economy", search: [], parent: "home", frame: "shown", access: "everyone" },
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
 * 표 T의 주소 Id가 받는 검색어. 모두 넣지 않아도 된다.
 * 검색어를 받지 않는 주소는 어떤 이름도 받지 않는 모양이다(빈 객체 타입 {}은 아무 객체나 받아서 틀린 검색어를 못 잡는다)
 */
export type RouteSearchIn<T extends RouteTable, Id extends keyof T> = [T[Id]["search"][number]] extends [
  never,
]
  ? { readonly [name: string]: never }
  : { readonly [K in T[Id]["search"][number]]?: string };

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

/** 매개변수 값 규칙(ADR 37 1절 "매개변수 값에도 점을 넣지 않는다") */
const PARAM_VALUE: { readonly [K in RouteParamKind]: RegExp } = {
  id: /^[a-z0-9_]{1,64}$/,
  digits: /^[0-9]{1,16}$/,
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

/** 매개변수 값이 그 주소의 규칙에 맞는지 */
export function isRouteParamValue(kind: RouteParamKind, value: unknown): value is string {
  return typeof value === "string" && PARAM_VALUE[kind].test(value);
}

/**
 * 표 T로 주소를 만든다(시험·검사용. 화면 코드는 buildPath를 쓴다).
 * 매개변수 값이 규칙에 맞지 않거나 없는 주소 ID면 예외다(점 든 경로를 만들지 않는다).
 * 검색어는 표에 있는 것만 표 순서로 넣는다. undefined는 넣지 않는다.
 */
export function buildPathIn(table: RouteTable, id: string, options: LoosePathOptions = {}): string {
  const route = routeIn(table, id);
  if (!route) throw new Error(`unknown route id: ${id}`);
  const segments = patternSegments(route.path).map((segment) => {
    if (!segment.startsWith(":")) return segment;
    const name = segment.slice(1);
    const value = options.params?.[name];
    if (!isRouteParamValue(paramKind(route, name), value)) {
      throw new RangeError(`route ${id}: param ${name} does not match the value rule: ${String(value)}`);
    }
    return value;
  });
  const entries: [string, string][] = [];
  for (const key of route.search) {
    const value = options.search?.[key];
    if (value !== undefined) entries.push([key, value]);
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
 * - 같은 주소에 여러 줄이 맞으면 왼쪽 조각부터 정적 조각이 있는 줄이 이긴다(`/map/planet` > `/map/:mapKey`). 그래도 같으면 표 순서.
 * - 검색어는 표에 있는 것만 결과에 넣는다(같은 이름이 여럿이면 처음 것). 모르는 검색어는 무시한다.
 */
export function matchPathIn(table: RouteTable, url: string): LooseRouteMatch | null {
  const withoutHash = url.split("#", 1)[0] ?? "";
  const queryAt = withoutHash.indexOf("?");
  let pathname = queryAt < 0 ? withoutHash : withoutHash.slice(0, queryAt);
  const query = queryAt < 0 ? "" : withoutHash.slice(queryAt + 1);
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

/** 주소를 만든다. 틀린 주소 ID·매개변수·검색어는 타입 검사가 잡는다 */
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
 * 받은 값이 표 T의 화면을 가리키는지(시험·검사용. 화면 코드는 isRouteTarget을 쓴다).
 * 주소 ID가 표에 있고, 매개변수가 모두 규칙에 맞고, 표에 있는 검색어는 문자열이어야 한다. 모르는 검색어는 무시한다.
 */
export function isRouteTargetIn(table: RouteTable, value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const routeId: unknown = Reflect.get(value, "route");
  const route = typeof routeId === "string" ? routeIn(table, routeId) : undefined;
  if (!route) return false;
  const names = patternSegments(route.path)
    .filter((segment) => segment.startsWith(":"))
    .map((segment) => segment.slice(1));
  if (names.length > 0) {
    const params: unknown = Reflect.get(value, "params");
    if (typeof params !== "object" || params === null) return false;
    if (!names.every((name) => isRouteParamValue(paramKind(route, name), Reflect.get(params, name)))) {
      return false;
    }
  }
  const search: unknown = Reflect.get(value, "search");
  if (search === undefined) return true;
  if (typeof search !== "object" || search === null) return false;
  return route.search.every((key) => {
    const given: unknown = Reflect.get(search, key);
    return given === undefined || typeof given === "string";
  });
}

/**
 * 받은 값이 이 기기가 아는 화면을 가리키는지(처리할 일·복귀 요약의 target).
 * 더 새 서버는 이 기기가 모르는 주소를 보낼 수 있다. 맞지 않으면 처리함으로 보낸다(ADR 37 7절).
 * 모르는 검색어는 무시한다(targetPath가 넣지 않는다).
 */
export function isRouteTarget(value: unknown): value is RouteTarget {
  return isRouteTargetIn(ROUTES, value);
}

/** 주소 표의 모든 경로 예(routePathExamplesIn 참고) */
export function routePathExamples(): string[] {
  return routePathExamplesIn(ROUTES);
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
