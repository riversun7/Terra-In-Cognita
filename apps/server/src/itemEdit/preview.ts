// 아이템 미리 보기(서버가 셈한다, 설계안 3.7) — 기기는 판정 코드를 받지 않는다(경계 규칙).
// - 장비: 기준 유닛(전투 실험실 기본 유닛 = 새 사이보그 평균 1차 10·Lv 1에 기본 무기·장비, 종류·레벨·1차는 화면이 바꾼다)에 초안을
//   범위의 0·500·1000‰ 자리로 입혀 1차·2차 스탯을 입기 전·뒤로 셈한다. 유닛 화면과 같은 함수(itemAt·loadoutOf, 실효 가중치 표·행 식).
//   전투 연결(아이템 편집기 WP-5): 속성값·저항·고정 방어·관통(입기 전·뒤), 양손 무기의 보조 칸·입을 수 없는 종류(ignored)도 보인다.
// - 무기: previewWeapon.ts(실효 계산식 값, 1차 적정 스탯으로 셈한 2차 적정치와 풀이, 기준 유닛 효율).
// - 소모품: previewUse.ts(효과 줄마다 효과 사전 값과 기준 유닛 스탯 ÷ 적정 스탯·상한 N10·±오차 범위, D-496 286·D-501).
// - 값: 이 아이템을 만드는 레시피마다 원가(BigInt, 글자로 보낸다).
import {
  type EffectEntry,
  type ItemEntry,
  type RecipeEntry,
  formatPath,
  itemEntrySchema,
  koreanErrorMap,
  zodIssueCode,
} from "@terra/content";
import type { FormulaCoefficients } from "@terra/shared/formula";
import {
  DEFAULT_PREVIEW_UNIT,
  ITEM_PRIMARY_CODES,
  type ItemEditorPreviewResponse,
  type ItemPreviewUnit,
  PREVIEW_PMS,
} from "@terra/shared/itemEditor";
import type { ContentIssueView } from "@terra/shared/contentEdit";
import {
  type CombatCatalog,
  type EquippedItem,
  type Loadout,
  type SlotKind,
  UNARMED,
  combatCoefficientsFrom,
  equipDefOf,
  itemAt,
  loadoutOf,
  skillSlotCount,
  skillUsable,
  weaponFieldsOf,
} from "@terra/sim";
import { LAB_SAMPLES } from "../battleLab/samples.ts";
import type { TuningState } from "../tuning/state.ts";
import { recipeCost } from "./advice.ts";
import { type GatherContext, type GatherItem, previewGather } from "./previewGather.ts";
import { previewUse } from "./previewUse.ts";
import { previewWeapon } from "./previewWeapon.ts";

export interface PreviewContext {
  /** 실효 전투 자료(유닛 종류·장비·스킬·실효 가중치 표) */
  readonly combat: CombatCatalog;
  /** 설정 칸 접근자(실효 계산식·계수). 없으면 팩 식·시험 계수 */
  readonly tuning: TuningState | undefined;
  readonly effects: readonly EffectEntry[];
  readonly recipes: readonly RecipeEntry[];
  /** 아이템 ID → 실효 시작 시세(295: 시장이 처음 열릴 때의 첫 가격) */
  readonly values: ReadonlyMap<string, number>;
  /** 채집 티어 추첨(D-506): 팩 시설·확률표·실효 레벨 보너스와 실효 아이템(사다리). 없으면 미리 보기 gather 칸 null */
  readonly gather?: (GatherContext & { readonly items: readonly GatherItem[] }) | undefined;
}

/** 기준 유닛의 기본 장비(전투 실험실 "새 사이보그" 샘플의 무기·장비, 칸 종류로 옮긴다) */
function defaultGear(): { readonly slot: SlotKind; readonly item: string; readonly pm: number }[] {
  const sample = LAB_SAMPLES.find((preset) => preset.id === "sample_new_cyborg");
  if (!sample || sample.kind !== "unit") return [];
  const unit = sample.data;
  // 새 사이보그 칸 차례(팩 unit_kinds cyborg의 앞 9칸): 0 무기·1 보조무기·2 헬멧·3 갑옷·4·5 반지·6 심장·7 헤드·8 바디.
  // 샘플 장비는 이 앞 칸만 쓴다(뒤 칸 = 장갑·신발·토템·목걸이·팔·다리·임플란트 5, docs/adr/2026-11-24-unit-cyborg-unify.md)
  const CYBORG: readonly SlotKind[] = [
    "weapon",
    "offhand",
    "head",
    "body",
    "ring",
    "ring",
    "organ_heart",
    "organ_head",
    "organ_body",
  ];
  return [
    ...(unit.weapon.kind === "item"
      ? [{ slot: "weapon" as const, item: unit.weapon.id, pm: unit.weapon.pm }]
      : []),
    ...unit.equipment.flatMap((entry) => {
      const slot = CYBORG[entry.slot];
      return slot ? [{ slot, item: entry.item, pm: entry.pm }] : [];
    }),
  ];
}

