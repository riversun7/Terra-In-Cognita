// 아이템 편집기 미리 보기 자료 모양(items.preview) — 서버가 그 세계의 실효 자료·계산식으로 셈하고 화면은 보이기만 한다(설계안 3.7).
// docs/adr/2026-11-01-item-editor.md 3절·"바뀜 (2026-11-02)". itemEditor.ts가 다시 내보낸다(파일 크기, AGENTS 4장).
// 새로 더한 칸은 선택 칸이다: PWA 기기는 서버보다 옛것이거나 새것일 수 있어 화면은 칸이 없을 때도 돈다.
import type { ContentIssueView } from "./contentEdit.ts";
import type { ItemPrimaryCode } from "./itemEditor.ts";

/** 미리 보기 기준 유닛(화면이 바꾼다) */
export interface ItemPreviewUnit {
  readonly kind: string;
  readonly level: number;
  /** 1차 6개(ITEM_PRIMARY_CODES 차례 이름) */
  readonly primaries: Readonly<Record<ItemPrimaryCode, number>>;
}

/** 기본 미리 보기 유닛: 새 사이보그 평균(1차 모두 10, Lv 1, D-467 ①). 기본 무기·장비는 서버가 붙인다(전투 실험실 기본 유닛) */
export const DEFAULT_PREVIEW_UNIT: ItemPreviewUnit = {
  kind: "cyborg",
  level: 1,
  primaries: { str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 },
};

/** 미리 보기 자리(범위의 ‰): 최소·가운데·최대 */
export const PREVIEW_PMS = [0, 500, 1000] as const;

/** 전투 식 값 하나(그 세계의 실효 계산식으로 셈, 결과 단위) */
export interface ItemFormulaValue {
  readonly id: string;
  /** int 칸은 정수, fixed 칸은 1000배 정수 */
  readonly value: number;
  readonly result: "int" | "fixed";
  /** 그 세계에서 덮어쓴 식인가(아니면 팩 식) */
  readonly overridden: boolean;
}

/** 무기 적정치가 쓰는 2차 행(물리·속성 공격력·명중·크리·행동 속도, D-420 무기 틀의 분모) */
export const APPROPRIATE_ROW_IDS = [
  "physical_attack",
  "elemental_attack",
  "hit",
  "crit_chance",
  "action_speed",
] as const;
export type AppropriateRowId = (typeof APPROPRIATE_ROW_IDS)[number];

/** 끼웠지만 쓰지 않은 장비(양손 무기를 든 동안의 보조 칸, 그 종류가 입을 수 없음) */
export interface ItemPreviewIgnored {
  /** 칸 번호(그 종류 칸 차례) */
  readonly index: number;
  readonly item: string;
  readonly reason: "two_handed" | "kind";
}

/** 입기 전·뒤 값(가운데 자리) */
export interface BeforeAfter<T> {
  readonly before: T;
  readonly after: T;
}

/** 1차 적정 스탯 → 2차 적정치 풀이 한 줄(예: physical_attack = STR 25 × 2.0 + DEX 15 × 0.6 = 59) */
export interface AppropriateTerms {
  readonly row: AppropriateRowId;
  readonly value: number;
  /** 양 모양 행의 기본 */
  readonly base: number;
  /** 가중치 항(가중치가 0이 아닌 1차만) */
  readonly terms: readonly {
    readonly stat: ItemPrimaryCode;
    readonly value: number;
    readonly weightPm: number;
  }[];
  /** 행 식으로 셈한 행이면 식 글(가중치 항 대신) */
  readonly formula: string | null;
}

/** 기준 유닛의 무기 효율 한 칸: 비율 = min(상한, 유닛 값 ÷ 적정치)(D-420 무기 틀, 적정치 0 이하면 무기 값 그대로 = 1000‰) */
export interface WeaponEfficiency {
  readonly row: AppropriateRowId;
  /** 기준 유닛의 그 행 값(가운데 자리 장비) */
  readonly stat: number;
  /** 전투가 쓰는 적정치(1차 적정 스탯이 있으면 셈한 값) */
  readonly appropriate: number;
  readonly ratioPm: number;
}

/** 사용 효과 한 줄의 셈(기준 유닛 스탯 비례·±오차, D-496 286). 실행은 소비 줄기(보유 물건 뒤) */
export interface UseAmount {
  /** 비례 스탯(없으면 null = 기준 값 그대로) */
  readonly stat: ItemPrimaryCode | null;
  /** 기준 유닛의 그 스탯 값 */
  readonly statValue: number;
  /** 스탯 1점마다 더하는 ‰(기준 값에 대해) */
  readonly pmPerPoint: number;
  /** 스탯을 얹은 값 = 기준 값 × (1000 + 스탯 × ‰) ÷ 1000(내림) */
  readonly scaled: number;
  /** ±오차‰(줄 값, 없으면 설정 칸 d496_use_variance) */
  readonly variancePm: number;
  /** 오차를 얹은 범위(내림) */
  readonly min: number;
  readonly max: number;
}

