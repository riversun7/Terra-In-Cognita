// 스킬 편집기·행동별 소모 화면 자료(docs/adr/2026-11-01-skill-editor.md 5·6절) — 스냅숏 하나로 만든다.
// 파싱한 팩 항목(참조 = ContentRef)을 화면 JSON(참조 = ID 문자열)으로 칸마다 옮긴다(형 검사가 모양을 지킨다).
import type { EffectEntry, SkillEntry } from "@terra/content";
import type {
  ActionCostRow,
  ContentEditCategory,
  ContentEditOrigin,
  ContentOverrideView,
  SkillDisplaceJson,
  SkillEditorEffect,
  SkillEditorSkill,
  SkillJson,
} from "@terra/shared/skillEditor";
import {
  type ContentEditState,
  type ContentOverrideRecord,
  type ContentSnapshot,
  contentKey,
} from "./state.ts";

/** 파싱한 스킬 → 화면 JSON(팩 파일 한 줄 모양) */
export function skillJsonOf(entry: SkillEntry): SkillJson {
  return {
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    ...(entry.description ? { description: { ko: entry.description.ko, en: entry.description.en } } : {}),
    shape: entry.shape,
    trigger: entry.trigger,
    resource: entry.resource,
    cost: entry.cost,
    castMs: entry.castMs,
    cooldownMs: entry.cooldownMs,
    target: entry.target,
    range: entry.range,
    radius: entry.radius,
    ...(entry.chain ? { chain: { ...entry.chain } } : {}),
    damage: entry.damage,
    base: entry.base,
    ...(entry.weaponField === undefined ? {} : { weaponField: entry.weaponField }),
    ...(entry.bareHand === undefined ? {} : { bareHand: entry.bareHand }),
    formula: entry.formula.map((part) => ({ ...part })),
    conditions: entry.conditions.map((part) =>
      part.part === "target_has" ? { part: "target_has", effect: part.effect.id } : { ...part },
    ),
    effects: entry.effects.map((part) => ({
      effect: part.effect.id,
      value: part.value,
      chancePm: part.chancePm,
      ...(part.durationMs === undefined ? {} : { durationMs: part.durationMs }),
    })),
    gradePm: [...entry.gradePm],
    // 움직임 부품·곡선·연사(팩 선택 칸, docs/adr/2026-11-15-combat-moves.md 6절) — 없으면 칸을 두지 않는다. 화면은 항목을 통째로 저장하므로
    // 여기서 빠지면 저장할 때 칸을 잃는다(곡선 칸이 없으면 공격 스킬 사거리 예산 켬이라 curves: []도 그대로 싣는다, D-573)
    ...(entry.move ? { move: { ...entry.move } } : {}),
    ...(entry.displace ? { displace: displaceJsonOf(entry.displace) } : {}),
    ...(entry.curves ? { curves: [...entry.curves] } : {}),
    ...(entry.shots === undefined ? {} : { shots: entry.shots }),
    enabled: entry.enabled,
  };
}

/** 대상 옮김 부품 → 화면 JSON(effect 참조는 ID로) */
function displaceJsonOf(part: NonNullable<SkillEntry["displace"]>): SkillDisplaceJson {
  const effect = part.effect ? { effect: part.effect.id } : {};
  return part.kind === "root"
    ? { kind: "root", durationMs: part.durationMs, ...effect }
    : { kind: part.kind, cells: part.cells, ...effect };
}

export function overrideViewOf(record: ContentOverrideRecord | undefined): ContentOverrideView | null {
  return record
    ? {
        note: record.note,
        updatedBy: record.updatedByName,
        updatedAt: record.updatedAtMs,
        contentVersionAtSave: record.contentVersion,
      }
    : null;
}

export function originOf(
  state: ContentEditState,
  snapshot: ContentSnapshot,
  category: ContentEditCategory,
  id: string,
): ContentEditOrigin {
  if (!state.packEntry(category, id)) return "created";
  return snapshot.overrides.has(contentKey(category, id)) ? "edited" : "pack";
}

