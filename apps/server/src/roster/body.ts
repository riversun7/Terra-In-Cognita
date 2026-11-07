// 몸 자료 → 화면 스탯·장비 칸·스킬 — @terra/sim의 같은 순수 함수(성장 primaryAtLevel, 장비 loadoutOf, 스킬 칸 skillSlotCount)로
// 계산한다. 기획 D-414(2차 스탯은 계산), D-417(성장), D-422·D-423(칸·올리는 스탯), D-426·D-427(스킬). 게임 앱은 결과만 받는다.
// 성장률은 설정 칸 N5(n5_growth_rate, 48 §2.3 출발값 100‰)의 실효 값이다(catalog.society, 읽을 때마다 지금 값).
// 시험 유닛은 저장된 스탯이 없어 기본값으로 계산한다.
// 장비 칸은 시안·미리 보기의 범위 자리(‰, itemAt) 또는 보유 물건의 굴린 값(values, docs/adr/2026-11-03-item-holdings.md N49 285)이다.
// 1차 스탯 버프(걸린 효과, D-501)는 성장값 뒤에 더한다(48 §2.3 "쓰는 1차 = 성장값 + 장비 1차 보너스 + 버프"). 타고난 무기는 유닛 종류의
// 것(D-436, 맨손 D-490 — 전투 사양 unitBody.ts가 같은 장비 묶음을 쓴다).
import {
  ELEMENT_CODES,
  type EquipSlot,
  PRIMARY_STATS,
  type PrimaryStat,
  RULE_STAT_ORDER,
  type RosterPrimarySource,
  type RosterSkills,
  type RosterSlot,
  type RosterStatBreakdown,
  type RosterStats,
} from "@terra/shared/roster";
import {
  type EquipDef,
  type EquippedItem,
  type Loadout,
  type Primaries,
  UNARMED,
  type UnitKindDef,
  explainSecondary,
  itemAt,
  loadoutOf,
  primaryAtLevel,
  skillSlotCount,
  wrongStatGroup,
} from "@terra/sim";
import type { RosterCatalog } from "./catalog.ts";

/** [임시] 스탯을 저장하기 전의 시험 유닛 기본값: 1차 6개 모두 10(합 60, D-6039의 합과 같다), 레벨 1, 장비 없음 */
export const BASELINE_PRIMARY = 10;

export interface BodySpec {
  /** 콘텐츠 팩 unit_kinds ID(칸 배치·스킬 칸) */
  readonly kind: string;
  readonly initial: Primaries;
  /** 성장 K(‰, 숨김 값 D-417). null이면 성장 없음(안드로이드 D-416: 1차 = 몸체 + 부품) */
  readonly kPm: Primaries | null;
  /** 레벨(성장이 없으면 무시) */
  readonly level: number;
  readonly rebirths: number;
  /** 칸 번호(팩 unit_kinds slots의 차례) → 아이템 ID와 범위 안 자리(‰, 시안) 또는 굴린 값(보유 물건) */
  readonly equipped: ReadonlyMap<number, EquippedSpec>;
  readonly innateSkills: readonly string[];
  readonly source: RosterStats["source"];
  /** 장비 밖 속성값 12칸(생성·환생·신앙 출처의 합, D-450). 없으면 0. 장비 속성값은 loadoutOf가 더한다 */
  readonly elements?: readonly number[] | undefined;
  /** 1차 스탯 버프(걸린 효과마다, 디버프는 음수, D-501). 성장값 뒤에 더한다(48 §2.3) */
  readonly buffs?: readonly PrimaryBuff[] | undefined;
  /**
   * 부상 불이익(‰, D-514·D-145 "능력치 감소" — 설정 칸 n54_injury_penalty_1~3). 성장값 + 버프에서 스탯마다 ⌊값 × ‰ ÷ 1000⌋을 뺀다
   * (장비 1차 보너스에는 걸지 않는다). 효과 출처 ID "injury"로 보인다. 없거나 0이면 불이익 없음
   */
  readonly injuryPm?: number | undefined;
}

/** 부상 불이익의 효과 출처 ID(사이보그 화면 1차 출처의 "효과" 칸에 든다) */
export const INJURY_BUFF_ID = "injury";