export interface ItemEditorPreviewResponse {
  readonly ok: boolean;
  /** 초안이 팩 스키마에 걸리면 그 문제(미리 보기는 하지 않는다) */
  readonly issues: readonly ContentIssueView[];
  readonly equip: {
    readonly unit: ItemPreviewUnit;
    /** 초안을 끼운 칸 번호(그 종류에 칸이 없으면 null) */
    readonly slotIndex: number | null;
    /** kinds가 있고 이 종류가 없으면 거짓(그 장비는 입히지 않고 셈한다, D-494) */
    readonly wearable: boolean;
    /** 그 칸에서 빠진 기본 장비 ID */
    readonly replaced: string | null;
    readonly primaries: readonly {
      readonly stat: ItemPrimaryCode;
      readonly before: number;
      readonly after: readonly number[];
    }[];
    readonly rows: readonly {
      readonly id: string;
      readonly shape: "quantity" | "probability";
      readonly before: number;
      readonly after: readonly number[];
    }[];
    /** 장비 스킬마다 이 무기로 쓸 수 있나(D-490) */
    readonly skills: readonly { readonly id: string; readonly usable: boolean }[];
    /** 1차 스탯 합이 넘쳐 계산할 수 없음 등(코드) */
    readonly error: string | null;
    /** 끼웠지만 쓰지 않은 장비(가운데 자리, 아이템 편집기 WP-5) */
    readonly ignored?: readonly ItemPreviewIgnored[] | undefined;
    /** 속성값 12칸·저항‰ 12칸·고정 방어·관통‰(가운데 자리, 입기 전·뒤. 속성값은 칸마다 10에서 자름) */
    readonly gear?:
      | {
          readonly elements: BeforeAfter<readonly number[]>;
          readonly resistPm: BeforeAfter<readonly number[]>;
          readonly defenseFlat: BeforeAfter<number>;
          readonly penetrationPm: BeforeAfter<number>;
        }
      | undefined;
  } | null;
  readonly weapon: {
    /** 공격력 칸마다 전투 식 값(가운데 자리 유닛 기준) */
    readonly fields: readonly {
      readonly kind: "physical" | "elemental";
      readonly values: readonly ItemFormulaValue[];
    }[];
    /** 1차 적정 스탯으로 셈한 2차 적정치(D-496). 전투가 이 값을 쓴다(WP-5) */
    readonly derived: {
      readonly physicalAttack: number;
      readonly elementalAttack: number;
      readonly hit: number;
      readonly crit: number;
      readonly speed: number;
    } | null;
    /** 셈한 적정치의 풀이(1차 적정 스탯이 있을 때) */
    readonly derivedTerms?: readonly AppropriateTerms[] | null | undefined;
    /** 기준 유닛(가운데 자리)의 효율: 칸마다 유닛 값 ÷ 적정치 */
    readonly efficiency?: readonly WeaponEfficiency[] | undefined;
    /** 효율 상한(‰, 설정 칸 N10 실효 값) */
    readonly capPm?: number | undefined;
  } | null;
  readonly use: {
    readonly lines: readonly {
      readonly effect: string;
      readonly kind: "buff" | "debuff" | "dot" | "heal" | "status" | null;
      readonly stat: string | null;
      readonly valueMode: "flat" | "permille" | null;
      readonly value: number;
      readonly chancePm: number;
      /** 실효 지속(ms, 줄에 없으면 효과 사전 기본값. 0 = 전투 내내) */
      readonly durationMs: number | null;
      readonly stacking: "refresh" | "stack" | "ignore" | null;
      /** 기준 유닛으로 셈한 효과량 범위(스탯 비례·±오차, D-496 286) */
      readonly amount?: UseAmount | undefined;
      /** 효과 사전의 배타 묶음(D-472: 같은 묶음은 한 출처만, 센 것이 이김) */
      readonly exclusive?: string | null | undefined;
    }[];
  } | null;
  readonly value: {
    readonly baseValue: number;
    /** 이 아이템을 만드는 레시피마다 원가(입력 기준 가치 합 ÷ 출력 수량, 최소 단위 정수 글자) */
    readonly recipes: readonly { readonly id: string; readonly cost: string; readonly outputQty: number }[];
  };
}
