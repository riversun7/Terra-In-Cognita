// 유닛 생명 수치 서비스(서버 권위) — 기획 D-512(HP·아머·쉴드는 전투 뒤에도 남고, 회복은 전투 밖에서도 분 단위), D-509(회복 물약은
// 전투·비전투 상관없이 쓴다), D-099·D-145(부상 단계는 그대로 함께 쓴다). docs/adr/2026-10-31-combat-core.md "바뀜 (D-512 …)".
// - 저장: 다친 유닛만 줄이 있다(값 + 그 값의 시각). 줄이 없으면 세 칸 모두 가득이다. 가득이 되면 줄을 지운다.
// - 회복: 읽을 때·쓸 때 분 단위로 셈한다(@terra/shared vitalsAt — 기기 표시와 같은 함수). 틱이나 주기 타이머로 값을 고치지 않는다.
//   분당 회복은 전투가 쓰는 2차 스탯 그대로다: 쉴드 = 쉴드 재생(D-458, 맞는 중에도 차는 값 D-490). HP·아머는 전투에도 회복 규칙이
//   없어 0이다("회복계산도 그대로 적용" — 기획 질문 343·344로 물었다).
// - 최대·회복: 세계가 그 유닛의 지금 몸 자료를 알면(사이보그) 그것, 모르면(전투 사양에서만 스탯이 나오는 NPC 휴먼) 그 값을 쓸 때의
//   최대·회복(줄에 함께 둔다). 줄도 몸 자료도 없으면 화면 기본 몸 자료(유닛 화면 baselineBody와 같다)로 가득을 보인다.
// - 전투: 시작 자료에 남은 값을 넣고(sim CombatUnitSpec.start, HP 0이면 쓰러진 채 들어온다), 끝 값을 결과 적용과 같은 동기
//   처리에서 저장한다(world_battle_results와 한 커밋 — 다시 켜도 한 번만). 스태미나·MP는 그대로 전투마다 가득에서 시작한다.
// - 모든 쓰기는 동기다: 한 번의 동기 처리 = 한 커밋(S3 U2).
import { type VitalPools, type VitalsSnapshot, vitalsAt, vitalsFull } from "@terra/shared/vitals";
import type { BattleInit, CombatUnitSpec, UnitResult } from "@terra/sim";
import type { WorldWriter } from "../world/persist/writer.ts";
import { type VitalsBody, type VitalsRecord, vitalsRow } from "./state.ts";

/** 세계에서 읽는 것 */
export interface VitalsWorld {
  /** 세계 유닛이 있는가(전투 크리쳐처럼 세계에 없는 전투 유닛은 건너뛴다) */
  exists(unitId: number): boolean;
  /** 그 유닛의 지금 몸 자료(사이보그: 사이보그 화면과 같은 셈). 모르면 undefined → 줄에 둔 값 */
  bodyOf(unitId: number): VitalsBody | undefined;
  /** 줄도 지금 몸 자료도 없을 때의 몸 자료(유닛 화면 기본 몸 자료, [임시] 1차 모두 10). 없으면 undefined */
  defaultBody(unitId: number): VitalsBody | undefined;
}

/** 회복 한 번(효과 사전 heal: flat = 값 그대로, permille = 최대 HP의 ‰) */
export interface HealAmount {
  readonly mode: "flat" | "permille";
  readonly value: number;
}

export interface VitalsService {
  /** nowMs의 생명 수치(분 단위 회복을 셈한 값, 줄이 없으면 가득). 몸 자료를 모르면 undefined */
  read(unitId: number, nowMs: number): VitalsSnapshot | undefined;
  /** HP를 채운다(전투 밖 회복 물약, D-512). 실제로 찬 양(몸 자료를 모르면 0) */
  heal(unitId: number, amount: HealAmount, nowMs: number): number;
  /** 전투 시작 자료에 남은 값을 넣는다(줄이 있는 세계 유닛만, 칸마다 그 전투 사양의 최대로 자른다) */
  battleStart(init: BattleInit, nowMs: number): BattleInit;
  /** 전투 끝 값을 저장한다(결과 적용과 같은 동기 처리). 저장하거나 지운 유닛 수 */
  applyBattle(init: BattleInit, units: readonly UnitResult[], atMs: number): number;
  /** 세계에 없는 유닛의 줄과 다 찬 줄을 지운다. 지운 수 */
  sweep(nowMs: number): number;
  readonly size: number;
}

/** 전투 사양의 몸 자료(최대 = 그 전투의 최대, 회복 = 쉴드 재생) */
export function bodyOfSpec(spec: CombatUnitSpec): VitalsBody {
  return {
    max: {
      hp: Math.max(1, spec.maxHp),
      armor: Math.max(0, spec.armorHp),
      shield: Math.max(0, spec.shieldHp),
    },
    regen: { hp: 0, armor: 0, shield: Math.max(0, spec.shieldRegen) },
  };
}