/** 장비 칸 하나: 범위 자리(‰, 시안·미리 보기) 또는 굴린 값(보유 물건, 만들 때 정해짐 N49 285) */
export type EquippedSpec =
  | { readonly item: string; readonly pm: number }
  | { readonly item: string; readonly values: readonly { readonly stat: string; readonly value: number }[] };

/** 1차 스탯 버프 하나(효과 ID, 스탯, 더하는 값) */
export interface PrimaryBuff {
  readonly id: string;
  readonly stat: PrimaryStat;
  readonly value: number;
}

export interface BodyView {
  readonly stats: RosterStats;
  readonly slots: RosterSlot[];
  readonly skills: RosterSkills;
}

function grown(spec: BodySpec, growthPm: number): Primaries {
  const k = spec.kPm;
  if (k === null) return spec.initial;
  const at = (stat: PrimaryStat) => primaryAtLevel(spec.initial[stat], growthPm, k[stat], spec.level);
  return { str: at("str"), dex: at("dex"), agi: at("agi"), vit: at("vit"), int: at("int"), wis: at("wis") };
}

/** 속성값 12칸이 모두 0(D-182). 사이보그가 속성값을 얻는 길이 생기면(질문 182) 저장된 값을 쓴다 */
export const NO_ELEMENTS: readonly number[] = ELEMENT_CODES.map(() => 0);

/** 사이보그 화면의 더 자세한 자료(bodySheet): 2차 스탯 풀이, 1차 스탯 출처, 스킬 칸 최대·열리는 환생 횟수 */
export interface BodySheet extends BodyView {
  readonly breakdown: RosterStatBreakdown[];
  readonly primarySources: Record<PrimaryStat, RosterPrimarySource[]>;
  readonly skillSlotsMax: number;
  readonly skillSlotUnlocks: number[];
  /** 속성값 12칸 = 장비 밖 값(BodySpec.elements) + 장비·인공장기 속성값, 칸마다 10에서 자름(D-450, 아이템 편집기 WP-5) */
  readonly elements: number[];
}

export interface BodyParts {
  readonly view: BodyView;
  readonly loadout: Loadout;
  /** 1차 스탯에 더한 버프(걸린 효과 + 부상 불이익) */
  readonly buffs: readonly PrimaryBuff[];
  /** 성장값(버프·장비 전) */
  readonly base: Primaries;
  /** 유닛 종류(칸 배치·타고난 무기). 팩에 없으면 undefined */
  readonly kind: UnitKindDef | undefined;
  readonly slots: readonly EquipSlot[];
  readonly equipped: readonly (EquippedItem | null)[];
  readonly skillRule: { readonly base: number; readonly perRebirth: number; readonly max: number } | null;
}

/** 몸 하나의 화면 자료. 팩에 없는 아이템·칸이 맞지 않는 아이템은 빈 칸으로 둔다(팩이 바뀌어도 화면이 깨지지 않게) */
export function bodyView(catalog: RosterCatalog, spec: BodySpec): BodyView {
  return bodyParts(catalog, spec).view;
}

/** 화면 차례(PRIMARY_STATS)의 자리 — 풀이 항을 화면 차례로 놓는다 */
const screenOrder = (stat: PrimaryStat): number => PRIMARY_STATS.indexOf(stat);

/**
 * 1차 스탯마다 출처: 몸 값(성장값) + 장비 칸마다 그 아이템이 더한 값(스탯 묶음 + 스탯 보석, loadoutOf와 같은 더하기). 더하면 loadout의 1차 값.
 * revealGrowth(K가 보이는 곳, D-449)면 몸 값을 처음 값·레벨 성장(K‰)으로 나눈다. 스킬·효과(버프)는 화면 자료에 아직 없다
 */
