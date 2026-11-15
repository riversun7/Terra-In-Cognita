// 2차맵 걷기 빠르기 — 사용자 결정 D-540(질문 1251 "걷기만 AGI 반영"): 걷기 속도 = 계산식 walk_speed(실효 AGI), 기본 + AGI × 가중치(상한).
// - AGI = 전투와 같은 몸의 실효 AGI(battleBodies.ts worldBodyBase + 보유 물건 gearOf → roster/unitBody.ts walkAgiOf: 성장값 + 입은 장비·
//   1차 스탯 버프 − 부상 불이익). 사이보그 본체는 저장된 처음 값·K·레벨, 그 밖 세계 유닛은 [임시] 기본 몸(1차 모두 10, 레벨 1).
// - 걷지 않는 유닛은 지금 빠르기 그대로: 탈것 봇(unitKinds.ts wireKindOf "vehicle" — D-5052 수단 속도), 땅이 아닌 유닛(배 등).
// - 2차맵이 이동을 시작할 때(경로를 부탁할 때) 읽는다(secondMap.ts requestRoute → 유닛 speed). 틱마다 셈하지 않는다.
//   유닛마다 몸 입력의 지문(사이보그 레벨·환생·AGI 처음 값·K, 입은 물건·걸린 효과·부상 ‰, 실효 자료 판)이 같으면 받아 둔 AGI를 쓰고,
//   계산식 결과는 (식, AGI)마다 받아 둔다. 성장 계수(설정 칸) 같은 것은 WALK_AGI_TTL_MS마다, 계산식은 WALK_FORMULA_TTL_MS마다 다시 읽는다.
// - 장비·기본 몸 아무것도 없는 유닛(봇·NPC 휴먼 대부분)은 몸을 셈하지 않고 기본 AGI(10) 값만 쓴다.
// - 배(기획 D-541 1272 가 + 다, docs/adr/2026-11-13-boats.md "바뀜 (2026-11-14, B2)"): 저장된 빠르기 대신 설정 칸 boat_speed를 이동을 시작할 때
//   읽는다(걷기와 같은 때 — 바꾸면 모든 배가 다음 이동부터 그 값). 구간마다 빠르기를 바꾸지 않는다(배는 늘 같은 빠르기).
import { type CombatCoefficients, TEST_COMBAT_COEFFICIENTS, walkSpeedOf } from "@terra/sim";
import type { CyborgService } from "../cyborg/service.ts";
import { BASELINE_PRIMARY } from "../roster/body.ts";
import type { RosterCatalog } from "../roster/catalog.ts";
import { type UnitGear, walkAgiOf } from "../roster/unitBody.ts";
import { worldBodyBase } from "./battleBodies.ts";
import { UNIT_KIND_BOAT, wireKindOf } from "./unitKinds.ts";

/** 받아 둔 AGI를 다시 셈하기까지(ms) — 설정 칸(성장 계수 등)이 바뀐 것을 늦어도 이만큼 뒤에 따른다 */
export const WALK_AGI_TTL_MS = 60_000;

/** 계수표(계산식)를 다시 읽기까지(ms) — 실효 자료의 계수표는 읽을 때마다 새로 만들어서(설정 칸 값 전체) 이동마다 읽지 않는다 */
export const WALK_FORMULA_TTL_MS = 5_000;

/** 2차맵 유닛 한 마리의 빠르기 판단 입력 */
export interface WalkUnit {
  readonly id: number;
  readonly kind: number;
  /** 지금 빠르기(단위/초) */
  readonly speed: number;
  readonly domain: string;
}

export interface WalkSpeeds {
  /** 이동을 시작하는 유닛의 빠르기(단위/초): 걷는 유닛은 계산식 walk_speed(실효 AGI), 그 밖은 지금 값 그대로 */
  speedOf(unit: WalkUnit): number;
  /** 걷는 유닛의 실효 AGI(시험·화면) */
  agiOf(unitId: number): number;
}

/** 걷는 유닛인가: 땅 위 + 탈것 봇이 아님(D-540 걷기만 AGI, 차·배는 수단 속도 D-5052) */
export function walksOnFoot(unit: WalkUnit): boolean {
  return unit.domain === "land" && wireKindOf(unit.kind, unit.speed) !== "vehicle";
}

/** 몸 입력 지문: 이것이 같으면 실효 AGI가 같다(실효 자료 판은 따로 본다) */
function bodyKey(base: ReturnType<typeof worldBodyBase>, gear: UnitGear): string {
  let key =
    base.kind === "cyborg"
      ? `c${base.record.level}/${base.record.rebirths}/${base.record.initial.agi}/${base.record.kPm.agi}`
      : "b";
  key += `|${gear.injuryPm ?? 0}`;
  for (const item of gear.equipped)
    key += `|${item.item}@${item.slot}:${item.durability === 0 ? 0 : 1}:${item.stats.map((s) => `${s.stat}=${s.value}`).join(",")}`;
  for (const effect of gear.effects)
    key += `|${effect.effect}:${effect.kind}:${effect.stat ?? ""}:${effect.valueMode}:${effect.value}`;
  return key;
}