/** 몸 자료로 가득인 값 */
const fullOf = (body: VitalsBody, nowMs: number): VitalsSnapshot => ({
  values: body.max,
  max: body.max,
  regen: body.regen,
  at: nowMs,
});

const same = (a: VitalPools, b: VitalPools): boolean =>
  a.hp === b.hp && a.armor === b.armor && a.shield === b.shield;

export function createVitalsService(options: {
  readonly loaded: readonly VitalsRecord[];
  readonly writer: WorldWriter;
  readonly world: VitalsWorld;
}): VitalsService {
  const { writer, world } = options;
  const records = new Map<number, VitalsSnapshot>(
    options.loaded.map((record) => [record.unitId, record.snapshot]),
  );

  /** 지금 몸 자료를 얹은 줄(세계가 모르면 줄 그대로) */
  const withBody = (unitId: number, snapshot: VitalsSnapshot): VitalsSnapshot => {
    const body = world.bodyOf(unitId);
    return body ? { ...snapshot, max: body.max, regen: body.regen } : snapshot;
  };

  const current = (unitId: number, nowMs: number): VitalsSnapshot | undefined => {
    const stored = records.get(unitId);
    if (stored) return vitalsAt(withBody(unitId, stored), nowMs);
    const body = world.bodyOf(unitId) ?? world.defaultBody(unitId);
    return body ? fullOf(body, nowMs) : undefined;
  };

  /** 저장한다(가득이면 줄을 지운다). 값은 이미 0~최대다(vitalsAt이 자른다) */
  const store = (unitId: number, snapshot: VitalsSnapshot): void => {
    if (vitalsFull(snapshot)) {
      if (records.delete(unitId)) writer.remove("vitals", { unit_id: unitId });
      return;
    }
    const before = records.get(unitId);
    if (
      before &&
      before.at === snapshot.at &&
      same(before.values, snapshot.values) &&
      same(before.max, snapshot.max) &&
      same(before.regen, snapshot.regen)
    )
      return;
    records.set(unitId, snapshot);
    writer.upsert("vitals", vitalsRow(unitId, snapshot));
  };

  return {
    read: current,

    heal(unitId, amount, nowMs) {
      const now = current(unitId, nowMs);
      if (!now) return 0;
      const raw = amount.mode === "flat" ? amount.value : Math.floor((now.max.hp * amount.value) / 1000);
      const hp = Math.min(now.max.hp, now.values.hp + Math.max(0, raw));
      const gained = hp - now.values.hp;
      if (gained > 0) store(unitId, { ...now, values: { ...now.values, hp } });
      return gained;
    },

    battleStart(init, nowMs) {
      let changed = false;
      const units = init.units.map((spec) => {
        if (!records.has(spec.id) || !world.exists(spec.id)) return spec;
        const now = current(spec.id, nowMs);
        if (!now) return spec;
        const start = {
          hp: Math.min(now.values.hp, spec.maxHp),
          armor: Math.min(now.values.armor, spec.armorHp),
          shield: Math.min(now.values.shield, spec.shieldHp),
        };
        if (start.hp >= spec.maxHp && start.armor >= spec.armorHp && start.shield >= spec.shieldHp)
          return spec;
        changed = true;
        return { ...spec, start };
      });
      return changed ? { ...init, units } : init;
    },

    applyBattle(init, units, atMs) {
      const specs = new Map(init.units.map((spec) => [spec.id, spec]));
      let written = 0;
      for (const result of [...units].toSorted((a, b) => a.unit - b.unit)) {
        if (!world.exists(result.unit)) continue;
        const spec = specs.get(result.unit);
        const body = world.bodyOf(result.unit) ?? (spec ? bodyOfSpec(spec) : world.defaultBody(result.unit));
        if (!body) continue;
        // 끝 값을 그 몸 자료의 최대로 자른다(분 수 0인 vitalsAt). 시각 = 실시간으로 끝나는 시각(그때부터 회복을 센다)
        store(
          result.unit,
          vitalsAt(
            {
              values: { hp: result.hp, armor: result.armor, shield: result.shield },
              max: body.max,
              regen: body.regen,
              at: atMs,
            },
            atMs,
          ),
        );
        written += 1;
      }
      return written;
    },

    sweep(nowMs) {
      let removed = 0;
      for (const [unitId, snapshot] of records) {
        if (!world.exists(unitId)) {
          records.delete(unitId);
          writer.remove("vitals", { unit_id: unitId });
          removed += 1;
          continue;
        }
        if (vitalsFull(vitalsAt(withBody(unitId, snapshot), nowMs))) {
          records.delete(unitId);
          writer.remove("vitals", { unit_id: unitId });
          removed += 1;
        }
      }
      return removed;
    },

    get size() {
      return records.size;
    },
  };
}
