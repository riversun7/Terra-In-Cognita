// 옛 모양 덮어쓰기 줄을 지금 모양으로 읽기 — 팩 형식이 바뀌어 지금 스키마가 받지 않는 DB 줄(항목 통째)을, 켤 때 고르기(selectAtBoot) 전과
// 싣기(install) 전에 고쳐 읽는다. 그러지 않으면 켤 때 그 줄이 통째로 invalid_entry로 지워지고(그 항목의 다른 고친 칸도 잃는다), 만든 항목이면
// 그것을 가리키는 다른 줄까지 따라 지워진다.
// DB 줄은 그대로 둔다(그 항목을 다음에 저장할 때 새 모양으로 쓰인다). 고친 줄 키는 켤 때 서버 기록(content boot)에 남는다.
// - items, 팩 core@26(D-501 "적정 스탯"): use.effects[].scale의 옛 모양 {stat, pmPerPoint}(스탯 1점당 ‰)는 뺀다(= 기준 값 그대로).
//   새 모양 {stat, appropriate}로 옮길 값이 없어서다(적정 스탯은 편집기에서 다시 적는다). 25~50% 밖 variancePm도 뺀다(= 설정 칸 값).
// - items, 팩 core@26(D-501 "하나로 통일"): 팩이 id-changes로 지운 중분류(소모품 탄약 ammo 등)를 가리키는 subcategory는 뺀다
//   (= 중분류 없음, 보관 창고는 대분류 기본).
// - items equip.weapon·unit_kinds naturalWeapon·naturalElementalWeapon, 팩 core@27(D-502 "무기 1차 적정 스탯"): 옛 2차 점수 적정치
//   (공격력 칸 attackAppropriate, hitAppropriate·critAppropriate·speedAppropriate)는 뺀다(1차 스탯으로 옮길 수 없다: 가중치 표마다 뜻이
//   다르다). 옛 1차 적정 스탯(appropriate, D-496)은 str·int·dex·agi 가운데 1 이상만 남긴다(뜻이 같다: 몫마다 그 1차, 사용자 답 296).
//   남은 적정이 없으면 지금 팩의 같은 항목 적정을 쓰고, 팩에도 없으면 칸을 뺀다(= 모든 몫 비율 100%). 맨손(unarmed)은 무기 몫 0·적정
//   없음(D-502)이라 attack을 0으로 두고 적정을 뺀다. 옛 맨손 속성 자료(naturalElementalWeapon)는 지금 팩처럼 맨손(unarmed, attack 0)이다.
import type { ContentOverrideRecord } from "./boot.ts";
import { type ContentCore, type EntryJson, contentKey } from "./core.ts";

/** 사용 효과 ±오차(‰) 범위(@terra/content ITEM_SCHEMA_LIMITS.useVarianceMinPm·MaxPm과 같다, 시험이 맞춰 본다) */
export const LEGACY_VARIANCE_RANGE = { min: 250, max: 500 } as const;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 효과 줄 하나: 옛 scale·범위 밖 오차를 뺀다(바뀌지 않으면 같은 객체) */
function upgradeUseLine(line: unknown): unknown {
  if (!isObject(line)) return line;
  let next: Record<string, unknown> = line;
  const scale = line.scale;
  if (isObject(scale) && "pmPerPoint" in scale && !("appropriate" in scale)) {
    const { scale: _drop, ...rest } = next;
    next = rest;
  }
  const variance = line.variancePm;
  if (
    typeof variance === "number" &&
    (variance < LEGACY_VARIANCE_RANGE.min || variance > LEGACY_VARIANCE_RANGE.max)
  ) {
    const { variancePm: _drop, ...rest } = next;
    next = rest;
  }
  return next;
}

/** D-502 무기 적정 칸(몫마다 그 1차) */
const WEAPON_APPROPRIATE_KEYS = ["str", "int", "dex", "agi"] as const;
/** D-502 전의 2차 점수 적정치 칸 */
const OLD_WEAPON_KEYS = ["hitAppropriate", "critAppropriate", "speedAppropriate"] as const;

