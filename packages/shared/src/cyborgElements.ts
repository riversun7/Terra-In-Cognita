// 속성값 12칸과 사이보그 생성 속성 분배 규칙 — 기획 D-167(코드)·D-182(칸마다 0~10)·D-450(출처·생성 분배), 49 N36.
// docs/adr/2026-11-01-first-login-cyborg.md "바뀜 (D-450~D-453)". 기기(분배 단계)·서버(만들기 판정)·판정 코드(환생, packages/sim)가
// 같은 함수를 쓴다(이름 규칙 cyborgName.ts와 같은 자리). 칸 수·점수(N36)는 설정값이라 넘겨받는다.
// - 생성: 기본 4원소(물·불·바람·땅) 가운데 칸 수(N36 2)까지 골라 점수(N36 10)를 정확히 나눈다. 한 칸에 모두 넣어도 된다.
// - 합치기: 출처(생성·환생 값, 장비·인공장기, 신앙)를 더하고 칸마다 10에서 자른다(D-450 해석).
// - 빛·어둠은 종교 환생 때(D-450·D-452), 강화형(빙결·폭렬·번개·크리스탈)은 장비·인공장기·신앙에서만 온다(D-450 해석).

import { ELEMENT_CODES, type ElementCode } from "./roster.ts";

/**
 * 속성 12칸 차례(D-167 코드) = 화면 자료의 ELEMENT_CODES(roster.ts, 같은 목록 하나). 전투 공식(packages/sim combat/formula.ts)의 칸 번호와
 * 같다: 계열 = ⌊칸 ÷ 2⌋, 짝수 = 기본, 홀수 = 강화형
 */
export const ELEMENT_IDS = ELEMENT_CODES;
export type ElementId = ElementCode;

/** 생성 때 나누는 기본 4원소(D-450) */
export const BASIC_ELEMENTS = ["water", "fire", "wind", "earth"] as const satisfies readonly ElementId[];
/** 종교 환생 때 고르는 빛·어둠(D-450) */
export const LIGHT_DARK_ELEMENTS = ["light", "dark"] as const satisfies readonly ElementId[];
export type LightDarkElement = (typeof LIGHT_DARK_ELEMENTS)[number];
/** 장비·인공장기·신앙에서만 오는 강화형(D-450 해석) */
export const ENHANCED_ELEMENTS = [
  "frost",
  "blaze",
  "lightning",
  "crystal",
] as const satisfies readonly ElementId[];

/** 칸마다 상한(D-182 0~10, 구조 값) */
export const ELEMENT_MAX = 10;

/** 속성값 12칸(0~10) */
export type ElementValues = Readonly<Record<ElementId, number>>;
/** 일부 칸만 적은 출처(장비·신앙 데이터 등) */
export type ElementSource = Readonly<Partial<Record<string, number>>>;

/** 생성 분배 규칙(N36: 고를 수 있는 칸 수, 나눌 점수) */
export interface ElementAllocationRule {
  readonly cells: number;
  readonly points: number;
}

/** value = 모양·칸 이름·0~10 정수가 아님, not_basic = 4원소 밖 칸, cells = 칸 수 넘음, total = 합이 점수와 다름 */
export type ElementAllocationProblem = "value" | "not_basic" | "cells" | "total";

export type ElementAllocationResult =
  | { readonly ok: true; readonly values: ElementValues }
  | { readonly ok: false; readonly problem: ElementAllocationProblem };

const ELEMENT_SET: ReadonlySet<string> = new Set(ELEMENT_IDS);
const BASIC_SET: ReadonlySet<string> = new Set(BASIC_ELEMENTS);

export function isElementId(value: unknown): value is ElementId {
  return typeof value === "string" && ELEMENT_SET.has(value);
}

export function zeroElements(): Record<ElementId, number> {
  return {
    water: 0,
    frost: 0,
    fire: 0,
    blaze: 0,
    wind: 0,
    lightning: 0,
    earth: 0,
    crystal: 0,
    light: 0,
    holy: 0,
    dark: 0,
    necro: 0,
  };
}

/** 칸 표 → 12칸 배열(저장·전투 공식 차례) */
export function elementsToArray(values: ElementValues): number[] {
  return ELEMENT_IDS.map((id) => values[id]);
}

/** 12칸 배열 → 칸 표. 모자라거나 정수가 아닌 칸은 0 */
export function elementsFromArray(value: unknown): Record<ElementId, number> {
  const out = zeroElements();
  if (!Array.isArray(value)) return out;
  ELEMENT_IDS.forEach((id, index) => {
    const v: unknown = value[index];
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
    if (Number.isInteger(n) && n >= 0) out[id] = Math.min(ELEMENT_MAX, n);
  });
  return out;
}

/** 생성 분배를 검사한다(서버 판정, 기기는 같은 함수로 미리 보인다). 되면 12칸 값 */
export function checkElementAllocation(input: unknown, rule: ElementAllocationRule): ElementAllocationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    return { ok: false, problem: "value" };
  const values = zeroElements();
  let total = 0;
  let cells = 0;
  let notBasic = false;
  for (const [key, raw] of Object.entries(input)) {
    if (
      !isElementId(key) ||
      typeof raw !== "number" ||
      !Number.isInteger(raw) ||
      raw < 0 ||
      raw > ELEMENT_MAX
    )
      return { ok: false, problem: "value" };
    if (raw === 0) continue;
    if (!BASIC_SET.has(key)) notBasic = true;
    values[key] = raw;
    total += raw;
    cells += 1;
  }
  if (notBasic) return { ok: false, problem: "not_basic" };
  if (cells > rule.cells) return { ok: false, problem: "cells" };
  if (total !== rule.points) return { ok: false, problem: "total" };
  return { ok: true, values };
}

/** 출처를 더해 칸마다 10에서 자른다(D-450). 음수·모르는 칸·정수가 아닌 값은 버린다 */
export function sumElementSources(own: ElementValues, sources: readonly ElementSource[]): ElementValues {
  const out = zeroElements();
  for (const id of ELEMENT_IDS) out[id] = Math.min(ELEMENT_MAX, Math.max(0, own[id]));
  for (const source of sources) {
    for (const [key, raw] of Object.entries(source)) {
      if (!isElementId(key) || typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) continue;
      out[key] = Math.min(ELEMENT_MAX, out[key] + raw);
    }
  }
  return out;
}
