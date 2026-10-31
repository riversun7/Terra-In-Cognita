// 항성계 편집 — 화면이 고치는 정의를 새 값으로 돌려주는 순수 함수(ADR 2026-10-31-star-system-editor).
// 정의 규칙(@terra/shared parseStarSystemDefinition)을 늘 지킨다: 거리는 범위 안 정수(1/1000 AU)이고 가까운 궤도부터, 궤도 수 상한.
// 규칙을 깨는 고침은 null을 돌려준다(화면은 바꾸지 않는다).
import {
  STAR_SYSTEM_DISTANCE_RANGE,
  STAR_SYSTEM_MAX_ORBITS,
  type StarSystemBody,
  type StarSystemDefinition,
  type StarSystemOrbit,
  type StarTypeId,
  habitableZone,
  starType,
} from "@terra/shared";

const [MIN_MILLI_AU, MAX_MILLI_AU] = STAR_SYSTEM_DISTANCE_RANGE;
/** 새 궤도 거리 = 가장 바깥 궤도 × 이 몫(티티우스-보데처럼 바깥으로 벌어지게, 규칙 아님) */
const NEXT_ORBIT_RATIO = 1.6;

/** AU 글(점 소수) → 1/1000 AU 정수. 범위 밖·수가 아니면 null */
export function parseAu(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const milli = Math.round(Number(trimmed) * 1000);
  return milli >= MIN_MILLI_AU && milli <= MAX_MILLI_AU ? milli : null;
}

/** 1/1000 AU → AU 글(소수 셋째 자리까지, 뒤 0 뗌) */
export function formatAu(milliAu: number): string {
  const whole = Math.floor(milliAu / 1000);
  const rest = String(milliAu % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  return rest === "" ? String(whole) : `${whole}.${rest}`;
}

export function withStarType(definition: StarSystemDefinition, type: StarTypeId): StarSystemDefinition {
  return { ...definition, star: { type } };
}

/** 새 궤도의 거리: 첫 궤도는 생명 가능 지대 가운데, 다음은 가장 바깥 × 1.6(범위 끝에 닿으면 null) */
export function nextOrbitDistance(definition: StarSystemDefinition): number | null {
  const last = definition.orbits.at(-1);
  if (!last) {
    const zone = habitableZone(starType(definition.star.type)?.luminosity ?? 1);
    return Math.min(MAX_MILLI_AU, Math.max(MIN_MILLI_AU, Math.round(((zone.inner + zone.outer) / 2) * 1000)));
  }
  const next = Math.min(MAX_MILLI_AU, Math.round(last.distanceMilliAu * NEXT_ORBIT_RATIO));
  return next > last.distanceMilliAu ? next : null;
}

/** 바깥에 궤도 하나(빈 자리)를 더한다. 상한이거나 더 멀리 둘 곳이 없으면 null */
export function withOrbitAdded(definition: StarSystemDefinition): StarSystemDefinition | null {
  if (definition.orbits.length >= STAR_SYSTEM_MAX_ORBITS) return null;
  const distance = nextOrbitDistance(definition);
  if (distance === null) return null;
  return {
    ...definition,
    orbits: [...definition.orbits, { distanceMilliAu: distance, body: { kind: "empty" } }],
  };
}

/**
 * 궤도 거리를 바꾸고 가까운 것부터 다시 늘어놓는다. 바뀐 정의와 그 궤도의 새 차례를 돌려준다.
 * 범위 밖이거나 다른 궤도와 같은 거리면 null
 */
export function withOrbitDistance(
  definition: StarSystemDefinition,
  index: number,
  distanceMilliAu: number,
): { definition: StarSystemDefinition; index: number } | null {
  const orbit = definition.orbits[index];
  if (!orbit || !Number.isInteger(distanceMilliAu)) return null;
  if (distanceMilliAu < MIN_MILLI_AU || distanceMilliAu > MAX_MILLI_AU) return null;
  if (definition.orbits.some((other, at) => at !== index && other.distanceMilliAu === distanceMilliAu))
    return null;
  const moved: StarSystemOrbit = { ...orbit, distanceMilliAu };
  // toSorted는 Firefox 115부터라 지원 하한(114) 때문에 map이 새로 만든 배열을 바로 정렬한다
  const sorted = definition.orbits
    .map((other, at) => (at === index ? moved : other))
    // oxlint-disable-next-line unicorn/no-array-sort -- 방금 만든 배열이라 원본을 바꿔도 된다
    .sort((a, b) => a.distanceMilliAu - b.distanceMilliAu);
  return { definition: { ...definition, orbits: sorted }, index: sorted.indexOf(moved) };
}

export function withOrbitBody(
  definition: StarSystemDefinition,
  index: number,
  body: StarSystemBody,
): StarSystemDefinition {
  return {
    ...definition,
    orbits: definition.orbits.map((orbit, at) => (at === index ? { ...orbit, body } : orbit)),
  };
}

export function withOrbitRemoved(definition: StarSystemDefinition, index: number): StarSystemDefinition {
  return { ...definition, orbits: definition.orbits.filter((_, at) => at !== index) };
}

/** 같은 정의인지(저장하지 않은 바뀜 표시) */
export function sameDefinition(a: StarSystemDefinition, b: StarSystemDefinition): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
