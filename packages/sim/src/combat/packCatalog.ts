// 콘텐츠 팩 항목 → 전투 자료 — 실행 도구(cli/common.ts)와 서버가 같이 쓴다. docs/adr/2026-10-31-combat-core.md 7절
// 팩 형식(zod)은 모른다: 이미 검증·파싱한 항목을 받는다(타입만 가져온다). 켜진 항목만, 참조는 ID 문자열로.
import type { EffectEntry, ItemEntry, SkillEntry, StatRowEntry, UnitKindEntry } from "@terra/content";
import type { CombatCatalog } from "./catalog.ts";
import type { EffectDef } from "./effects.ts";
import type { EquipDef } from "./equipment.ts";
import type { SkillData } from "./skills.ts";
import type { StatRow } from "./stats.ts";

const idOf = (ref: { readonly id: string }): string => ref.id;

export function combatCatalogFrom(pack: {
  readonly statRows: readonly StatRowEntry[];
  readonly effects: readonly EffectEntry[];
  readonly skills: readonly SkillEntry[];
  readonly items: readonly ItemEntry[];
  readonly unitKinds: readonly UnitKindEntry[];
}): CombatCatalog {
  const statTable = pack.statRows
    .filter((row) => row.enabled)
    .map(
      (row): StatRow =>
        row.shape === "quantity"
          ? { id: row.id, shape: "quantity", base: row.base, weights: row.weights }
          : {
              id: row.id,
              shape: "probability",
              cap: row.cap,
              halfConstant: row.halfConstant,
              weights: row.weights,
            },
    );
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
        trigger: entry.trigger,
        resource: entry.resource,
        cost: entry.cost,
        castMs: entry.castMs,
        cooldownMs: entry.cooldownMs,
        target: entry.target,
        range: entry.range,
        radius: entry.radius,
        damage: entry.damage,
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
    }));
  return { statTable, effects, skills, equipment, unitKinds };
}
