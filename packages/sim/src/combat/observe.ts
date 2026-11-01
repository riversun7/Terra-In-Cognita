// 전투 관찰자 — 밸런스·전투 실험실(docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 4절)
// 판정 코어(battle.ts)가 공격·스킬·지속 효과·퇴각 때 부르는 선택 함수 묶음이다. 상태·굴림을 바꾸지 않는다(관찰자 있음·없음 결과가
// 바이트까지 같다, observe.test.ts). 피해는 호출 앞뒤의 (HP + 아머 + 쉴드) 차이로 센다(넘친 피해는 들지 않는다, 음수 = 회복).
// 지속 피해는 그 효과를 마지막에 건 유닛에게 돌린다(효과 상태는 건 쪽을 들지 않아 관찰자 쪽에서 센다).
// createBattleTally: 유닛마다 준·받은 피해·회복·쓰러뜨림·공격·스킬 수와 앞 N줄 사건 기록(실험실 한 판·몬테카를로가 쓴다).
import type { CombatUnitSpec, UnitState } from "./battleTypes.ts";
import type { AttackOutcome } from "./formula.ts";

export interface BattleHit {
  readonly unit: number;
  /** (HP + 아머 + 쉴드) 줄어든 양(음수 = 회복) */
  readonly damage: number;
  readonly down: boolean;
}

export interface BattleObserver {
  /** 기본 공격 한 번 */
  attack?(event: {
    readonly tick: number;
    readonly unit: number;
    readonly target: number;
    readonly outcome: AttackOutcome;
    readonly crit: boolean;
    readonly damage: number;
    readonly down: boolean;
  }): void;
  /** 시전 시작(시전이 있는 스킬) */
  cast?(event: {
    readonly tick: number;
    readonly unit: number;
    readonly skill: string;
    readonly target: number;
  }): void;
  /** 스킬을 풀었다(바로 또는 시전 끝). hits = (HP + 아머 + 쉴드)가 바뀐 유닛 */
  skill?(event: {
    readonly tick: number;
    readonly unit: number;
    readonly skill: string;
    readonly hits: readonly BattleHit[];
    /** 지속 피해 효과를 새로 걸거나 새로 한 유닛 */
    readonly dotTargets: readonly number[];
  }): void;
  /** 지속 효과 틱(피해 +, 회복 −) */
  effect?(event: {
    readonly tick: number;
    readonly unit: number;
    readonly damage: number;
    readonly down: boolean;
  }): void;
  /** 파티가 전장을 빠졌다 */
  retreat?(event: { readonly tick: number; readonly party: number }): void;
}

/** 관찰자가 세는 양: HP + 아머 + 쉴드 */
export const poolOf = (unit: UnitState): number =>
  Math.max(0, unit.hp) + Math.max(0, unit.armor) + Math.max(0, unit.shield);

/** 지속 피해 효과의 지문(효과 ID·겹침·끝 시각). 스킬 앞뒤로 견줘 새로 걸리거나 새로 한 것을 찾는다 */
const dotPrint = (unit: UnitState): string =>
  unit.effects
    .filter((effect) => effect.kind === "dot")
    .map((effect) => `${effect.id}:${effect.stacks}:${effect.untilMs}`)
    .join("|");

/** 스킬 하나를 푸는 앞뒤로 유닛마다 (HP + 아머 + 쉴드)·쓰러짐·지속 피해 효과를 견준다(값을 바꾸지 않는다) */
export function watchSkill(
  units: readonly UnitState[],
  run: () => void,
): { hits: BattleHit[]; dotTargets: number[] } {
  const pools = units.map(poolOf);
  const prints = units.map(dotPrint);
  const alive = units.map((unit) => unit.status !== "down");
  run();
  const hits: BattleHit[] = [];
  const dotTargets: number[] = [];
  units.forEach((unit, at) => {
    const damage = (pools[at] ?? 0) - poolOf(unit);
    const down = (alive[at] ?? false) && unit.status === "down";
    if (damage !== 0 || down) hits.push({ unit: unit.id, damage, down });
    if (dotPrint(unit) !== prints[at]) dotTargets.push(unit.id);
  });
  return { hits, dotTargets };
}

