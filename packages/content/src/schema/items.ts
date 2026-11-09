// 아이템 분류 — 항목(공통 칸 + 대분류별 묶음 equip·perish·use)과 분류 자료(중분류·태그·무기 종류).
// docs/adr/2026-11-01-item-editor.md 2절, 설계안 docs/research/2026-11-01-item-editor-design.md 2장.
// 기획: 9대분류(D-5029·D-5033)·티어(D-5001)·켬/끔(D-398)·무게(D-117)·계정 귀속(D-7014·D-270)·창고(D-121)·식재료 계열(D-472)·
// 신선도(D-285, 0이 되면 다른 아이템으로 D-496)·사용 효과(D-425, 효과량은 쓰는 유닛 스탯 비례 D-496)·무기 종류·탄약 연결(48 §5.5,
// 화살·탄약은 보조무기 칸 D-496).
// 새 칸은 모두 선택 칸이다: 지금 팩 항목과 직전 판 앱이 그대로 돈다(형식 판 그대로). 읽는 곳은 칸마다 따로 붙인다(없으면 지금 동작).
// 여러 칸을 함께 보는 검사는 superRefine이다(필드 검사가 실패해도 불리므로 값의 모양을 다시 본다, AGENTS 6장 Zod 4.6.7).
// 문제마다 params.rule에 규칙 코드를 단다(편집기가 메시지 키로 보인다, issue.ts code).
import { z } from "zod";
import { PRIMARY_STAT_CODES, equipSchema } from "./combat.ts";
import { contentId, localizedText, ref } from "./common.ts";

