// 장비 권고(저장을 막지 않는 알림, 설계안 2.7) — advice.ts가 부른다(파일 크기). 규칙이 아니라 알림이다(문턱 값은 기술 상수 [A]).
// 아이템 편집기 WP-5·C·탄약: 1차 적정 스탯으로 셈한 2차 적정치가 0인 칸(그 칸은 유닛 스탯을 타지 않는다, 질문 290), 입을 수 있는
// 종류에 그 칸이 없음, 크리쳐 보유 칸인데 크리쳐가 못 입음(D-494), 탄약 장비(보조 칸 탄약 종류)의 내구도 = 탄 수(D-497)가 없음.
import type { ItemEntry } from "@terra/content";
import { ITEM_PRIMARY_SLOTS } from "@terra/shared/itemEditor";
import { MAX_STAT_INPUT, type StatRow, appropriateFromPrimaries } from "@terra/sim";
import type { AdviceContext } from "./advice.ts";

/** 1차 스탯 합이 상한의 몇 ‰를 넘으면 알리나 */
const OVERFLOW_WARN_PM = 900;

type Add = (path: string | null, code: string, params?: Record<string, string | number | boolean>) => void;
type Equip = NonNullable<ItemEntry["equip"]>;

/** 켜진 항목 ID */
const enabledIds = (list: readonly { id: string; enabled: boolean }[]): Set<string> =>
  new Set(list.filter((entry) => entry.enabled).map((entry) => entry.id));

/** 적정치 권고: 직접 적은 적정치 0, 또는 1차 적정 스탯으로 셈한 2차 적정치 0(그 칸은 무기 값 그대로 = 유닛 스탯을 타지 않는다) */
function appropriateAdvice(weapon: NonNullable<Equip["weapon"]>, table: readonly StatRow[], add: Add): void {
  if (weapon.appropriate) {
    let derived: ReturnType<typeof appropriateFromPrimaries>;
    try {
      derived = appropriateFromPrimaries(weapon.appropriate, table);
    } catch {
      return;
    }
    const zero = [
      ...(weapon.physical && derived.physicalAttack <= 0 ? ["physical_attack"] : []),
      ...(weapon.elemental && derived.elementalAttack <= 0 ? ["elemental_attack"] : []),
      ...(derived.hit <= 0 ? ["hit"] : []),
      ...(derived.crit <= 0 ? ["crit_chance"] : []),
    ];
    if (zero.length > 0)
      add("equip.weapon.appropriate", "advice_appropriate_derived_zero", { rows: zero.join(", ") });
    return;
  }
  // 적정치 0: 실효 식 if(A <= 0, W, …)라 유닛 스탯과 상관없이 무기 값 그대로
  const zero = (path: string, value: number | undefined) => {
    if (value === 0) add(`equip.weapon.${path}`, "advice_appropriate_zero", { field: path });
  };
  zero("physical.attackAppropriate", weapon.physical?.attackAppropriate);
  zero("elemental.attackAppropriate", weapon.elemental?.attackAppropriate);
  zero("hitAppropriate", weapon.hitAppropriate);
  zero("critAppropriate", weapon.critAppropriate);
}