function primarySources(
  spec: BodySpec,
  parts: BodyParts,
  revealGrowth: boolean,
): Record<PrimaryStat, RosterPrimarySource[]> {
  const of = (stat: PrimaryStat): RosterPrimarySource[] => {
    const list: RosterPrimarySource[] = [];
    const k = spec.kPm;
    if (revealGrowth && k !== null) {
      list.push({ kind: "initial", value: spec.initial[stat] });
      list.push({ kind: "growth", value: parts.base[stat] - spec.initial[stat], kPm: k[stat] });
    } else list.push({ kind: "body", value: parts.base[stat] });
    // 쓰지 않은 장비(양손 무기의 보조 칸·입을 수 없는 종류)는 출처가 아니다(loadoutOf ignored)
    const ignored = new Set(parts.loadout.ignored.map((entry) => entry.index));
    parts.equipped.forEach((item, index) => {
      const slot = parts.slots[index];
      if (!item || slot === undefined || ignored.has(index)) return;
      let value = 0;
      for (const entry of item.values) if (entry.stat === stat) value += entry.value;
      for (const gem of item.gems ?? []) if (gem.kind === "stat" && gem.stat === stat) value += gem.value;
      if (value !== 0) list.push({ kind: "item", slot, item: item.item, value });
    });
    for (const buff of parts.buffs)
      if (buff.stat === stat && buff.value !== 0)
        list.push({ kind: "effect", id: buff.id, value: buff.value });
    return list;
  };
  return { str: of("str"), vit: of("vit"), int: of("int"), wis: of("wis"), dex: of("dex"), agi: of("agi") };
}

/**
 * 사이보그 화면 자료: bodyView + 2차 스탯 풀이(같은 입력으로 @terra/sim explainSecondary — 값은 stats.secondary와 같다) +
 * 1차 스탯 출처 + 스킬 칸 규칙(팩 unit_kinds skillSlots: 처음 + 환생마다, 최대). 열리는 환생 횟수는 서버가 같은 skillSlotCount로 센다
 */
export function bodySheet(
  catalog: RosterCatalog,
  spec: BodySpec,
  options: { readonly revealGrowth?: boolean } = {},
): BodySheet {
  const parts = bodyParts(catalog, spec);
  const { view, loadout, skillRule } = parts;
  const unlocks: number[] = [];
  if (skillRule && skillRule.perRebirth > 0) {
    let opened = view.skills.slots;
    for (let rebirths = spec.rebirths + 1; opened < skillRule.max; rebirths++) {
      const count = skillSlotCount(skillRule.base, rebirths * skillRule.perRebirth, skillRule.max);
      for (; opened < count; opened++) unlocks.push(rebirths);
    }
  }
  const breakdown = explainSecondary(
    loadout.primaries,
    catalog.combat.statTable,
    loadout.gear,
    {},
    spec.level,
  ).map(
    (row): RosterStatBreakdown => ({
      ...row,
      terms: row.terms
        .flatMap((term) => {
          const stat = RULE_STAT_ORDER[term.index];
          return stat ? [{ stat, value: term.value, weightPm: term.weightPm, milli: term.milli }] : [];
        })
        .toSorted((a, b) => screenOrder(a.stat) - screenOrder(b.stat)),
    }),
  );
  return {
    ...view,
    breakdown,
    primarySources: primarySources(spec, parts, options.revealGrowth ?? false),
    skillSlotsMax: skillRule?.max ?? view.skills.slots,
    skillSlotUnlocks: unlocks,
    elements: [...loadout.elements],
  };
}

/** 1차 스탯에 버프를 더한다(48 §2.3: 성장값 + 버프, 장비 1차 보너스는 loadoutOf가 더한다) */
function withBuffs(base: Primaries, buffs: readonly PrimaryBuff[] | undefined): Primaries {
  if (!buffs || buffs.length === 0) return base;
  const out = { ...base };
  for (const buff of buffs) out[buff.stat] += buff.value;
  return out;
}

/** 걸린 효과 버프 + 부상 불이익(성장값 + 버프에서 ‰만큼 빼는 음수 버프, D-514) */
function buffsWithInjury(base: Primaries, spec: BodySpec): readonly PrimaryBuff[] {
  const buffs = spec.buffs ?? [];
  const pm = Math.min(1000, Math.max(0, spec.injuryPm ?? 0));
  if (pm === 0) return buffs;
  const buffed = withBuffs(base, buffs);
  const injury = PRIMARY_STATS.flatMap((stat): PrimaryBuff[] => {
    const cut = Math.floor((Math.max(0, buffed[stat]) * pm) / 1000);
    return cut > 0 ? [{ id: INJURY_BUFF_ID, stat, value: -cut }] : [];
  });
  return [...buffs, ...injury];
}

/**
 * 칸 하나의 장비 → 만든 물건. 굴린 값은 지금 정의의 칸 묶음에 맞는 것만 남긴다(정의의 칸이 바뀌어 1차·2차 묶음이 달라진 줄은 빼고,
 * 무기 사양·속성·스킬은 지금 정의를 읽는다 — N49 "굴린 값만 두고 나머지는 그때 읽음")
 */