/** 옛 1차 적정(D-496)에서 지금 쓰는 칸(1 이상인 str·int·dex·agi)만. 남은 칸이 없으면 undefined */
function cleanAppropriate(value: unknown): Record<string, number> | undefined {
  if (!isObject(value)) return undefined;
  const out: Record<string, number> = {};
  for (const key of WEAPON_APPROPRIATE_KEYS) {
    const amount = value[key];
    if (typeof amount === "number" && amount >= 1) out[key] = amount;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 무기 사양이 옛 모양인가(2차 점수 적정치 칸이 있거나 지금 받지 않는 1차 적정 칸이 있다) */
function oldWeaponShape(weapon: Record<string, unknown>): boolean {
  if (OLD_WEAPON_KEYS.some((key) => key in weapon)) return true;
  for (const kind of ["physical", "elemental"]) {
    const field = weapon[kind];
    if (isObject(field) && "attackAppropriate" in field) return true;
  }
  const appropriate = weapon.appropriate;
  if (!isObject(appropriate)) return false;
  const clean = cleanAppropriate(appropriate);
  return Object.keys(appropriate).length !== (clean ? Object.keys(clean).length : 0);
}

/**
 * 무기 사양 하나를 D-502 모양으로(옛 모양이 아니면 같은 객체). packWeapon = 지금 팩의 같은 무기(적정을 옮길 값이 없을 때 쓴다),
 * bare = 맨손 자료로 읽는다(무기 몫 0, 적정 없음, unarmed)
 */
function upgradeWeapon(weapon: unknown, packWeapon: unknown, bare: boolean): unknown {
  if (!isObject(weapon) || !oldWeaponShape(weapon)) return weapon;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(weapon)) {
    if ((OLD_WEAPON_KEYS as readonly string[]).includes(key) || key === "appropriate") continue;
    if ((key === "physical" || key === "elemental") && isObject(value)) {
      const { attackAppropriate: _drop, ...field } = value;
      next[key] = bare ? { ...field, attack: 0 } : field;
      continue;
    }
    next[key] = value;
  }
  if (bare) return { ...next, unarmed: true };
  const appropriate =
    cleanAppropriate(weapon.appropriate) ??
    (isObject(packWeapon) ? cleanAppropriate(packWeapon.appropriate) : undefined);
  return appropriate ? { ...next, appropriate } : next;
}

/** 아이템 장비 칸의 무기(바뀌지 않으면 같은 객체) */
function upgradeItemWeapon(entry: EntryJson, pack: EntryJson | undefined): EntryJson {
  const equip = entry.equip;
  if (!isObject(equip) || !isObject(equip.weapon)) return entry;
  const packEquip = pack?.equip;
  const weapon = upgradeWeapon(equip.weapon, isObject(packEquip) ? packEquip.weapon : undefined, false);
  return weapon === equip.weapon ? entry : { ...entry, equip: { ...equip, weapon } };
}

/** 유닛 종류 하나: 타고난 무기·맨손 속성 자료(바뀌지 않으면 같은 객체) */
function upgradeUnitKind(entry: EntryJson, pack: EntryJson | undefined): EntryJson {
  const natural = entry.naturalWeapon;
  const bareNatural = isObject(natural) && natural.unarmed === true;
  const weapon = upgradeWeapon(natural, pack?.naturalWeapon, bareNatural);
  // 맨손 속성 자료는 맨손이다(지금 팩, D-502): 옛 모양이면 무기 몫 0·unarmed로
  const elemental = upgradeWeapon(entry.naturalElementalWeapon, pack?.naturalElementalWeapon, true);
  if (weapon === natural && elemental === entry.naturalElementalWeapon) return entry;
  return { ...entry, naturalWeapon: weapon, naturalElementalWeapon: elemental };
}

/** 아이템 항목 하나(바뀌지 않으면 같은 객체) */
function upgradeItem(
  entry: EntryJson,
  removedSubcategories: ReadonlySet<string>,
  pack: EntryJson | undefined,
): EntryJson {
  let next: EntryJson = entry;
  const subcategory = entry.subcategory;
  if (typeof subcategory === "string" && removedSubcategories.has(subcategory)) {
    const { subcategory: _drop, ...rest } = next;
    next = rest;
  }
  const use = entry.use;
  const effects = isObject(use) ? use.effects : undefined;
  if (isObject(use) && Array.isArray(effects)) {
    const lines: unknown[] = effects.map(upgradeUseLine);
    if (lines.some((line, index) => line !== effects[index]))
      next = { ...next, use: { ...use, effects: lines } };
  }
  return upgradeItemWeapon(next, pack);
}

/** 팩이 지운(이름을 바꾼) 중분류 중 지금 팩에 없는 것 */
function removedSubcategoriesOf(core: ContentCore): Set<string> {
  return new Set(
    core
      .retiredPack("item_subcategories")
      .filter((id) => core.packEntry("item_subcategories", id) === undefined),
  );
}

/** 덮어쓰기 줄 목록을 지금 모양으로 읽는다. 고친 줄 키(`<분류>/<ID>`)도 돌려준다 */
export function upgradeLegacyRows(
  core: ContentCore,
  rows: readonly ContentOverrideRecord[],
): { rows: ContentOverrideRecord[]; upgraded: string[] } {
  const removed = removedSubcategoriesOf(core);
  const upgraded: string[] = [];
  const out = rows.map((row) => {
    const pack = core.packEntry(row.category, row.id);
    const entry =
      row.category === "items"
        ? upgradeItem(row.entry, removed, pack)
        : row.category === "unit_kinds"
          ? upgradeUnitKind(row.entry, pack)
          : row.entry;
    if (entry === row.entry) return row;
    upgraded.push(contentKey(row.category, row.id));
    return { ...row, entry };
  });
  return { rows: out, upgraded };
}