/** 장비 칸 권고 */
export function equipAdvice(ctx: AdviceContext, equip: Equip, add: Add): void {
  const { effective } = ctx;
  const typesOn = enabledIds(effective.weaponTypes);
  const disabledRef = (path: string, category: string, id: string, on: ReadonlySet<string>) => {
    if (!on.has(id)) add(path, "advice_disabled_ref", { category, id });
  };
  if (equip.weaponType) disabledRef("equip.weaponType", "weapon_types", equip.weaponType.id, typesOn);
  if (equip.weapon?.ammo) disabledRef("equip.weapon.ammo", "weapon_types", equip.weapon.ammo.id, typesOn);
  const rowsOn = enabledIds(ctx.statRows);
  equip.stats.forEach((range, index) => {
    if (typeof range.stat !== "string")
      disabledRef(`equip.stats[${index}].stat`, "stat_rows", range.stat.id, rowsOn);
  });
  const skillsOn = enabledIds(effective.skills);
  (equip.skills ?? []).forEach((skill, index) => {
    disabledRef(`equip.skills[${index}]`, "skills", skill.id, skillsOn);
  });
  // 입을 수 있는 켜진 유닛 종류(그 칸이 있고, kinds가 있으면 그 안)
  const allowed = equip.kinds ? new Set(equip.kinds.map((kind) => kind.id)) : null;
  const wearers = effective.unitKinds.filter(
    (kind) => kind.enabled && kind.slots.includes(equip.slot) && (!allowed || allowed.has(kind.id)),
  );
  if (wearers.length === 0) add("equip.slot", "advice_no_wearer", { slot: equip.slot });
  // 적은 종류에 이 칸이 없다(그 종류는 이 장비를 끼울 수 없다)
  (equip.kinds ?? []).forEach((ref, index) => {
    const kind = effective.unitKinds.find((entry) => entry.id === ref.id);
    if (kind && !kind.slots.includes(equip.slot))
      add(`equip.kinds[${index}]`, "advice_kind_no_slot", { kind: kind.id, slot: equip.slot });
  });
  // 크리쳐 보유 칸(D-494)인데 크리쳐가 입을 수 없다
  if (equip.creature && !wearers.some((kind) => kind.id === "creature"))
    add("equip.creature", "advice_creature_unwearable");
  const slotCount = wearers.length > 0 ? Math.min(...wearers.map((kind) => kind.skillSlots.base)) : 0;
  const granted = equip.skills ?? [];
  if (wearers.length > 0 && granted.length > slotCount)
    add("equip.skills", "advice_skills_over_slots", { count: granted.length, slots: slotCount });
  // 이 무기의 칸으로 쓸 수 없는 장비 스킬(D-490)
  const weapon = equip.weapon;
  if (weapon) {
    const fields = new Set([
      ...(weapon.physical ? ["physical"] : []),
      ...(weapon.elemental ? ["elemental"] : []),
    ]);
    granted.forEach((ref, index) => {
      const skill = effective.skills.find((entry) => entry.id === ref.id);
      if (!skill || skill.bareHand === true) return;
      const need = skill.weaponField ?? skill.base;
      const usable = need === "any" ? fields.size > 0 : fields.has(need);
      if (!usable) add(`equip.skills[${index}]`, "advice_skill_unusable", { skill: skill.id, field: need });
    });
    appropriateAdvice(weapon, ctx.statTable, add);
  }
  if (equip.maxDurability !== undefined && ctx.destroyAt !== null && equip.maxDurability <= ctx.destroyAt)
    add("equip.maxDurability", "advice_durability_low", { destroyAt: ctx.destroyAt });
  // 탄약 장비(D-497: 보조 칸 장비 하나, 내구도 = 남은 탄 수)인데 최대 내구도(= 담는 탄 수)가 없다
  const type = equip.weaponType
    ? effective.weaponTypes.find((entry) => entry.id === equip.weaponType?.id)
    : undefined;
  if (type?.ammo === true && equip.maxDurability === undefined)
    add("equip.maxDurability", "advice_ammo_capacity");
  // 무기의 탄약 연결이 탄약 종류가 아닌 보조 칸 종류(방패 등)를 가리킨다
  const ammoType = weapon?.ammo
    ? effective.weaponTypes.find((entry) => entry.id === weapon.ammo?.id)
    : undefined;
  if (ammoType && ammoType.ammo !== true)
    add("equip.weapon.ammo", "advice_ammo_type_not_ammo", { type: ammoType.id });
  (equip.combat?.resistPm ?? []).forEach((pm, index) => {
    if (pm >= 1000) add(`equip.combat.resistPm[${index}]`, "advice_resist_immune", { element: index });
  });
  if (ITEM_PRIMARY_SLOTS.includes(equip.slot)) {
    const sum = equip.stats.reduce((total, range) => total + Math.max(0, range.max), 0);
    if (sum * 1000 > MAX_STAT_INPUT * OVERFLOW_WARN_PM) add("equip.stats", "advice_stat_overflow", { sum });
  }
}