/** 아이템 대분류(D-5029·D-5033, 생산 흐름 순). 대분류마다 붙는 칸 묶음이 정해져 있어 코드 목록이다 */
export const ITEM_CATEGORIES = [
  "raw",
  "processed",
  "part",
  "equipment",
  "consumable",
  "gem",
  "construction",
  "document",
  "precious",
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

/** 신선도(perish)를 둘 수 있는 대분류: 식재료(원자재)·훈제·절임(가공 재료)·음식(식품) */
export const PERISH_CATEGORIES: readonly string[] = ["raw", "processed", "consumable"];

/** 보관 창고(D-121): 식량 창고·무기고·일반 창고·저장 탱크(원유 등) */
export const STORAGE_KINDS = ["food", "armory", "general", "tank"] as const;
/** 식재료 계열(D-472 요리 버프 스탯): 농작물 INT·WIS, 목축 STR·VIT, 낚시 DEX·AGI */
export const FOOD_FAMILIES = ["crop", "livestock", "fishing"] as const;
/** 무기 종류가 들어가는 칸(무기 칸 무기·보조 칸 방패·화살통·탄창 등) */
export const WEAPON_TYPE_SLOTS = ["weapon", "offhand"] as const;

/** 아이템 칸 범위(편집기 입력 칸·서버 검사가 같은 값. @terra/shared/itemEditor ITEM_LIMITS와 시험이 맞춰 본다) */
export const ITEM_SCHEMA_LIMITS = {
  tags: 16,
  /** 무게(g) */
  weightMax: 100_000_000,
  stackMax: 1_000_000,
  /** 유통기한(ms): 1시간 ~ 365일 */
  shelfLifeMinMs: 3_600_000,
  shelfLifeMaxMs: 31_536_000_000,
  effectsMax: 8,
  order: 10_000,
  /** 사용 효과 적정 스탯 상한(무기 1차 적정 스탯 weaponAppropriateSchema와 같은 기술 범위) */
  useAppropriateMax: 10_000_000,
  /** 사용 효과 ±오차(‰) 범위: 25~50%(D-501, 비우면 설정 칸 d496_use_variance) */
  useVarianceMinPm: 250,
  useVarianceMaxPm: 500,
  /** 거래 묶음 크기 상한(기본 단위 개수, 302·D-506: 광석 1,000 = 1kg) */
  lotSizeMax: 1_000_000,
  /**
   * 사용 효과 줄 지속(ms) 상한: 게임 상한은 없다(D-512 328 "1시간 상한을 두지 않는다", 지속 = 편집기 값 D-472, 전투 밖 버프는 실제 시간).
   * 365일은 정수 범위를 지키는 기술 범위다(유통기한 상한과 같다). 효과 사전·스킬 효과 줄의 1시간은 전투 효과라 그대로
   */
  useDurationMaxMs: 31_536_000_000,
} as const;

const enabled = z.boolean({ error: "enabled가 없습니다. true 또는 false로 적으세요(D-398 켬·끔)." });
/** 티어 T0~T9(D-5001. 상한은 설정값이라 늘리면 여기와 시뮬 규칙을 함께 고친다) */
const tier = z.int().min(0).max(9);

/** 규칙 하나를 어긴 문제(코드는 params.rule) */
function fail(ctx: z.RefinementCtx, path: (string | number)[], rule: string, message: string): void {
  ctx.addIssue({ code: "custom", path, message, params: { rule } });
}

/**
 * 신선도(D-285): 유통기한(ms). 0이 되면 다른 아이템으로 바뀐다(D-496: 무엇으로 바뀔지는 아이템마다). 보존 배율(냉장 등)은
 * 창고·가공 규칙이라 아이템 칸이 아니다. 실제로 썩는 실행 규칙은 소모품 줄기(WP-6)
 */
export const perishSchema = z.strictObject({
  shelfLifeMs: z.int().min(ITEM_SCHEMA_LIMITS.shelfLifeMinMs).max(ITEM_SCHEMA_LIMITS.shelfLifeMaxMs),
  /** 신선도 0이 되면 바뀌는 아이템(자기 자신·돌고 도는 사슬은 팩 검사가 막는다) */
  spoilsTo: ref("items"),
});

/**
 * 사용 효과(D-425 효과 사전 코드만, 스킬 효과 줄과 같은 모양). value는 기준 값이다: 효과량은 쓰는 유닛의 스탯으로 정해지고(보통 HP 회복은
 * VIT, MP 회복은 WIS) ±오차가 붙는다(D-496 286). 같은 아이템은 같은 물건(호가창)이다. 식(D-501 "적정 스탯", 무기 효율 D-420 틀):
 * 효과량 = value × min(상한, 쓰는 유닛의 그 1차 스탯 ÷ 적정 스탯) × (1 ± 오차). 상한은 무기 효율과 같은 설정 칸 N10(n10_appropriate_cap),
 * 오차 = variancePm(25~50%, 없으면 설정 칸 d496_use_variance 500). 셈은 @terra/sim useAmountRange 하나(정수 ‰·내림).
 * 실제로 먹고 쓰는 실행(전투 중 사용 287 포함)은 보유 물건 뒤 소비 줄기다. 지금은 편집기 미리 보기만 이 값을 셈한다
 */
export const useSchema = z.strictObject({
  effects: z
    .array(
      z.strictObject({
        effect: ref("effects"),
        value: z.int().min(-1_000_000).max(1_000_000),
        chancePm: z.int().min(0).max(1000),
        /** 없으면 효과 사전의 기본 지속. 1시간 상한 없음(D-512 328, 범위는 기술 상한) */
        durationMs: z.int().min(0).max(ITEM_SCHEMA_LIMITS.useDurationMaxMs).optional(),
        /**
         * 효과량 비례(D-496 286, D-501): 쓰는 유닛의 stat 값 ÷ appropriate(적정 스탯) 비율(상한 N10)을 기준 값에 곱한다.
         * 스탯은 1차 6개 중 아무것(보통 HP는 VIT, MP는 WIS). 없으면 기준 값 그대로
         */
        scale: z
          .strictObject({
            stat: z.enum(PRIMARY_STAT_CODES),
            appropriate: z.int().min(1).max(ITEM_SCHEMA_LIMITS.useAppropriateMax),
          })
          .optional(),
        /** ±오차(‰, D-496 286·D-501: 250~500). 없으면 설정 칸 d496_use_variance */
        variancePm: z
          .int()
          .min(ITEM_SCHEMA_LIMITS.useVarianceMinPm)
          .max(ITEM_SCHEMA_LIMITS.useVarianceMaxPm)
          .optional(),
      }),
    )
    .min(1)
    .max(ITEM_SCHEMA_LIMITS.effectsMax),
});

/** 유전자 조각 종류(D-478): 스탯 유전자(속성 포함)·스킬 유전자 */
export const GENE_KINDS = ["stat", "skill"] as const;
/**
 * 유전자를 얻는 길(D-478 "얻는 길은 데이터", 49 N47): death = 그 종 유닛이 수명을 다하면 소유자에게(D-478·D-516),
 * wave = 정원사 도시 웨이브를 막아 낸 도시 주인에게(D-499 웨이브 보상, 양은 설정 칸 d499_reward_genes)
 */
export const GENE_SOURCES = ["death", "wave"] as const;

/**
 * 유전자(D-478·D-481·D-516, 49 N47, docs/adr/2026-11-07-cyborg-fusion-genes.md "바뀜 (D-516)"): 어느 종(유닛 종류)의 어떤 유전자인지와
 * 얻는 길. 유전자 하나하나는 값이 다른 보유 물건 인스턴스다(스탯 유전자 = 총합·분포·속성, 스킬 유전자 = 스킬 하나). 한 번 쓰면 사라진다.
 * 합성 확률·인큐베이터 바탕 스탯은 설정 칸 N47이다
 */
export const geneSchema = z.strictObject({
  kind: z.enum(GENE_KINDS),
  species: ref("unit_kinds"),
  drops: z.array(z.enum(GENE_SOURCES)).max(GENE_SOURCES.length).optional(),
});

/** 대분류와 묶음·거래 칸이 맞는지(필드 검사가 실패해도 불린다: 값의 모양을 다시 보고 틀리면 건너뛴다) */
function checkItemEntry(entry: unknown, ctx: z.RefinementCtx): void {
  if (typeof entry !== "object" || entry === null) return;
  const get = (key: string): unknown => Reflect.get(entry, key);
  const category = get("category");
  if (typeof category !== "string") return;
  const equipment = category === "equipment";
  if (equipment && get("equip") === undefined)
    fail(ctx, ["equip"], "item_equip_required", "장비(equipment)는 장비 칸(equip)을 꼭 적습니다.");
  if (!equipment && get("equip") !== undefined)
    fail(ctx, ["equip"], "item_equip_category", "장비 칸(equip)은 대분류 equipment에만 씁니다.");
  if (get("perish") !== undefined && !PERISH_CATEGORIES.includes(category))
    fail(
      ctx,
      ["perish"],
      "item_perish_category",
      "신선도(perish)는 원자재·가공 재료·식품·소모품(raw·processed·consumable)에만 씁니다.",
    );
  if (get("use") !== undefined && category !== "consumable")
    fail(ctx, ["use"], "item_use_category", "사용 효과(use)는 식품·소모품(consumable)에만 씁니다.");
  const stackMax = get("stackMax");
  if (equipment && typeof stackMax === "number" && stackMax !== 1)
    fail(
      ctx,
      ["stackMax"],
      "item_stack_equipment",
      "장비는 하나하나 성능이 달라 쌓지 않습니다(stackMax 1, D-5003).",
    );
  if (get("bound") === true && get("tradable") === true)
    fail(
      ctx,
      ["tradable"],
      "item_bound_tradable",
      "계정 귀속(bound) 아이템은 거래할 수 없습니다(tradable를 빼거나 false로, D-7014).",
    );
  const tags = get("tags");
  if (Array.isArray(tags)) {
    const seen = new Set<string>();
    tags.forEach((tag: unknown, index) => {
      const id = typeof tag === "object" && tag !== null ? Reflect.get(tag, "id") : undefined;
      if (typeof id !== "string") return;
      if (seen.has(id)) fail(ctx, ["tags", index], "item_tag_duplicate", `태그 ${id}가 두 번 있습니다.`);
      seen.add(id);
    });
  }
}

export const itemEntrySchema = z
  .strictObject({
    id: contentId,
    name: localizedText,
    description: localizedText.optional(),
    category: z.enum(ITEM_CATEGORIES),
    /** 중분류(D-5033): 그 대분류의 중분류만(팩 검사). 보관 창고·식품 판정이 이 칸을 본다 */
    subcategory: ref("item_subcategories").optional(),
    /** 태그(거래소 거르기, D-5033) */
    tags: z.array(ref("item_tags")).max(ITEM_SCHEMA_LIMITS.tags).optional(),
    tier,
    /**
     * [임시] 시작 시세(그 나라 화폐 최소 단위, 295 D-501). 그 세계에서 이 물건의 시장이 처음 열릴 때의 첫 가격으로만 쓴다(체결이 없을 때의
     * NPC 매물 값, 물가 지수의 분모 = 그 세계의 첫 가격). 그 뒤 계산은 시장 시세다. 팩 core@27까지는 baseValue(기준 가치). 기획 수치 없음
     */
    startPrice: z.int().positive(),
    /** 무게(g, D-117 "모든 아이템에 무게가 있다"). 읽는 곳이 생기기 전까지는 권고 */
    weight: z.int().min(0).max(ITEM_SCHEMA_LIMITS.weightMax).optional(),
    /**
     * 거래 묶음 크기(302·D-506, 팩 core@29): 기본 단위(1개 = weight g) 몇 개를 한 묶음으로 사고파는가. 거래소 주문 수량·값(묶음당)과
     * 레시피 재료·산출 수량은 묶음 단위, 창고·운반·나누기(원장 잔고)는 기본 단위다. 광석은 1개 = 1g, 묶음 1,000 = 1kg. 없으면 1
     */
    lotSize: z.int().min(1).max(ITEM_SCHEMA_LIMITS.lotSizeMax).optional(),
    /** 한 칸에 쌓는 수 상한(장비는 1). 보유 표가 생기면 읽는다 */
    stackMax: z.int().min(1).max(ITEM_SCHEMA_LIMITS.stackMax).optional(),
    /** 거래소에 올릴 수 있나(없으면 참). 우편·이적은 된다 */
    tradable: z.boolean().optional(),
    /** 계정 귀속(없으면 거짓): 거래소·이적·우편 모두 안 된다(D-7014·D-270) */
    bound: z.boolean().optional(),
    /** 아이콘 에셋 키(에셋 저장소가 생기기 전까지 칸만, D-399) */
    icon: contentId.optional(),
    /** 장비면 칸·스탯 목록·무기 사양·장비 스킬·전투 직접 값·크리쳐 보유(D-422~D-426·D-494, combat.ts). equipment만, 그리고 꼭 */
    equip: equipSchema.optional(),
    /** 신선도(식재료·음식) */
    perish: perishSchema.optional(),
    /** 사용 효과(식품·소모품만) */
    use: useSchema.optional(),
    /** 유전자 조각이면 종·종류·얻는 길(D-478) */
    gene: geneSchema.optional(),
    enabled,
  })
  .superRefine(checkItemEntry);
export type ItemEntry = z.output<typeof itemEntrySchema>;

/**
 * 중분류(D-5033 표의 중분류): 대분류 하나에 속한다. storage = 보관 창고(없으면 대분류 기본: 장비 무기고, 식품 식량 창고, 나머지 일반),
 * food = 식품·식재료(보관·거래 방식·신선도 권고가 본다), foodFamily = 식재료 계열(food일 때만)
 */
export const itemSubcategoryEntrySchema = z
  .strictObject({
    id: contentId,
    name: localizedText,
    major: z.enum(ITEM_CATEGORIES),
    /** 목록 차례(작을수록 앞, 없으면 팩 차례) */
    order: z.int().min(0).max(ITEM_SCHEMA_LIMITS.order).optional(),
    storage: z.enum(STORAGE_KINDS).optional(),
    food: z.boolean().optional(),
    foodFamily: z.enum(FOOD_FAMILIES).optional(),
    enabled,
  })
  .superRefine((entry, ctx) => {
    if (typeof entry !== "object" || entry === null) return;
    if (entry.foodFamily !== undefined && entry.food !== true)
      fail(
        ctx,
        ["foodFamily"],
        "subcategory_food_family",
        "식재료 계열(foodFamily)은 식품·식재료 중분류(food: true)에만 씁니다.",
      );
  });
export type ItemSubcategoryEntry = z.output<typeof itemSubcategoryEntrySchema>;

/** 태그(거래소 거르기, D-5033) */
export const itemTagEntrySchema = z.strictObject({ id: contentId, name: localizedText, enabled });
export type ItemTagEntry = z.output<typeof itemTagEntrySchema>;

/**
 * 무기 종류(48 §5.5): 무기 칸(칼·활·총 등) 또는 보조 칸(방패·화살통·탄창 등). 아이템 equip.weaponType이 가리키고, 무기의 탄약 연결
 * (equip.weapon.ammo)은 보조 칸 종류를 가리킨다(D-496: 화살·탄약은 보조무기 칸, 원거리 타격마다 1씩). 화면 이름은 "장비 종류(무기 칸·보조 칸)"
 * (D-497 기획 정리 895: 이름만 바꿈, 자료 이름 weapon_types·ID는 그대로)
 */
export const weaponTypeEntrySchema = z
  .strictObject({
    id: contentId,
    name: localizedText,
    slot: z.enum(WEAPON_TYPE_SLOTS),
    /**
     * 상위 중분류(D-497 기획 정리 896: 나무 = 대분류 → 중분류 → 무기 종류). 장비 대분류의 중분류만(팩 검사 weapon_type_subcategory_major).
     * 이 종류가 붙은 장비의 중분류는 이 값이어야 한다(item_weapon_type_subcategory). 선택 칸이라 없으면 나무에서 "상위 중분류 없음"
     */
    subcategory: ref("item_subcategories").optional(),
    order: z.int().min(0).max(ITEM_SCHEMA_LIMITS.order).optional(),
    /**
     * 탄약 종류(D-497: 탄약은 보조 칸에 끼우는 장비 하나이고 그 장비의 내구도가 남은 탄 수다. 원거리로 칠 때마다 1 준다, 0이면
     * 원거리 공격을 못 한다). 이 종류의 장비는 최대 내구도 = 담는 탄 수다. 보조 칸 종류만. 소모 실행은 보유 물건 뒤(전투 줄기)
     */
    ammo: z.boolean().optional(),
    enabled,
  })
  .superRefine((entry, ctx) => {
    if (typeof entry !== "object" || entry === null) return;
    if (entry.ammo === true && entry.slot !== "offhand")
      fail(
        ctx,
        ["ammo"],
        "weapon_type_ammo_slot",
        "탄약 종류(ammo)는 보조 칸(offhand) 종류에만 씁니다(D-497).",
      );
  });
export type WeaponTypeEntry = z.output<typeof weaponTypeEntrySchema>;