function equippedItemOf(def: EquipDef, wanted: EquippedSpec): EquippedItem {
  if ("pm" in wanted) return itemAt(def, wanted.pm);
  return {
    ...itemAt(def, 0),
    values: wanted.values
      .filter((entry) => wrongStatGroup(def.slot, [entry]) === undefined)
      .map((entry) => ({ stat: entry.stat, value: entry.value })),
  };
}

/** 몸 하나의 장비 묶음·화면 자료(사이보그 화면·유닛 화면·전투 사양이 같이 쓴다) */
export function bodyParts(catalog: RosterCatalog, spec: BodySpec): BodyParts {
  const kind = catalog.combat.unitKinds.find((entry) => entry.id === spec.kind);
  const slots = kind?.slots ?? [];
  const equipped: (EquippedItem | null)[] = slots.map((slot, index) => {
    const wanted = spec.equipped.get(index);
    // 꺼진 항목도 찾는다(이미 입은 물건은 스탯을 준다, 질문 355 → D-515·D-512)
    const def = wanted ? catalog.heldEquipment.find((item) => item.id === wanted.item) : undefined;
    return wanted && def && def.slot === slot ? equippedItemOf(def, wanted) : null;
  });
  const base = grown(spec, catalog.society.cyborg.growthPm);
  const buffs = buffsWithInjury(base, spec);
  const skillSlots = kind
    ? skillSlotCount(kind.skillSlots.base, spec.rebirths * kind.skillSlots.perRebirth, kind.skillSlots.max)
    : 0;
  const loadout = loadoutOf({
    base: withBuffs(base, buffs),
    slots,
    equipped,
    table: catalog.combat.statTable,
    // 유닛 종류의 타고난 무기(D-436). 무기 칸이 비면 맨손(D-490: 타고난 무기를 무기로 치는 종류만 스킬에 쓴다)
    unarmed: kind?.naturalWeapon ?? UNARMED,
    naturalIsWeapon: kind?.naturalWeaponIsWeapon ?? false,
    innateSkills: spec.innateSkills,
    skillSlots,
    // 행 식의 LV(docs/adr/2026-11-01-formula-editor.md)
    level: spec.level,
    // 입을 수 있는 유닛 종류(D-494)·장비 밖 속성값(D-450, 아이템 편집기 WP-5)
    kind: spec.kind,
    ...(spec.elements ? { elements: spec.elements } : {}),
  });
  const primary = (stat: PrimaryStat) => ({ base: base[stat], bonus: loadout.primaries[stat] - base[stat] });
  const primaries: RosterStats["primaries"] = {
    str: primary("str"),
    dex: primary("dex"),
    agi: primary("agi"),
    vit: primary("vit"),
    int: primary("int"),
    wis: primary("wis"),
  };
  const innate = new Set(spec.innateSkills);
  const view: BodyView = {
    stats: {
      source: spec.source,
      primaries,
      secondary: catalog.combat.statTable.map((row) => ({
        id: row.id,
        shape: row.shape,
        value: loadout.stats[row.id] ?? 0,
      })),
    },
    slots: slots.map((slot: EquipSlot, index) => {
      const item = equipped[index];
      return { slot, item: item ? { id: item.item, values: item.values.map((v) => ({ ...v })) } : null };
    }),
    skills: {
      slots: skillSlots,
      list: loadout.skills.map((id) => ({ id, source: innate.has(id) ? "innate" : "equipment" })),
    },
  };
  return { view, loadout, buffs, base, kind, slots, equipped, skillRule: kind ? kind.skillSlots : null };
}

/** [임시] 저장된 스탯이 없는 시험 유닛(휴먼 칸 배치, 1차 모두 10, 레벨 1, 장비 없음) */
export function baselineBody(catalog: RosterCatalog): BodyView {
  const flat = {
    str: BASELINE_PRIMARY,
    dex: BASELINE_PRIMARY,
    agi: BASELINE_PRIMARY,
    vit: BASELINE_PRIMARY,
    int: BASELINE_PRIMARY,
    wis: BASELINE_PRIMARY,
  };
  return bodyView(catalog, {
    kind: "human",
    initial: flat,
    kPm: null,
    level: 1,
    rebirths: 0,
    equipped: new Map(),
    innateSkills: [],
    source: "baseline",
  });
}
