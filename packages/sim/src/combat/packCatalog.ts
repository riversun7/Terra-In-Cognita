// 콘텐츠 팩 항목 → 전투 자료 — 실행 도구(cli/common.ts)와 서버가 같이 쓴다. docs/adr/2026-10-31-combat-core.md 7절
// 팩 형식(zod)은 모른다: 이미 검증·파싱한 항목을 받는다(타입만 가져온다). 켜진 항목만, 참조는 ID 문자열로.
// 꺼진(또는 없는) 참조는 거른다(docs/adr/2026-11-01-skill-editor.md 2절): 켜진 장비가 가리키는 꺼진 스킬 ID, 켜진 스킬이 가리키는
// 꺼진 효과 줄. 편집기로 스킬·효과를 꺼도 그것을 주는 장비·스킬로 전투 사양을 만들 때 던지지 않게 한다(뺀 것은 droppedReferences).
import type { EffectEntry, ItemEntry, SkillEntry, StatRowEntry, UnitKindEntry } from "@terra/content";
import type { CombatCatalog } from "./catalog.ts";
import type { EffectDef } from "./effects.ts";
import type { EquipDef } from "./equipment.ts";
import type { SkillData } from "./skills.ts";
import type { StatRow } from "./stats.ts";

const idOf = (ref: { readonly id: string }): string => ref.id;

/** 전투 자료로 옮기는 팩 분류 */
export interface CombatPackEntries {
  readonly statRows: readonly StatRowEntry[];
  readonly effects: readonly EffectEntry[];
  readonly skills: readonly SkillEntry[];
  readonly items: readonly ItemEntry[];
  readonly unitKinds: readonly UnitKindEntry[];
}

/** 거른 참조: 켜진 장비 → 꺼졌거나 없는 스킬, 켜진 스킬 → 꺼졌거나 없는 효과 */
export interface DroppedReferences {
  readonly itemSkills: readonly { readonly item: string; readonly skill: string }[];
  readonly skillEffects: readonly { readonly skill: string; readonly effect: string }[];
}

/** 켜진 장비·스킬이 가리키는 꺼진(또는 없는) 스킬·효과(서버가 스냅숏마다 한 번 기록한다) */
export function droppedReferences(pack: CombatPackEntries): DroppedReferences {
  const enabledSkills = new Set(pack.skills.filter((entry) => entry.enabled).map((entry) => entry.id));
  const enabledEffects = new Set(pack.effects.filter((entry) => entry.enabled).map((entry) => entry.id));
  return {
    itemSkills: pack.items.flatMap((item) =>
      item.enabled && item.equip
        ? (item.equip.skills ?? [])
            .map(idOf)
            .filter((skill) => !enabledSkills.has(skill))
            .map((skill) => ({ item: item.id, skill }))
        : [],
    ),
    skillEffects: pack.skills.flatMap((skill) =>
      skill.enabled
        ? skill.effects
            .map((part) => idOf(part.effect))
            .filter((effect) => !enabledEffects.has(effect))
            .map((effect) => ({ skill: skill.id, effect }))
        : [],
    ),
  };
}

export function combatCatalogFrom(pack: CombatPackEntries): CombatCatalog {
  const enabledSkills = new Set(pack.skills.filter((entry) => entry.enabled).map((entry) => entry.id));
  const enabledEffects = new Set(pack.effects.filter((entry) => entry.enabled).map((entry) => entry.id));
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
        weaponField: entry.weaponField,
        bareHand: entry.bareHand,
        formula: entry.formula,
        conditions: entry.conditions.map((part) =>
          part.part === "target_has" ? { part: "target_has", effect: idOf(part.effect) } : part,
        ),
        // 꺼진(또는 없는) 효과 줄은 뺀다(skillFromData가 모르는 효과에서 던지지 않게)
        effects: entry.effects
          .filter((part) => enabledEffects.has(idOf(part.effect)))
          .map((part) => ({
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
            // 꺼진(또는 없는) 스킬은 뺀다(skillsOf가 모르는 스킬에서 던지지 않게)
            skills: (item.equip.skills ?? []).map(idOf).filter((skill) => enabledSkills.has(skill)),
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
      // 적지 않았으면 무기 칸이 없는 종류(크리쳐)만 타고난 무기를 무기로 친다(D-490 기술 기본값)
      naturalWeaponIsWeapon: entry.naturalWeaponIsWeapon ?? !entry.slots.includes("weapon"),
    }));
  return { statTable, effects, skills, equipment, unitKinds };
}