/** 초안을 팩 스키마로만 읽는다(참조는 보지 않는다). 틀리면 문제 목록 */
export function parseDraft(
  entry: unknown,
): { ok: true; item: ItemEntry } | { ok: false; issues: ContentIssueView[] } {
  const result = itemEntrySchema.safeParse(entry, { error: koreanErrorMap });
  if (result.success) return { ok: true, item: result.data };
  const id = typeof entry === "object" && entry !== null ? Reflect.get(entry, "id") : undefined;
  return {
    ok: false,
    issues: result.error.issues.map((issue) => {
      const coded = zodIssueCode(issue);
      return {
        level: "error",
        file: "items.json",
        id: typeof id === "string" ? id : null,
        path: formatPath(issue.path),
        code: coded.code ?? null,
        params: coded.params ?? {},
        message: issue.message,
      };
    }),
  };
}

const primariesOf = (unit: ItemPreviewUnit) => ({
  str: unit.primaries.str,
  dex: unit.primaries.dex,
  agi: unit.primaries.agi,
  vit: unit.primaries.vit,
  int: unit.primaries.int,
  wis: unit.primaries.wis,
});

/** 식 변수에 드는 설정 칸 값(계산식 탭 FormulaServices와 같다) */
function coefficientsOf(tuning: TuningState | undefined): FormulaCoefficients {
  const c = combatCoefficientsFrom(tuning?.values() ?? new Map());
  return {
    capPm: c.appropriateCapPm,
    critSpreadPm: c.critSpreadPm,
    staminaWeightsPm: [...c.stamina.scoreWeightsPm],
    staminaMinPm: c.stamina.minConsumePm,
    evadeRelative: { ...c.evadeRelative },
  };
}

type EquipPreview = NonNullable<ItemEditorPreviewResponse["equip"]>;

/** 장비 미리 보기: 기본 장비에 초안을 자리마다 입혀 셈한다. 가운데 자리 몸(무기 미리 보기가 쓴다)도 돌려준다 */
function previewEquip(
  ctx: PreviewContext,
  item: ItemEntry,
  unit: ItemPreviewUnit,
): { equip: EquipPreview; middle: Loadout | null; def: ReturnType<typeof equipDefOf> } {
  const { combat } = ctx;
  const enabledSkills = new Set(combat.skills.map((skill) => skill.id));
  // 전투 자료와 같은 변환(무기의 1차 적정 스탯 D-502는 무기 사양 칸 그대로)
  const def = equipDefOf(item, enabledSkills);
  const kind = combat.unitKinds.find((candidate) => candidate.id === unit.kind) ?? combat.unitKinds[0];
  const slots = kind?.slots ?? [];
  const byId = new Map(combat.equipment.map((gear) => [gear.id, gear]));
  const base: (EquippedItem | null)[] = slots.map(() => null);
  for (const gear of defaultGear()) {
    const at = slots.findIndex((slot, index) => slot === gear.slot && base[index] === null);
    const known = byId.get(gear.item);
    if (at >= 0 && known && known.slot === gear.slot) base[at] = itemAt(known, gear.pm);
  }
  const slotIndex = def ? slots.indexOf(def.slot) : -1;
  const replaced = slotIndex >= 0 ? (base[slotIndex]?.item ?? null) : null;
  const wearable = !item.equip?.kinds || item.equip.kinds.some((ref) => ref.id === kind?.id);
  const skillSlots = kind ? skillSlotCount(kind.skillSlots.base, 0, kind.skillSlots.max) : 0;
  const loadout = (equipped: readonly (EquippedItem | null)[]) =>
    loadoutOf({
      base: primariesOf(unit),
      slots,
      equipped,
      table: combat.statTable,
      unarmed: kind?.naturalWeapon ?? UNARMED,
      ...(kind ? { naturalIsWeapon: kind.naturalWeaponIsWeapon, kind: kind.id } : {}),
      skillSlots,
      level: unit.level,
    });
  const shell = { unit, slotIndex: slotIndex >= 0 ? slotIndex : null, wearable, replaced };
  if (!def)
    return { equip: { ...shell, primaries: [], rows: [], skills: [], error: null }, middle: null, def };
  try {
    const before = loadout(base);
    const after =
      slotIndex < 0
        ? []
        : PREVIEW_PMS.map((pm) =>
            loadout(base.map((gear, index) => (index === slotIndex ? itemAt(def, pm) : gear))),
          );
    const middle = after[1] ?? null;
    const usableWith = middle ?? before;
    const mid = middle ?? before;
    return {
      middle,
      def,
      equip: {
        ...shell,
        primaries: ITEM_PRIMARY_CODES.map((stat) => ({
          stat,
          before: before.primaries[stat],
          after: after.map((value) => value.primaries[stat]),
        })),
        rows: combat.statTable.map((row) => ({
          id: row.id,
          shape: row.shape,
          before: before.stats[row.id] ?? 0,
          after: after.map((value) => value.stats[row.id] ?? 0),
        })),
        skills: def.skills.map((id) => {
          const data = combat.skills.find((skill) => skill.id === id);
          const fields = usableWith.bareHanded ? [] : weaponFieldsOf(usableWith.weapon);
          return {
            id,
            usable: data
              ? skillUsable(
                  { weaponFields: fields },
                  { bareHand: data.bareHand, weaponField: data.weaponField ?? data.base },
                )
              : false,
          };
        }),
        error: null,
        ignored: mid.ignored.map((entry) => ({ ...entry })),
        gear: {
          elements: { before: [...before.elements], after: [...mid.elements] },
          resistPm: { before: [...before.resistPm], after: [...mid.resistPm] },
          defenseFlat: { before: before.defenseFlat, after: mid.defenseFlat },
          penetrationPm: { before: before.penetrationPm, after: mid.penetrationPm },
        },
      },
    };
  } catch (caught) {
    // 칸 묶음이 틀린 초안 등(500으로 끝내지 않고 칸 오류로 보인다, 설계안 2.4). 1차 합 넘침은 loadoutOf가 자른다
    const error = caught instanceof RangeError ? "stat_overflow" : "preview_failed";
    return { middle: null, def, equip: { ...shell, primaries: [], rows: [], skills: [], error } };
  }
}

