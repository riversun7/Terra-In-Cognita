// 몸 자료 → 화면 스탯·장비 칸·스킬 — @terra/sim의 같은 순수 함수(성장 primaryAtLevel, 장비 loadoutOf, 스킬 칸 skillSlotCount)로
// 계산한다. 기획 D-414(2차 스탯은 계산), D-417(성장), D-422·D-423(칸·올리는 스탯), D-426·D-427(스킬). 게임 앱은 결과만 받는다.
// [임시] 성장률 100‰는 48 §2.3 출발값이다(설정값 N 칸이 생기면 그 값). 시험 유닛은 저장된 스탯이 없어 기본값으로 계산한다.
import {
  ELEMENT_CODES,
  type EquipSlot,
  PRIMARY_STATS,
  type PrimaryStat,
  RULE_STAT_ORDER,
  type RosterSkills,
  type RosterSlot,
  type RosterStatBreakdown,
  type RosterStats,
} from "@terra/shared/roster";
import {
  type EquippedItem,
  type Loadout,
  type Primaries,
  UNARMED,
  explainSecondary,
  itemAt,
  loadoutOf,
  primaryAtLevel,
  skillSlotCount,
} from "@terra/sim";
import type { RosterCatalog } from "./catalog.ts";

/** [임시] 성장률(‰, 48 §2.3 출발값 0.1) */
export const GROWTH_PM = 100;

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
  /** 칸 번호(팩 unit_kinds slots의 차례) → 아이템 ID와 범위 안 자리(‰) */
  readonly equipped: ReadonlyMap<number, { readonly item: string; readonly pm: number }>;
  readonly innateSkills: readonly string[];
  readonly source: RosterStats["source"];
}

export interface BodyView {
  readonly stats: RosterStats;
  readonly slots: RosterSlot[];
  readonly skills: RosterSkills;
}

function grown(spec: BodySpec): Primaries {
  const k = spec.kPm;
  if (k === null) return spec.initial;
  const at = (stat: PrimaryStat) => primaryAtLevel(spec.initial[stat], GROWTH_PM, k[stat], spec.level);
  return { str: at("str"), dex: at("dex"), agi: at("agi"), vit: at("vit"), int: at("int"), wis: at("wis") };
}

/** 속성값 12칸이 모두 0(D-182). 사이보그가 속성값을 얻는 길이 생기면(질문 182) 저장된 값을 쓴다 */
export const NO_ELEMENTS: readonly number[] = ELEMENT_CODES.map(() => 0);

/** 사이보그 화면의 더 자세한 자료(cyborgSheet): 2차 스탯 풀이, 스킬 칸 최대·열리는 환생 횟수 */
export interface BodySheet extends BodyView {
  readonly breakdown: RosterStatBreakdown[];
  readonly skillSlotsMax: number;
  readonly skillSlotUnlocks: number[];
}

interface BodyParts {
  readonly view: BodyView;
  readonly loadout: Loadout;
  readonly skillRule: { readonly base: number; readonly perRebirth: number; readonly max: number } | null;
}

/** 몸 하나의 화면 자료. 팩에 없는 아이템·칸이 맞지 않는 아이템은 빈 칸으로 둔다(팩이 바뀌어도 화면이 깨지지 않게) */
export function bodyView(catalog: RosterCatalog, spec: BodySpec): BodyView {
  return bodyParts(catalog, spec).view;
}

/**
 * 사이보그 화면 자료: bodyView + 2차 스탯 풀이(같은 입력으로 @terra/sim explainSecondary — 값은 stats.secondary와 같다) +
 * 스킬 칸 규칙(팩 unit_kinds skillSlots: 처음 + 환생마다, 최대). 열리는 환생 횟수는 서버가 같은 skillSlotCount로 센다
 */
/** 화면 차례(PRIMARY_STATS)의 자리 — 풀이 항을 화면 차례로 놓는다 */
const screenOrder = (stat: PrimaryStat): number => PRIMARY_STATS.indexOf(stat);

export function bodySheet(catalog: RosterCatalog, spec: BodySpec): BodySheet {
  const { view, loadout, skillRule } = bodyParts(catalog, spec);
  const unlocks: number[] = [];
  if (skillRule && skillRule.perRebirth > 0) {
    let opened = view.skills.slots;
    for (let rebirths = spec.rebirths + 1; opened < skillRule.max; rebirths++) {
      const count = skillSlotCount(skillRule.base, rebirths * skillRule.perRebirth, skillRule.max);
      for (; opened < count; opened++) unlocks.push(rebirths);
    }
  }
  const breakdown = explainSecondary(loadout.primaries, catalog.combat.statTable, loadout.gear).map(
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
    skillSlotsMax: skillRule?.max ?? view.skills.slots,
    skillSlotUnlocks: unlocks,
  };
}

function bodyParts(catalog: RosterCatalog, spec: BodySpec): BodyParts {
  const kind = catalog.combat.unitKinds.find((entry) => entry.id === spec.kind);
  const slots = kind?.slots ?? [];
  const equipped: (EquippedItem | null)[] = slots.map((slot, index) => {
    const wanted = spec.equipped.get(index);
    const def = wanted ? catalog.combat.equipment.find((item) => item.id === wanted.item) : undefined;
    return wanted && def && def.slot === slot ? itemAt(def, wanted.pm) : null;
  });
  const base = grown(spec);
  const skillSlots = kind
    ? skillSlotCount(kind.skillSlots.base, spec.rebirths * kind.skillSlots.perRebirth, kind.skillSlots.max)
    : 0;
  const loadout = loadoutOf({
    base,
    slots,
    equipped,
    table: catalog.combat.statTable,
    unarmed: UNARMED,
    innateSkills: spec.innateSkills,
    skillSlots,
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
  return { view, loadout, skillRule: kind ? kind.skillSlots : null };
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