export function effectViewOf(entry: EffectEntry): SkillEditorEffect {
  return {
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    kind: entry.kind,
    stat: entry.stat ?? null,
    valueMode: entry.valueMode,
    durationMs: entry.durationMs,
    status: entry.status ?? null,
    enabled: entry.enabled,
  };
}

/** 스킬 목록(실효 차례): 팩 항목(덮어쓰기 전)과 덮어쓰기 정보, 이 스킬을 주는 장비 */
export function skillViews(state: ContentEditState, snapshot: ContentSnapshot): SkillEditorSkill[] {
  const packSkills = new Map(state.pack.skills.map((entry): [string, SkillEntry] => [entry.id, entry]));
  const grantedBy = new Map<string, string[]>();
  for (const item of snapshot.effective.items)
    for (const ref of item.equip?.skills ?? [])
      grantedBy.set(ref.id, [...(grantedBy.get(ref.id) ?? []), item.id]);
  return snapshot.effective.skills.map((entry) => {
    const pack = packSkills.get(entry.id);
    return {
      entry: skillJsonOf(entry),
      origin: originOf(state, snapshot, "skills", entry.id),
      pack: pack ? skillJsonOf(pack) : null,
      override: overrideViewOf(snapshot.overrides.get(contentKey("skills", entry.id))),
      grantedBy: grantedBy.get(entry.id) ?? [],
      // 저장 묶음의 baseHash(같은 항목을 누가 먼저 고쳤을 때만 충돌, 아이템 편집기 설계안 3.10)
      hash: state.hashOf("skills", entry.id) ?? "",
    };
  });
}

const basicOf = (weapon: { physical?: unknown; basic?: "physical" | "elemental" | undefined }) =>
  weapon.basic ?? (weapon.physical ? "physical" : "elemental");

/**
 * 행동별 소모 표(D-491): 걷기·퇴각(무료, D-418) → 무기 아이템 기본 공격 → 유닛 종류 타고난 무기 기본 공격 → 건물 공격(기본 공격 값) →
 * 회피 기동(미구현) → 스킬
 */
export function actionRows(state: ContentEditState, snapshot: ContentSnapshot): ActionCostRow[] {
  const rows: ActionCostRow[] = [
    { kind: "fixed", key: "walk", status: "free" },
    { kind: "fixed", key: "retreat", status: "free" },
  ];
  for (const item of snapshot.effective.items) {
    const weapon = item.equip?.weapon;
    if (!weapon) continue;
    rows.push({
      kind: "weapon",
      key: contentKey("items", item.id),
      id: item.id,
      name: { ko: item.name.ko, en: item.name.en },
      staminaCost: weapon.staminaCost,
      mpCost: weapon.mpCost,
      basic: basicOf(weapon),
      origin: originOf(state, snapshot, "items", item.id),
      enabled: item.enabled,
    });
  }
  for (const kind of snapshot.effective.unitKinds) {
    rows.push({
      kind: "natural",
      key: contentKey("unit_kinds", kind.id),
      id: kind.id,
      name: { ko: kind.name.ko, en: kind.name.en },
      staminaCost: kind.naturalWeapon.staminaCost,
      mpCost: kind.naturalWeapon.mpCost,
      basic: basicOf(kind.naturalWeapon),
      origin: originOf(state, snapshot, "unit_kinds", kind.id),
      enabled: kind.enabled,
    });
  }
  rows.push({ kind: "fixed", key: "building_attack", status: "same_as_basic" });
  rows.push({ kind: "fixed", key: "evasive_move", status: "unimplemented" });
  for (const skill of snapshot.effective.skills)
    rows.push({
      kind: "skill",
      key: contentKey("skills", skill.id),
      id: skill.id,
      name: { ko: skill.name.ko, en: skill.name.en },
      resource: skill.resource,
      cost: skill.cost,
      trigger: skill.trigger,
      origin: originOf(state, snapshot, "skills", skill.id),
      enabled: skill.enabled,
    });
  return rows;
}
