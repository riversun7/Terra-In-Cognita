// 아이템 편집기 미리 보기 자료 모양(items.preview) — 서버가 그 세계의 실효 자료·계산식으로 셈하고 화면은 보이기만 한다(설계안 3.7).
// docs/adr/2026-11-01-item-editor.md 3절·"바뀜 (2026-11-02)". itemEditor.ts가 다시 내보낸다(파일 크기, AGENTS 4장).
// 새로 더한 칸은 선택 칸이다: PWA 기기는 서버보다 옛것이거나 새것일 수 있어 화면은 칸이 없을 때도 돈다.
import type { ContentIssueView, LocalizedName } from "./contentEdit.ts";
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

/** 무기 몫(D-502, 사용자 답 296~298): 물리·속성 공격 몫(STR·INT), 명중·크리(DEX), 공격 간격(AGI) */
export const WEAPON_PART_IDS = ["physical", "elemental", "hit", "crit", "speed"] as const;
export type WeaponPartId = (typeof WEAPON_PART_IDS)[number];

/** 무기 몫 하나의 비율: 기준 유닛 1차 ÷ 무기 적정 1차, 상한 N10(1000‰). 적정이 없으면 1000‰(무기 값 그대로) */
export interface WeaponPartRatio {
  readonly part: WeaponPartId;
  /** 그 몫이 보는 1차(물리 str·속성 int·명중과 크리 dex·공격 간격 agi) */
  readonly stat: "str" | "int" | "dex" | "agi";
  /** 기준 유닛의 그 1차(가운데 자리 장비 포함) */
  readonly value: number;
  /** 무기의 적정 1차(없으면 null = 비율 100%) */
  readonly appropriate: number | null;
  readonly ratioPm: number;
}

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

/**
 * 사용 효과 한 줄의 셈(D-496 286, D-501 "적정 스탯"): 기준 값 × min(상한, 기준 유닛 스탯 ÷ 적정 스탯) × (1 ± 오차).
 * 셈은 서버가 @terra/sim useAmountRange로 한다. 실행은 소비 줄기(보유 물건 뒤)
 */
export interface UseAmount {
  /** 비례 스탯(없으면 null = 기준 값 그대로) */
  readonly stat: ItemPrimaryCode | null;
  /** 기준 유닛의 그 스탯 값(비례 스탯이 없으면 0) */
  readonly statValue: number;
  /** 적정 스탯(비례 스탯이 없으면 null) */
  readonly appropriate: number | null;
  /** 기준 값에 곱하는 비율(‰) = min(상한, 스탯 ÷ 적정 스탯). 비례 스탯이 없으면 1000 */
  readonly ratioPm: number;
  /** 비율 상한(‰, 무기 효율과 같은 설정 칸 N10 실효 값) */
  readonly capPm: number;
  /** 오차 전 가운데 값 = 기준 값 × 비율 ÷ 1000(내림) */
  readonly scaled: number;
  /** ±오차‰(줄 값, 없으면 설정 칸 d496_use_variance) */
  readonly variancePm: number;
  /** 오차를 얹은 범위(내림) */
  readonly min: number;
  readonly max: number;
}

/**
 * 채집 티어 추첨 미리 보기(D-506, 49 N43): 초안이 추첨 시설 사다리(그 시설 gather.subcategory)에 있을 때. 셈은 서버가 @terra/sim
 * gatherStat·gatherChancesPm으로 한다(기준 유닛의 primary + secondary, 시설 Lv1~5, 실효 레벨 보너스·확률표)
 */
