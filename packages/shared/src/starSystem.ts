// 항성계(개발자 편집기) — 항성 종류 표, 생명 가능 지대(골디락스), 빛 세기, 온도 제안, 항성계 정의 모양 검사.
// ADR 2026-10-31-star-system-editor. 서버(보관함 저장 검사)·기기(편집기·나중 게임 항성계 화면)가 같이 쓴다.
// - 게임 규칙이 아니다: 항성계 화면의 거리·빛은 편집기의 제안일 뿐 게임 실행에 영향이 없다(PLAN 2·5.1, 기획 질문 100~103이 정한다).
// - 계산은 사칙연산과 Math.sqrt만 쓴다(명세가 결과를 정확히 정한다): 엔진과 무관하게 같은 값.
// - 수치 출처(ADR "수치 출처"):
//   · 항성 광도·유효 온도: Mamajek "A Modern Mean Dwarf Stellar Color and Effective Temperature Sequence"
//     판 2024.05.15(github.com/emamajek/SpectralType 커밋 0002cb9의 EEM_dwarf_UBVIJHK_colors_Teff.txt, Pecaut & Mamajek 2013
//     ApJS 208, 9의 확장판) logL 열을 10^logL로 바꿔 두 자리로 줄였다(Verified 2026-10-31). G2V는 표 1.02 대신 태양 = 1로 둔다.
//   · 표시 색: 분광형별 관례 색(Mitchell Charity "What color are the stars?" 표의 근삿값). 확인하지 못했다(Assumed, 화면 색일 뿐).
//   · 생명 가능 지대: Kopparapu et al. 2013(ApJ 765, 131) 보수적 한계, 태양 0.99 AU(습윤 온실) ~ 1.70 AU(최대 온실)
//     (인용 논문으로 확인, 2014 개정판은 바깥 1.67 AU). 다른 항성은 √L로 늘리기만 한다(유효 온도 보정은 하지 않는다 — 간단한 근사).
//   · 지구 평형 온도 255 K(알베도 약 0.3). 온도 차이는 빛 세기^(1/4)에 비례한다(평형 온도 식).
import { PLANET_SETTING_RANGES } from "./planetDefinition.ts";
import { PLANET_LIBRARY_NAME_MAX, normalizePlanetLibraryName } from "./planetLibraryApi.ts";

/** 항성 종류(주계열 분광형). 화면 이름은 기기 메시지 표에 둔다 */
export const STAR_TYPES = [
  { id: "a0v", luminosity: 38, temperatureK: 9700, color: "#cad7ff" },
  { id: "f5v", luminosity: 3.6, temperatureK: 6550, color: "#f8f7ff" },
  { id: "g2v", luminosity: 1, temperatureK: 5770, color: "#fff4ea" },
  { id: "k0v", luminosity: 0.47, temperatureK: 5290, color: "#ffd2a1" },
  { id: "k5v", luminosity: 0.17, temperatureK: 4440, color: "#ffc78e" },
  { id: "m0v", luminosity: 0.069, temperatureK: 3850, color: "#ffcc6f" },
  { id: "m5v", luminosity: 0.003, temperatureK: 3060, color: "#ffbd6f" },
] as const;

export type StarType = (typeof STAR_TYPES)[number];
export type StarTypeId = StarType["id"];
/** 새 항성계의 항성(태양형) */
export const DEFAULT_STAR_TYPE: StarTypeId = "g2v";

export function starType(id: string): StarType | undefined {
  return STAR_TYPES.find((type) => type.id === id);
}

/** 태양의 보수적 생명 가능 지대(AU) — Kopparapu et al. 2013. 화면 제안용 [임시](기획 질문 101) */
export const SOLAR_HABITABLE_ZONE_AU = { inner: 0.99, outer: 1.7 } as const;

/** 생명 가능 지대(AU): 태양 값 × √L */
export function habitableZone(luminosity: number): { inner: number; outer: number } {
  const scale = Math.sqrt(luminosity);
  return { inner: SOLAR_HABITABLE_ZONE_AU.inner * scale, outer: SOLAR_HABITABLE_ZONE_AU.outer * scale };
}

/** 받는 빛 세기(지구 = 1) = L ÷ d² */
export function stellarFlux(luminosity: number, distanceAu: number): number {
  return luminosity / (distanceAu * distanceAu);
}

