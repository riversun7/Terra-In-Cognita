// 전투 집계 — 밸런스·전투 실험실(docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 4절)
// 판정 관찰자(battleTrace.ts BattleTrace, 리플레이 기록기와 같은 고리)를 받아 유닛마다 준·받은 피해·회복·쓰러뜨림·공격·스킬 수와
// 앞 N줄 사건을 센다. 관찰자는 상태·굴림을 바꾸지 않는다(관찰자 있음·없음 결과가 바이트까지 같다, observe.test.ts).
// - 피해 = 그 공격·스킬의 두 몫 합(물리 + 속성, 넘친 피해 포함 — "공격 피해량"). 회복 = 실제로 오른 HP + 쉴드. 지속 피해 = 실제로 내려간 HP.
// - 지속 피해는 그 대상에 지속 피해 효과가 있는 스킬을 마지막으로 맞힌 유닛에게 돌린다(효과 상태는 건 쪽을 들지 않는다).
// - 쓰러뜨림 = 그 일 뒤에 대상이 쓰러졌다(관찰자는 살아 있는 대상에만 불린다). 지속 피해 관찰자는 쓰러짐 표시 전에 불려서
//   체력 0 이하도 쓰러짐으로 본다(effects.ts tickEffects).
import type { BattleTrace } from "./battleTrace.ts";
import type { CombatUnitSpec, UnitState } from "./battleTypes.ts";
import type { AttackOutcome } from "./formula.ts";

export interface BattleHit {
  readonly unit: number;
  /** 피해(음수 = 회복) */
  readonly damage: number;
  readonly down: boolean;
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
      readonly kind: "skill";
      readonly tick: number;
      readonly unit: number;
      readonly skill: string;
      readonly hits: BattleHit[];
    }
  | {
      readonly kind: "dot";
      readonly tick: number;
      readonly unit: number;
      readonly damage: number;
      readonly down: boolean;
    };

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
  /** 판정 관찰자(createBattle·runBattle에 넘긴다) */
  readonly trace: BattleTrace;
  report(): {
    readonly units: ReadonlyMap<number, UnitTally>;
    readonly events: readonly TallyEvent[];
    readonly eventsDropped: number;
  };
}

/** 쓰러졌는가(지속 피해 관찰자는 쓰러짐 표시 전에 불려 체력으로도 본다) */
function isDown(target: UnitState): boolean {
  return target.status === "down" || target.hp <= 0;
}

/** 유닛마다 세는 관찰자. tick() = 지금 판정 틱(관찰자 인자에는 시각이 없어 전투 상태에서 읽는다). logMax = 담을 사건 줄 수 */
export function createBattleTally(
  units: readonly Pick<CombatUnitSpec, "id" | "side">[],
  options: { readonly logMax: number; readonly tick: () => number },
): BattleTally {
  const rows = new Map<number, UnitTally>();
  const sideOf = new Map<number, number>();
  for (const unit of units) {
    rows.set(unit.id, { dealt: 0, taken: 0, healed: 0, healedReceived: 0, kills: 0, attacks: 0, skills: 0 });
    sideOf.set(unit.id, unit.side);
  }
  const events: TallyEvent[] = [];
  let dropped = 0;
  /** 대상 → 지속 피해 효과가 있는 스킬을 마지막으로 맞힌 유닛 */
  const dotSource = new Map<number, number>();
  /** 지금 풀리는 스킬 사건(skillHit·heal이 여기에 맞은 대상을 더한다) */
  let current: { unit: number; hits: BattleHit[] } | null = null;
  const log = (event: TallyEvent): void => {
    if (events.length < options.logMax) events.push(event);
    else dropped += 1;
  };
  /** 피해 하나: 받은 쪽 taken, 적이면 준 쪽 dealt·쓰러뜨림 */
  const harm = (source: number | null, target: UnitState, damage: number): void => {
    const row = rows.get(target.id);
    if (row) row.taken += damage;
    if (source === null || sideOf.get(source) === sideOf.get(target.id)) return;
    const from = rows.get(source);
    if (!from) return;
    from.dealt += damage;
    if (isDown(target)) from.kills += 1;
  };

  const trace: BattleTrace = {
    attack(attacker, target, hit) {
      const damage = hit.physical + hit.elemental;
      const row = rows.get(attacker.id);
      if (row) row.attacks += 1;
      harm(attacker.id, target, damage);
      log({
        kind: "attack",
        tick: options.tick(),
        unit: attacker.id,
        target: target.id,
        outcome: hit.outcome,
        crit: hit.crit,
        damage,
        down: isDown(target),
      });
    },
    building() {
      // 실험실 전투장에는 건물이 없다
    },
    skill(unit, index) {
      const row = rows.get(unit.id);
      if (row) row.skills += 1;
      const hits: BattleHit[] = [];
      current = { unit: unit.id, hits };
      log({ kind: "skill", tick: options.tick(), unit: unit.id, skill: unit.skills[index]?.id ?? "", hits });
    },
    skillHit(unit, skill, target, _hit, physical, elemental) {
      const damage = physical + elemental;
      harm(unit.id, target, damage);
      if (skill.effects.some((part) => part.def.kind === "dot")) dotSource.set(target.id, unit.id);
      if (current && current.unit === unit.id && (damage > 0 || isDown(target)))
        current.hits.push({ unit: target.id, damage, down: isDown(target) });
    },
    heal(source, target, gain) {
      const amount = gain.hp + gain.shield;
      if (amount <= 0) return;
      const row = rows.get(target.id);
      if (row) row.healedReceived += amount;
      if (source) {
        const from = rows.get(source.id);
        if (from) from.healed += amount;
        if (current && current.unit === source.id)
          current.hits.push({ unit: target.id, damage: -amount, down: false });
      } else log({ kind: "dot", tick: options.tick(), unit: target.id, damage: -amount, down: false });
    },
    dot(target, _effect, amount) {
      harm(dotSource.get(target.id) ?? null, target, amount);
      log({
        kind: "dot",
        tick: options.tick(),
        unit: target.id,
        damage: amount,
        down: isDown(target),
      });
    },
  };
  return { trace, report: () => ({ units: rows, events, eventsDropped: dropped }) };
}