export function previewItem(
  ctx: PreviewContext,
  entry: unknown,
  unitInput: ItemPreviewUnit | undefined,
  /** 소모품 효과량의 기본 ±오차‰(설정 칸 d496_use_variance 실효 값. 상한은 무기와 같은 N10 실효 값을 여기서 읽는다) */
  useVariancePm = 0,
): ItemEditorPreviewResponse {
  const draft = parseDraft(entry);
  if (!draft.ok)
    return {
      ok: false,
      issues: draft.issues,
      equip: null,
      weapon: null,
      use: null,
      value: { startPrice: 0, recipes: [] },
    };
  const item = draft.item;
  const unit = unitInput ?? DEFAULT_PREVIEW_UNIT;
  let equip: ItemEditorPreviewResponse["equip"] = null;
  let weapon: ItemEditorPreviewResponse["weapon"] = null;
  if (item.equip) {
    const shown = previewEquip(ctx, item, unit);
    equip = shown.equip;
    const spec = shown.def?.weapon;
    if (spec && shown.middle)
      weapon = previewWeapon({
        spec,
        middle: shown.middle,
        level: unit.level,
        tuning: ctx.tuning,
        coefficients: coefficientsOf(ctx.tuning),
      });
  }
  const use = item.use
    ? previewUse(item.use, ctx.effects, unit, {
        capPm: coefficientsOf(ctx.tuning).capPm,
        variancePm: useVariancePm,
      })
    : null;
  const values = new Map(ctx.values);
  values.set(item.id, item.startPrice);
  const recipes = ctx.recipes.flatMap((recipe) => {
    if (!recipe.enabled) return [];
    const out = recipe.outputs.find((stack) => stack.item.id === item.id);
    const cost = out ? recipeCost(recipe, item.id, values) : null;
    return out && cost !== null ? [{ id: recipe.id, cost: String(cost), outputQty: out.qty }] : [];
  });
  const gather = ctx.gather
    ? previewGather(
        ctx.gather,
        {
          id: item.id,
          subcategory: item.subcategory?.id,
          tier: item.tier,
          enabled: item.enabled,
          lotSize: item.lotSize,
        },
        ctx.gather.items,
        unit,
      )
    : null;
  return {
    ok: true,
    issues: [],
    equip,
    weapon,
    use,
    gather,
    value: { startPrice: item.startPrice, recipes },
  };
}