/** 생명 가능 지대에서 어디인가: 안쪽(더움)·안·바깥(추움) */
export function zoneOf(luminosity: number, distanceAu: number): "hot" | "habitable" | "cold" {
  const zone = habitableZone(luminosity);
  if (distanceAu < zone.inner) return "hot";
  if (distanceAu > zone.outer) return "cold";
  return "habitable";
}

/** 지구 평형 온도(K) */
export const EARTH_EQUILIBRIUM_K = 255;

/**
 * [임시] 온도 제안 누그러뜨림: 평형 온도 차이에 곱한다. 사용자 원문 "약간더 더운 평균온도"의 "약간" — 기획 질문 101이 바꿀 수 있다.
 * 0.5면 빛 세기가 두 배일 때 약 +24°C(평형 식 그대로면 약 +48°C)
 */
export const SUGGESTION_DAMPING = 0.5;

/** 지구 기준(1 AU, 태양)에서 빛 세기에 따른 온도 차이(°C, 반올림 전) = 누그러뜨림 × 255 × (F^(1/4) − 1) */
export function temperatureOffsetC(flux: number): number {
  return SUGGESTION_DAMPING * EARTH_EQUILIBRIUM_K * (Math.sqrt(Math.sqrt(flux)) - 1);
}

export interface TemperatureSuggestion {
  /** 반올림·범위 안으로 묶은 적도·극 기온(°C, 세부 수치 범위 PLANET_SETTING_RANGES) */
  readonly equatorTemperatureC: number;
  readonly poleTemperatureC: number;
  /** 지구 기준과의 차이(°C, 반올림) */
  readonly offsetC: number;
}

function clamp(value: number, [min, max]: readonly [number, number]): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 온도 제안: 지구 기준 적도·극 기온(보통 프리셋 값)에 같은 차이를 더하고, 정수로 반올림해 세부 수치 범위로 묶는다.
 * 극 기온은 적도 기온을 넘지 않는다(세부 수치 규칙)
 */
export function suggestTemperatures(
  flux: number,
  reference: { readonly equatorTemperatureC: number; readonly poleTemperatureC: number },
): TemperatureSuggestion {
  const offset = temperatureOffsetC(flux);
  const equator = clamp(
    Math.round(reference.equatorTemperatureC + offset),
    PLANET_SETTING_RANGES.equatorTemperatureC,
  );
  const pole = Math.min(
    equator,
    clamp(Math.round(reference.poleTemperatureC + offset), PLANET_SETTING_RANGES.poleTemperatureC),
  );
  return { equatorTemperatureC: equator, poleTemperatureC: pole, offsetC: Math.round(offset) };
}

// ── 항성계 정의(보관함 저장 모양) ──

/** 궤도 위 천체: 보관함 행성 / 빈 자리 / 소행성대 / 우주 구조물 자리(D-350 건물용, 규칙 없음) */
export const STAR_SYSTEM_BODY_KINDS = ["planet", "empty", "asteroid_belt", "structure"] as const;
export type StarSystemBodyKind = (typeof STAR_SYSTEM_BODY_KINDS)[number];

export type StarSystemBody =
  | { readonly kind: "planet"; readonly planetId: string }
  | { readonly kind: "empty" }
  | { readonly kind: "asteroid_belt" }
  | { readonly kind: "structure" };

export interface StarSystemOrbit {
  /** 항성에서 거리(1/1000 AU, 정수). 실수 대신 정수로 둔다(같은 값을 서버·기기가 그대로 견준다) */
  readonly distanceMilliAu: number;
  readonly body: StarSystemBody;
}

export interface StarSystemDefinition {
  readonly v: 1;
  readonly star: { readonly type: StarTypeId };
  /** 가까운 궤도부터(거리는 늘 커진다) */
  readonly orbits: readonly StarSystemOrbit[];
}

