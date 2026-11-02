// 계산식 탭 자료 — tRPC formulas.list(src/trpc/formulas.ts)가 D1 권한(tuning:read 두 겹)·조회 속도 제한을 거친 뒤 부른다.
// docs/adr/2026-11-01-formula-editor.md "서버·화면". 저장은 설정 칸 묶음(tuning.save의 formulas: 같은 검사·판·감사 기록)이다.
// 화면(기기)은 판정 코드를 받지 않으므로 같은 식·같은 변수 함수(@terra/shared/formula runFormulaSample)로 미리 보기를 셈한다.
// 여기서는 그 재료를 스냅숏 하나로 만든다: 칸마다 팩 식·실효 식·덮어쓰기, 무기(맨손 포함) 칸, 식 변수에 드는 설정 칸 값, 표본 유닛.
import type {
  FormulaListResponse,
  FormulaSampleView,
  FormulaSlotView,
  FormulaWeaponView,
} from "@terra/shared/formula";
import { type WeaponSpec, basicFieldOf, combatCoefficientsFrom } from "@terra/sim";
import type { RosterCatalog } from "../roster/catalog.ts";
import type { FormulaServices } from "../trpc/context.ts";
import type { TuningShared } from "../tuning/services.ts";
import type { FormulaOverrideRecord } from "../tuning/state.ts";

/**
 * 표본 유닛(화면이 고른다, 기술 출발값): 새 사이보그(1차 모두 10 = N9 합 60 ÷ 6, Lv 1)와 Lv 30 균형형(모두 10에서 자람, K 1 →
 * 10 × 3.9 = 39). 질문 문서 2026-11-01-secondary-stats-baseline.md의 두 예시 유닛과 같다
 */
export const FORMULA_SAMPLES: readonly FormulaSampleView[] = [
  { id: "new_lv1", primaries: [10, 10, 10, 10, 10, 10], level: 1 },
  { id: "even_lv30", primaries: [39, 39, 39, 39, 39, 39], level: 30 },
];

const overrideView = (record: FormulaOverrideRecord) => ({
  source: record.source,
  packSourceAtSave: record.packSource,
  contentVersionAtSave: record.contentVersion,
  note: record.note,
  updatedBy: record.updatedByName,
  updatedAt: record.updatedAtMs,
});

/** 무기 사양 → 표본 무기(기본 공격 칸) */
function weaponView(
  id: string,
  name: { ko: string; en: string },
  natural: string | null,
  weapon: WeaponSpec,
): FormulaWeaponView | null {
  const kind = basicFieldOf(weapon);
  const field = weapon[kind];
  if (!field) return null;
  return {
    id,
    name,
    natural,
    kind,
    attack: field.attack,
    // 1차 적정 스탯(D-502, 적은 칸만). 맨손은 적정 DEX·AGI를 레벨 식 bare_appropriate로 센다(unarmed)
    appropriate: weapon.unarmed === true ? {} : { ...weapon.appropriate },
    hitPm: weapon.hitPm,
    critPm: weapon.critPm,
    intervalMs: weapon.intervalMs,
    staminaCost: weapon.staminaCost,
    unarmed: weapon.unarmed === true,
  };
}

export function createFormulaServices(deps: {
  tuning: TuningShared;
  roster: RosterCatalog;
}): FormulaServices {
  const { tuning, roster } = deps;
  const { state } = tuning;
  return {
    list(): Promise<FormulaListResponse> {
      const snapshot = state.snapshot();
      const slots = state.formulaSlots.map((slot): FormulaSlotView => {
        const record = snapshot.formulas.get(slot.key);
        const source = state.formulaSource(slot.key) ?? slot.packSource;
        return {
          key: slot.key,
          group: slot.group,
          name: slot.name,
          row: slot.row ? { id: slot.row.id, shape: slot.row.shape } : null,
          packSource: slot.packSource,
          source,
          generated: slot.row !== null && slot.row.formula === undefined && record === undefined,
          override: record ? overrideView(record) : null,
        };
      });
      const { combat } = roster;
      // 무기: 유닛 종류의 타고난 무기(사람형 맨손·크리쳐 발톱) → 팩 무기 아이템
      const weapons = [
        ...combat.unitKinds.map((kind) =>
          weaponView(`natural_${kind.id}`, { ko: kind.id, en: kind.id }, kind.id, kind.naturalWeapon),
        ),
        ...combat.equipment.map((item) =>
          item.weapon
            ? weaponView(
                item.id,
                roster.names.items[item.id] ?? { ko: item.id, en: item.id },
                null,
                item.weapon,
              )
            : null,
        ),
      ].filter((weapon): weapon is FormulaWeaponView => weapon !== null);
      const c = combatCoefficientsFrom(snapshot.values);
      return Promise.resolve({
        contentVersion: tuning.pack.contentVersion,
        revision: snapshot.revision,
        slots,
        weapons,
        coefficients: {
          capPm: c.appropriateCapPm,
          critSpreadPm: c.critSpreadPm,
          staminaWeightsPm: [...c.stamina.scoreWeightsPm],
          staminaAppropriate: c.stamina.appropriateScore,
          staminaMinPm: c.stamina.minConsumePm,
          evadeRelative: { ...c.evadeRelative },
        },
        samples: FORMULA_SAMPLES,
      });
    },
  };
}