export function createWalkSpeeds(input: {
  readonly cyborgs: Pick<CyborgService, "userOfUnit" | "record">;
  readonly gearOf: (unitId: number, nowMs: number) => UnitGear;
  /** 유닛 화면 전투 자료(실효 장비·가중치 표·계수표 — 계산식 포함). 없으면 기본 몸·기본 식 */
  readonly catalog: (() => RosterCatalog) | undefined;
  /** 자료가 없을 때의 계수표(계산식 기본 식) */
  readonly fallback: CombatCoefficients;
  readonly now: () => number;
}): WalkSpeeds {
  const agis = new Map<number, { key: string; agi: number; atMs: number; combat: unknown; held: unknown }>();
  /** 계산식 결과(AGI → 빠르기), 식이 바뀌면 비운다 */
  let memoProgram: unknown;
  const memo = new Map<number, number>();
  let coefficients: { c: CombatCoefficients; atMs: number } | undefined;
  const coefficientsNow = (): CombatCoefficients => {
    const nowMs = input.now();
    if (!coefficients || nowMs - coefficients.atMs >= WALK_FORMULA_TTL_MS || nowMs < coefficients.atMs)
      coefficients = { c: input.catalog?.().coefficients ?? input.fallback, atMs: nowMs };
    return coefficients.c;
  };

  const agiOf = (unitId: number): number => {
    const nowMs = input.now();
    const base = worldBodyBase(input.cyborgs, unitId);
    const gear = input.gearOf(unitId, nowMs);
    if (
      base.kind === "baseline" &&
      gear.equipped.length === 0 &&
      gear.effects.length === 0 &&
      !gear.injuryPm
    ) {
      agis.delete(unitId);
      return BASELINE_PRIMARY;
    }
    const catalog = input.catalog?.();
    if (!catalog) return BASELINE_PRIMARY;
    const key = bodyKey(base, gear);
    const combat = catalog.combat;
    const held = catalog.heldEquipment;
    const cached = agis.get(unitId);
    if (
      cached &&
      cached.key === key &&
      cached.combat === combat &&
      cached.held === held &&
      nowMs - cached.atMs < WALK_AGI_TTL_MS
    )
      return cached.agi;
    const agi = walkAgiOf(catalog, base, gear);
    agis.set(unitId, { key, agi, atMs: nowMs, combat, held });
    return agi;
  };

  return {
    agiOf,
    speedOf(unit) {
      if (!walksOnFoot(unit)) return unit.speed;
      const agi = agiOf(unit.id);
      const c = coefficientsNow();
      const program = c.formulas?.walk_speed;
      if (program !== memoProgram) {
        memoProgram = program;
        memo.clear();
      }
      const hit = memo.get(agi);
      if (hit !== undefined) return hit;
      const speed = walkSpeedOf(agi, c);
      memo.set(agi, speed);
      return speed;
    },
  };
}

/** 배 빠르기(설정 칸 boat_speed 실효 값). 1 미만·틀린 값이면 지금 빠르기 그대로 */
export function boatSpeedOf(unit: WalkUnit, speed: number | undefined): number {
  return speed !== undefined && Number.isFinite(speed) && speed >= 1 ? Math.round(speed) : unit.speed;
}

/**
 * 월드가 2차맵에 잇는 빠르기 고리(world.ts → mapFactory attachWalk): 걷는 유닛 = 실효 AGI, 배 = 설정 칸 boat_speed(rules가 있을 때 —
 * 기획 D-541 1272 가 + 다). 자료가 없으면 팩 기본 계수표(기본 식)
 */
export function walkSpeedsOf(
  cyborgs: Pick<CyborgService, "userOfUnit" | "record">,
  gearOf: (unitId: number, nowMs: number) => UnitGear,
  catalog: (() => RosterCatalog) | undefined,
  now: () => number,
  rules?: () => { readonly boats: { readonly speed: number } },
  /** 배 종류·내구도 빠르기 배율(‰, boats/hooks.ts — D-547 1484·1495). 없으면 1000 */
  boatPm?: (unitId: number) => number,
): (unit: WalkUnit) => number {
  const walk = createWalkSpeeds({ cyborgs, gearOf, catalog, fallback: TEST_COMBAT_COEFFICIENTS, now });
  return (unit) =>
    unit.kind === UNIT_KIND_BOAT && rules
      ? Math.max(1, Math.round((boatSpeedOf(unit, rules().boats.speed) * (boatPm?.(unit.id) ?? 1000)) / 1000))
      : walk.speedOf(unit);
}