export const STAR_SYSTEM_FORMAT_VERSION = 1;
/** 궤도 수 상한 */
export const STAR_SYSTEM_MAX_ORBITS = 24;
/** 거리 범위(1/1000 AU): 0.01 AU ~ 1,000 AU */
export const STAR_SYSTEM_DISTANCE_RANGE = [10, 1_000_000] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 배열이 아닌 객체인지(JSON 객체) */
function isRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 자기 칸이 정확히 이것들뿐인 객체인지(모르는 칸이 있으면 틀림) */
function hasExactKeys(value: unknown, keys: readonly string[]): value is object {
  if (!isRecord(value)) return false;
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

/** 객체의 자기 칸(원형의 칸은 보지 않는다) */
function ownField(value: object, key: string): unknown {
  return Object.hasOwn(value, key) ? Reflect.get(value, key) : undefined;
}

function parseBody(value: unknown): StarSystemBody | null {
  if (hasExactKeys(value, ["kind", "planetId"])) {
    const planetId = ownField(value, "planetId");
    return ownField(value, "kind") === "planet" && typeof planetId === "string" && UUID.test(planetId)
      ? { kind: "planet", planetId }
      : null;
  }
  if (!hasExactKeys(value, ["kind"])) return null;
  const kind = ownField(value, "kind");
  return kind === "empty" || kind === "asteroid_belt" || kind === "structure" ? { kind } : null;
}

/**
 * 항성계 정의 검사(서버 저장·기기 앞 검사): 판 1, 표에 있는 항성 종류, 궤도 상한, 거리는 범위 안 정수이고 늘 커짐,
 * 천체는 알려진 종류(행성은 소문자 uuid). 모르는 칸이 있으면 틀림. 맞으면 정리한 정의(같은 모양 새 객체), 아니면 null
 */
export function parseStarSystemDefinition(value: unknown): StarSystemDefinition | null {
  if (!hasExactKeys(value, ["v", "star", "orbits"]) || ownField(value, "v") !== STAR_SYSTEM_FORMAT_VERSION)
    return null;
  const star = ownField(value, "star");
  if (!hasExactKeys(star, ["type"])) return null;
  const typeId = ownField(star, "type");
  const type = typeof typeId === "string" ? starType(typeId) : undefined;
  const items = ownField(value, "orbits");
  if (!type || !Array.isArray(items) || items.length > STAR_SYSTEM_MAX_ORBITS) return null;
  const list: readonly unknown[] = items;
  const [min, max] = STAR_SYSTEM_DISTANCE_RANGE;
  const orbits: StarSystemOrbit[] = [];
  let previous = 0;
  for (const item of list) {
    if (!hasExactKeys(item, ["distanceMilliAu", "body"])) return null;
    const distance = ownField(item, "distanceMilliAu");
    if (typeof distance !== "number" || !Number.isInteger(distance) || distance < min || distance > max)
      return null;
    if (distance <= previous) return null;
    const body = parseBody(ownField(item, "body"));
    if (!body) return null;
    orbits.push({ distanceMilliAu: distance, body });
    previous = distance;
  }
  return { v: STAR_SYSTEM_FORMAT_VERSION, star: { type: type.id }, orbits };
}

/** 빈 새 항성계(태양형, 궤도 없음) */
export function emptyStarSystem(type: StarTypeId = DEFAULT_STAR_TYPE): StarSystemDefinition {
  return { v: STAR_SYSTEM_FORMAT_VERSION, star: { type }, orbits: [] };
}

// ── 항성계 보관함 API 약속(서버 planetEditor.systems.*와 기기 편집기) ──

/** 이름 상한(코드 포인트). 행성 보관함과 같은 규칙(DB 검사 char_length와 같은 단위) */
export const STAR_SYSTEM_NAME_MAX = PLANET_LIBRARY_NAME_MAX;

/** 이름 정리·검사: 행성 보관함 이름과 같은 규칙. 맞으면 정리한 이름, 아니면 null */
export function normalizeStarSystemName(raw: unknown): string | null {
  return normalizePlanetLibraryName(raw);
}

/**
 * 받지 않음·실패 이유 코드(오류 data.reason): invalid_name(이름 규칙), invalid_definition(정의 검사 parseStarSystemDefinition),
 * system_not_found(없거나 지운 항성계), not_author(지우기는 만든 사람·admin만), revision_conflict(다른 사람이 먼저 저장함)
 */
export const STAR_SYSTEM_REASONS = [
  "invalid_name",
  "invalid_definition",
  "system_not_found",
  "not_author",
  "revision_conflict",
] as const;
export type StarSystemReason = (typeof STAR_SYSTEM_REASONS)[number];
