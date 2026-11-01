// 콘텐츠 팩 항목 → 전투 자료 — 실행 도구(cli/common.ts)와 서버가 같이 쓴다. docs/adr/2026-10-31-combat-core.md 7절
// 팩 형식(zod)은 모른다: 이미 검증·파싱한 항목을 받는다(타입만 가져온다). 켜진 항목만, 참조는 ID 문자열로.
// 행 식(stat_rows formula)과 전투 계산식(formulas)은 읽은 식 나무로 바꾼다(팩 검사가 이미 본 식, 틀리면 던진다).
import type {
  EffectEntry,
  FormulaEntry,
  ItemEntry,
  SkillEntry,
  StatRowEntry,
  UnitKindEntry,
} from "@terra/content";
import { STAT_FORMULA_VARS, compileFormulaOrThrow } from "@terra/shared/formula";
import type { CombatCatalog } from "./catalog.ts";
import type { EffectDef } from "./effects.ts";
import type { EquipDef } from "./equipment.ts";
import { type CombatFormulaSet, combatFormulaSetFrom } from "./formulas.ts";
import type { SkillData } from "./skills.ts";
import type { StatRow } from "./stats.ts";

const idOf = (ref: { readonly id: string }): string => ref.id;
const STAT_VARS = STAT_FORMULA_VARS.map((item) => item.name);

/** 팩 행(켜진 것) → sim 가중치 표 행. formula가 있으면 읽은 식을 싣는다 */
export function statRowFrom(row: StatRowEntry): StatRow {
  const formula = row.formula === undefined ? undefined : compileFormulaOrThrow(row.formula, STAT_VARS);
  const extra = formula ? { formula } : {};
  return row.shape === "quantity"
    ? { id: row.id, shape: "quantity", base: row.base, weights: row.weights, ...extra }
    : {
        id: row.id,
        shape: "probability",
        cap: row.cap,
        halfConstant: row.halfConstant,
        weights: row.weights,
        ...extra,
      };
}

/** 팩 formulas 항목 → 전투 계산식 묶음(빠진 칸은 기본 식) */
export function combatFormulasFromPack(entries: readonly FormulaEntry[]): CombatFormulaSet {
  return combatFormulaSetFrom(Object.fromEntries(entries.map((entry) => [entry.id, entry.expression])));
}

export function combatCatalogFrom(pack: {
  readonly statRows: readonly StatRowEntry[];
  readonly effects: readonly EffectEntry[];
  readonly skills: readonly SkillEntry[];
  readonly items: readonly ItemEntry[];
  readonly unitKinds: readonly UnitKindEntry[];
}): CombatCatalog {
  const statTable = pack.statRows.filter((row) => row.enabled).map(statRowFrom);
  const effects = pack.effects
    .filter((entry) => entry.enabled)
    .map(
      (entry): EffectDef => ({
        id: entry.id,
        kind: entry.kind,
        stat: entry.stat,
        valueMode: entry.valueMode,
        durationMs: entry.durationMs,
        tickMs: entry.tickMs,
        stacking: entry.stacking,
        maxStacks: entry.maxStacks,
        status: entry.status,
        resist: entry.resist,
      }),
    );
  const skills = pack.skills
    .filter((entry) => entry.enabled)
    .map(
      (entry): SkillData => ({
        id: entry.id,
        shape: entry.shape,
        trigger: entry.trigger,
        resource: entry.resource,
        cost: entry.cost,
        castMs: entry.castMs,
        cooldownMs: entry.cooldownMs,
        target: entry.target,
        range: entry.range,
        radius: entry.radius,
        chain: entry.chain,
        damage: entry.damage,
        base: entry.base,
        formula: entry.formula,
        conditions: entry.conditions.map((part) =>
          part.part === "target_has" ? { part: "target_has", effect: idOf(part.effect) } : part,
        ),
        effects: entry.effects.map((part) => ({
          effect: idOf(part.effect),
          value: part.value,
          chancePm: part.chancePm,
          durationMs: part.durationMs,
        })),
        gradePm: entry.gradePm,
      }),
    );
  const equipment = pack.items.flatMap((item): EquipDef[] =>
    item.enabled && item.equip
      ? [
          {
            id: item.id,
            slot: item.equip.slot,
            stats: item.equip.stats.map((range) => ({
              stat: typeof range.stat === "string" ? range.stat : idOf(range.stat),
              min: range.min,
              max: range.max,
            })),
            weapon: item.equip.weapon,
            skills: (item.equip.skills ?? []).map(idOf),
          },
        ]
      : [],
  );
  const unitKinds = pack.unitKinds
    .filter((entry) => entry.enabled)
    .map((entry) => ({
      id: entry.id,
      slots: entry.slots,
      skillSlots: entry.skillSlots,
      naturalWeapon: entry.naturalWeapon,
      naturalElementalWeapon: entry.naturalElementalWeapon,
    }));
  return { statTable, effects, skills, equipment, unitKinds };
}
