// 아이템 미리 보기(서버가 셈한다, 설계안 3.7) — 기기는 판정 코드를 받지 않는다(경계 규칙).
// - 장비: 기준 유닛(전투 실험실 기본 유닛 = 새 사이보그 평균 1차 10·Lv 1에 기본 무기·장비, 종류·레벨·1차는 화면이 바꾼다)에 초안을
//   범위의 0·500·1000‰ 자리로 입혀 1차·2차 스탯을 입기 전·뒤로 셈한다. 유닛 화면과 같은 함수(itemAt·loadoutOf, 실효 가중치 표·행 식).
// - 무기: 칸마다 실제 공격력·명중·크리·공격 간격을 그 세계의 실효 계산식(TuningState.combatFormulas)과 판정과 같은 변수 함수
//   (@terra/shared/formula sampleScopes)로 셈한다(식을 여기에 박지 않는다). 1차 적정 스탯이 있으면 셈한 2차 적정치(D-496, WP-5 전)도.
// - 소모품: 효과 줄마다 효과 사전 값(종류·수치·값 방식·실효 지속·중첩). 문장은 화면이 메시지 키로 만든다.
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
import {
  COMBAT_FORMULA_IDS,
  COMBAT_FORMULA_SLOTS,
  type FormulaCoefficients,
  type FormulaSampleWeapon,
  evaluateFormula,
  evaluateFormulaInt,
  sampleScopes,
  staminaScoreScope,
} from "@terra/shared/formula";
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
  appropriateFromPrimaries,
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

export interface PreviewContext {
  /** 실효 전투 자료(유닛 종류·장비·스킬·실효 가중치 표) */
  readonly combat: CombatCatalog;
  /** 설정 칸 접근자(실효 계산식·계수). 없으면 팩 식·시험 계수 */
  readonly tuning: TuningState | undefined;
  readonly effects: readonly EffectEntry[];
  readonly recipes: readonly RecipeEntry[];
  /** 아이템 ID → 실효 기준 가치 */
  readonly values: ReadonlyMap<string, number>;
}

/** 기준 유닛의 기본 장비(전투 실험실 "새 사이보그" 샘플의 무기·장비, 칸 종류로 옮긴다) */
function defaultGear(): { readonly slot: SlotKind; readonly item: string; readonly pm: number }[] {
  const sample = LAB_SAMPLES.find((preset) => preset.id === "sample_new_cyborg");
  if (!sample || sample.kind !== "unit") return [];
  const unit = sample.data;
  // 새 사이보그 칸 차례(팩 unit_kinds cyborg): 0 무기·1 보조·2 머리·3 몸·4·5 장신구·6~8 인공장기
  const CYBORG: readonly SlotKind[] = [
    "weapon",
    "offhand",
    "head",
    "body",
    "accessory",
    "accessory",
    "organ",
    "organ",
    "organ",
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
    staminaAppropriate: c.stamina.appropriateScore,
    staminaMinPm: c.stamina.minConsumePm,
    evadeRelative: { ...c.evadeRelative },
  };
}

