// 계산식 탭 자료 모양 — 서버 tRPC formulas.list와 개발자 화면(밸런스 화면 계산식 탭)이 같이 쓴다.
// docs/adr/2026-11-01-formula-editor.md "서버·화면". 저장은 설정 칸 묶음(tuning.save의 formulas)으로 한다.
import type { FormulaCoefficients, FormulaSampleWeapon } from "./formulaSample.ts";

/** 식 덮어쓰기 하나(화면) */
export interface FormulaOverrideView {
  readonly source: string;
  /** 저장할 때의 팩 식. 지금 팩 식과 다르면 "팩 식이 바뀜" */
  readonly packSourceAtSave: string;
  readonly contentVersionAtSave: string;
  readonly note: string | null;
  readonly updatedBy: string | null;
  /** ms */
  readonly updatedAt: number;
}

/** 식 칸 하나(화면) */
export interface FormulaSlotView {
  /** 칸 키: 전투 식 ID 또는 `<행 ID>.formula` */
  readonly key: string;
  readonly group: "stat" | "combat";
  readonly name: { readonly ko: string; readonly en: string };
  /** 행 식이면 행 ID·모양 */
  readonly row: { readonly id: string; readonly shape: "quantity" | "probability" } | null;
  /** 팩 식(행 식은 팩 formula, 없으면 팩 가중치에서 만든 식) */
  readonly packSource: string;
  /** 실효 식(덮어쓰기 → 팩 식, 행 식은 덮어쓴 가중치에서 만든 식) */
  readonly source: string;
  /** 실효 식이 가중치에서 만든 식인가(행 식이 따로 없음) */
  readonly generated: boolean;
  readonly override: FormulaOverrideView | null;
}

/** 표본 무기(기본 공격 칸) + 이름 */
export interface FormulaWeaponView extends FormulaSampleWeapon {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
  /** 유닛 종류의 타고난 무기면 그 종류 ID(맨손 이름은 화면 메시지), 아이템이면 null */
  readonly natural: string | null;
}

/** 표본 유닛(화면이 고른다) */
export interface FormulaSampleView {
  readonly id: string;
  /** 1차 6개(STR·DEX·AGI·VIT·INT·WIS 차례) */
  readonly primaries: readonly number[];
  readonly level: number;
}

/** 세계 성장 설정 스냅숏(N5·N6·N7 — 2차 스탯 에디터 곡선 기준) */
export interface FormulaGrowthSettings {
  readonly growthPm: number;
  readonly kMinPm: number;
  readonly kMaxPm: number;
  readonly maxLevel: number;
}

export interface FormulaListResponse {
  readonly contentVersion: string;
  /** 세계 설정 판(tuning.save의 expectedRevision) */
  readonly revision: number;
  readonly slots: readonly FormulaSlotView[];
  readonly weapons: readonly FormulaWeaponView[];
  readonly coefficients: FormulaCoefficients;
  readonly samples: readonly FormulaSampleView[];
  readonly growth?: FormulaGrowthSettings;
}