export interface ItemGatherPreview {
  readonly facility: string;
  readonly facilityName: LocalizedName;
  readonly primary: ItemPrimaryCode;
  readonly secondary: ItemPrimaryCode;
  /** 기준 유닛의 primary + secondary */
  readonly unitStat: number;
  /** 시설 레벨당 유효 스탯 보너스(설정 칸 N43 n43_level_bonus 실효 값) */
  readonly levelBonus: number;
  /**
   * 시설 Lv1~5마다: 유효 스탯, 든 구간(bands 번호), 묶음 하나에서 이 아이템이 나올 확률(만분율, 버림). 뽑은 티어에 켜진 아이템이
   * 없으면 더 낮은 티어로 내려가므로 높은 티어 몫이 이 아이템에 모일 수 있다. 같은 티어에 여럿이면 나눈다
   */
  readonly levels: readonly {
    readonly level: number;
    readonly stat: number;
    readonly band: number;
    readonly chanceBp: number;
  }[];
  /** 확률표(실효): 구간 시작·끝(마지막은 null = 위 끝 없음)·T0~T9 가중치(‰) */
  readonly bands: readonly {
    readonly from: number;
    readonly to: number | null;
    readonly weightsPm: readonly number[];
  }[];
  /** 초안 티어(확률표에서 표시할 열) */
  readonly tier: number;
  /** 이 티어의 켜진 같은 중분류 아이템 수(초안 포함, 초안이 꺼져 있으면 0일 수 있다) */
  readonly sameTier: number;
  /** 초안이 꺼져 있으면 거짓(세계에서 나오지 않는다) */
  readonly enabled: boolean;
  /**
   * 채집 방식: roll = 확률표 추첨(levels·bands), select = 선택 + 효율(농장·목장, 49 P8): 해금 티어 = min(⌊(주 + 보조) ÷ 20⌋, 9)에서
   * 켜진 아이템이 있는 가장 높은 티어를 고른다(레벨 보너스 없음, levels의 band는 -1)
   */
  readonly mode: "roll" | "select";
  /** select면 기준 유닛의 해금 티어. roll이면 null */
  readonly unitTier: number | null;
  /**
   * 옛 1차 생산 규칙(D-507, 49 N32·N44): 주 스탯 → 진행 속도 max(1, ⌊주 ÷ divisor⌋), 보조 스탯 → 한 번 캘 때 개수
   * min(cap, base + ⌊보조 × perStatPm ÷ 1000⌋), 이 티어 한 번 = 필요 진행 max(30, 30 + 티어 × 30) × 진행 1의 시간
   */
  readonly work: ItemGatherWork;
}

/** 채집 미리 보기의 진행·수확량(옛 1차 생산 규칙, D-507). 셈은 서버 @terra/sim gatherProgress·gatherYield·tierRequiredProgress */
export interface ItemGatherWork {
  /** 진행 나눔(설정 칸 N32 n32_main_divisor 실효 값) */
  readonly divisor: number;
  /** 수확량 규칙(시설 칸, 없으면 기본 1 + 설정 칸 N32 n32_sub_yield, 상한 없음 = null) */
  readonly yieldBase: number;
  readonly yieldPerStatPm: number;
  readonly yieldCap: number | null;
  /** 이 티어 한 번의 필요 진행(N44)·진행 1의 시간(ms, N44 n44_tick_ms) */
  readonly requiredProgress: number;
  readonly tickMs: number;
  /** 광석 한 번 = g(N44 n44_ore_grams). 초안이 기본 단위 g·묶음 > 1인 아이템이 아니면 null */
  readonly harvestGrams: number | null;
  /** 기준 유닛의 주·보조 스탯과 그때 진행 속도·한 번에 개수·이 티어 한 번 시간(ms, 일꾼 한 명) */
  readonly unitPrimary: number;
  readonly unitSecondary: number;
  readonly unitProgress: number;
  readonly unitYield: number;
  readonly unitHarvestMs: number;
  /** 스탯 표(주·보조가 같은 값일 때): 진행 속도·한 번에 개수·이 티어 한 번 시간(ms) */
  readonly rows: readonly {
    readonly stat: number;
    readonly progress: number;
    readonly yield: number;
    readonly harvestMs: number;
  }[];
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
    /** 기준 유닛(가운데 자리)의 몫마다 비율(D-502: 1차 ÷ 무기 적정 1차, 상한 N10) */
    readonly parts?: readonly WeaponPartRatio[] | undefined;
    /** 비율 상한(‰, 설정 칸 N10 실효 값) */
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
  /** 채집 티어 추첨(추첨 시설 사다리에 없는 아이템·옛 서버면 null 또는 없음) */
  readonly gather?: ItemGatherPreview | null | undefined;
  readonly value: {
    /** 시작 시세(295: 시장의 첫 가격) */
    readonly startPrice: number;
    /** 이 아이템을 만드는 레시피마다 원가(입력 시작 시세 합 ÷ 출력 수량, 최소 단위 정수 글자) */
    readonly recipes: readonly { readonly id: string; readonly cost: string; readonly outputQty: number }[];
  };
}