export function previewItem(
  ctx: PreviewContext,
  entry: unknown,
  unitInput: ItemPreviewUnit | undefined,
): ItemEditorPreviewResponse {
  const draft = parseDraft(entry);
  if (!draft.ok)
    return {
      ok: false,
      issues: draft.issues,
      equip: null,
      weapon: null,
      use: null,
      value: { baseValue: 0, recipes: [] },
    };
  const item = draft.item;
  const unit = unitInput ?? DEFAULT_PREVIEW_UNIT;
  const { combat } = ctx;
  const enabledSkills = new Set(combat.skills.map((skill) => skill.id));
  const def = equipDefOf(item, enabledSkills);
  let equip: ItemEditorPreviewResponse["equip"] = null;
  let weapon: ItemEditorPreviewResponse["weapon"] = null;
  let middle: Loadout | null = null;
  if (def) {
    const kind = combat.unitKinds.find((candidate) => candidate.id === unit.kind) ?? combat.unitKinds[0];
    const slots = kind?.slots ?? [];
    const byId = new Map(combat.equipment.map((gear) => [gear.id, gear]));
    const base: (EquippedItem | null)[] = slots.map(() => null);
    for (const gear of defaultGear()) {
      const at = slots.findIndex((slot, index) => slot === gear.slot && base[index] === null);
      const known = byId.get(gear.item);
      if (at >= 0 && known && known.slot === gear.slot) base[at] = itemAt(known, gear.pm);
    }
    const slotIndex = slots.indexOf(def.slot);
    const replaced = slotIndex >= 0 ? (base[slotIndex]?.item ?? null) : null;
    const skillSlots = kind ? skillSlotCount(kind.skillSlots.base, 0, kind.skillSlots.max) : 0;
    const loadout = (equipped: readonly (EquippedItem | null)[]) =>
      loadoutOf({
        base: primariesOf(unit),
        slots,
        equipped,
        table: combat.statTable,
        unarmed: kind?.naturalWeapon ?? UNARMED,
        ...(kind ? { naturalIsWeapon: kind.naturalWeaponIsWeapon } : {}),
        skillSlots,
        level: unit.level,
      });
    let error: string | null = null;
    try {
      const before = loadout(base);
      const after =
        slotIndex < 0
          ? []
          : PREVIEW_PMS.map((pm) =>
              loadout(base.map((gear, index) => (index === slotIndex ? itemAt(def, pm) : gear))),
            );
      middle = after[1] ?? null;
      const usableWith = middle ?? before;
      equip = {
        unit,
        slotIndex: slotIndex >= 0 ? slotIndex : null,
        wearable: !item.equip?.kinds || item.equip.kinds.some((ref) => ref.id === kind?.id),
        replaced,
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
      };
    } catch (caught) {
      // 1차 스탯 합이 넘쳐 계산이 던짐 등(500으로 끝내지 않고 칸 오류로 보인다, 설계안 2.4)
      error = caught instanceof RangeError ? "stat_overflow" : "preview_failed";
      equip = {
        unit,
        slotIndex: slotIndex >= 0 ? slotIndex : null,
        wearable: true,
        replaced,
        primaries: [],
        rows: [],
        skills: [],
        error,
      };
    }
  }
  const spec = def?.weapon;
  if (spec && middle) {
    const tuning = ctx.tuning;
    const formulas = tuning?.combatFormulas();
    const overridden = new Set(tuning ? [...tuning.snapshot().formulas.keys()] : []);
    const coefficients = coefficientsOf(tuning);
    const p = middle.primaries;
    const primaries = [p.str, p.dex, p.agi, p.vit, p.int, p.wis];
    const fields = (["physical", "elemental"] as const).flatMap((kind) => {
      const field = spec[kind];
      if (!field || !formulas) return [];
      const sample: FormulaSampleWeapon = {
        kind,
        attack: field.attack,
        attackAppropriate: field.attackAppropriate,
        hitPm: spec.hitPm,
        hitAppropriate: spec.hitAppropriate,
        critPm: spec.critPm,
        critAppropriate: spec.critAppropriate,
        intervalMs: spec.intervalMs,
        speedAppropriate: spec.speedAppropriate,
        staminaCost: spec.staminaCost,
        unarmed: false,
      };
      const input = { primaries, level: unit.level, rows: [], weapon: sample, coefficients };
      const staminaScore = evaluateFormulaInt(
        formulas.stamina_score,
        staminaScoreScope(primaries, coefficients.staminaWeightsPm),
      );
      const scopes = sampleScopes(input, middle?.stats ?? {}, staminaScore);
      return [
        {
          kind,
          values: COMBAT_FORMULA_IDS.filter((id) => id !== "bare_attack").map((id) => {
            const slot = COMBAT_FORMULA_SLOTS[id];
            return {
              id,
              value:
                slot.result === "int"
                  ? evaluateFormulaInt(formulas[id], scopes[id])
                  : evaluateFormula(formulas[id], scopes[id]),
              result: slot.result,
              overridden: overridden.has(id),
            };
          }),
        },
      ];
    });
    const appropriate = item.equip?.weapon?.appropriate;
    let derived: NonNullable<ItemEditorPreviewResponse["weapon"]>["derived"] = null;
    if (appropriate) {
      try {
        derived = appropriateFromPrimaries(appropriate, combat.statTable);
      } catch {
        derived = null;
      }
    }
    weapon = { fields, derived };
  }
  const use = item.use
    ? {
        lines: item.use.effects.map((part) => {
          const effect = ctx.effects.find((known) => known.id === part.effect.id);
          return {
            effect: part.effect.id,
            kind: effect?.kind ?? null,
            stat: effect?.stat ?? null,
            valueMode: effect?.valueMode ?? null,
            value: part.value,
            chancePm: part.chancePm,
            durationMs: part.durationMs ?? effect?.durationMs ?? null,
            stacking: effect?.stacking ?? null,
          };
        }),
      }
    : null;
  const values = new Map(ctx.values);
  values.set(item.id, item.baseValue);
  const recipes = ctx.recipes.flatMap((recipe) => {
    if (!recipe.enabled) return [];
    const out = recipe.outputs.find((stack) => stack.item.id === item.id);
    const cost = out ? recipeCost(recipe, item.id, values) : null;
    return out && cost !== null ? [{ id: recipe.id, cost: String(cost), outputQty: out.qty }] : [];
  });
  return { ok: true, issues: [], equip, weapon, use, value: { baseValue: item.baseValue, recipes } };
}