/** 실험실 사건 한 줄(유닛 ID 그대로, 화면 모양으로 바꾸는 것은 서버) */
export type TallyEvent =
  | {
      readonly kind: "attack";
      readonly tick: number;
      readonly unit: number;
      readonly target: number;
      readonly outcome: AttackOutcome;
      readonly crit: boolean;
      readonly damage: number;
      readonly down: boolean;
    }
  | {
      readonly kind: "cast";
      readonly tick: number;
      readonly unit: number;
      readonly skill: string;
      readonly target: number;
    }
  | {
      readonly kind: "skill";
      readonly tick: number;
      readonly unit: number;
      readonly skill: string;
      readonly hits: readonly BattleHit[];
    }
  | {
      readonly kind: "dot";
      readonly tick: number;
      readonly unit: number;
      readonly damage: number;
      readonly down: boolean;
    }
  | { readonly kind: "retreat"; readonly tick: number; readonly party: number };

export interface UnitTally {
  /** 적에게 준 피해 */
  dealt: number;
  /** 받은 피해(모든 출처) */
  taken: number;
  /** 아군·자기에게 준 회복 */
  healed: number;
  /** 받은 회복 */
  healedReceived: number;
  kills: number;
  attacks: number;
  skills: number;
}

export interface BattleTally {
  readonly observer: BattleObserver;
  report(): {
    readonly units: ReadonlyMap<number, UnitTally>;
    readonly events: readonly TallyEvent[];
    readonly eventsDropped: number;
  };
}

/** 유닛마다 세는 관찰자. logMax = 담을 사건 줄 수(0이면 세기만) */
export function createBattleTally(
  units: readonly Pick<CombatUnitSpec, "id" | "side">[],
  options: { readonly logMax: number },
): BattleTally {
  const rows = new Map<number, UnitTally>();
  const sideOf = new Map<number, number>();
  for (const unit of units) {
    rows.set(unit.id, { dealt: 0, taken: 0, healed: 0, healedReceived: 0, kills: 0, attacks: 0, skills: 0 });
    sideOf.set(unit.id, unit.side);
  }
  const events: TallyEvent[] = [];
  let dropped = 0;
  /** 대상 → 그 유닛에 지속 피해를 마지막에 건 유닛 */
  const dotSource = new Map<number, number>();
  const log = (event: TallyEvent): void => {
    if (events.length < options.logMax) events.push(event);
    else dropped += 1;
  };
  const row = (id: number): UnitTally | undefined => rows.get(id);
  /** 한 유닛(source)이 낸 결과 하나를 센다: 적이면 준 피해·쓰러뜨림, 회복이면 회복 */
  const credit = (source: number, hit: BattleHit): void => {
    const target = row(hit.unit);
    const from = row(source);
    if (hit.damage > 0) {
      if (target) target.taken += hit.damage;
      if (from && sideOf.get(source) !== sideOf.get(hit.unit)) from.dealt += hit.damage;
    } else if (hit.damage < 0) {
      if (target) target.healedReceived -= hit.damage;
      if (from) from.healed -= hit.damage;
    }
    if (hit.down && from && sideOf.get(source) !== sideOf.get(hit.unit)) from.kills += 1;
  };

  const observer: BattleObserver = {
    attack(event) {
      const from = row(event.unit);
      if (from) from.attacks += 1;
      credit(event.unit, { unit: event.target, damage: event.damage, down: event.down });
      log({ kind: "attack", ...event });
    },
    cast(event) {
      log({ kind: "cast", ...event });
    },
    skill(event) {
      const from = row(event.unit);
      if (from) from.skills += 1;
      for (const hit of event.hits) credit(event.unit, hit);
      for (const target of event.dotTargets) dotSource.set(target, event.unit);
      log({ kind: "skill", tick: event.tick, unit: event.unit, skill: event.skill, hits: event.hits });
    },
    effect(event) {
      const source = dotSource.get(event.unit) ?? 0;
      const hit = { unit: event.unit, damage: event.damage, down: event.down };
      // 지속 피해만 건 유닛에게 돌린다(지속 회복은 받은 회복으로만 센다)
      if (source !== 0 && event.damage > 0) credit(source, hit);
      else {
        const target = row(event.unit);
        if (target && event.damage > 0) target.taken += event.damage;
        else if (target && event.damage < 0) target.healedReceived -= event.damage;
      }
      log({ kind: "dot", ...event });
    },
    retreat(event) {
      log({ kind: "retreat", ...event });
    },
  };
  return {
    observer,
    report: () => ({ units: rows, events, eventsDropped: dropped }),
  };
}
