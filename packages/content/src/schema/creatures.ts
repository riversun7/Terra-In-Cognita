// 크리처 도감(creatures.json) 스키마 — 구형 AntiGravt01(91종 도감·이미지) + 신규 기획서(41_Time_Units §4~§5, 50_Content_Rules §3~§4, 48_Stats_Formulas §4.3·§5) 통합.
// - 기원(origin)은 두지 않고 주분류(category 14종) + 다중 태그(tags: 성향·세트·특성)로 분류한다.
// - 등급(grade): 6단계(common·rare·epic·boss·legendary·mythic, D-5025).
// - 크기(size): 4단계(S·M·L·XL) + XL 전용 거대 3타일(giant3Tile, D-5023).
// - 원형 초상화(portraitCrop): 원본 이미지를 복제하지 않고 정규화 원 중심·반지름(cxPm, cyPm, radiusPm, 0~1000‰)만 저장한다.
// - 고유 무기(naturalWeapon): 아이템 무기와 동일하게 기준 공격력(attack) + 랜덤 지급 범위(min~max)와 추가 스탯 범위(stats: {stat, min, max})를 갖는다.
// - 목장 부산물(byproducts)은 제외한다(전투 전리품 drops만 유지).
import { ELEMENT_IDS, ELEMENT_MAX } from "@terra/shared/cyborg";
import { z } from "zod";
import { contentId, localizedText, ref } from "./common.ts";

export const CREATURE_CATEGORIES = [
  "beast",
  "dragon",
  "aquatic",
  "bird",
  "insect",
  "undead",
  "humanoid",
  "mythical",
  "construct",
  "dinosaur",
  "elemental",
  "demon",
  "plant",
  "aberration",
] as const;
export type CreatureCategory = (typeof CREATURE_CATEGORIES)[number];

export const CREATURE_GRADES = ["common", "rare", "epic", "boss", "legendary", "mythic"] as const;
export type CreatureGrade = (typeof CREATURE_GRADES)[number];

export const CREATURE_SIZES = ["S", "M", "L", "XL"] as const;
export type CreatureSize = (typeof CREATURE_SIZES)[number];

/** 권장 성향·세트 태그 목록(강제 enum은 아니며 자유 contentId 태그도 허용) */
export const CREATURE_PRESET_TAGS = [
  "tendency_attack",
  "tendency_defense",
  "tendency_agile",
  "tendency_mount",
  "tendency_magic",
  "tendency_production",
  "set_zodiac_12",
  "set_horoscope_12",
  "set_four_gods",
  "set_mh_homage",
  "set_dq_ff",
  "set_greek_myth",
  "set_ancient_dino",
] as const;

const enabled = z.boolean({
  error: "enabled가 없습니다. true 또는 false로 적으세요(D-398 켬·끔).",
});

/** 원본 이미지 위 원형 초상화 좌표(‰, 0~1000: 500 = 정중앙) */
export const creaturePortraitCropSchema = z.strictObject({
  cxPm: z.int().min(0).max(1000),
  cyPm: z.int().min(0).max(1000),
  radiusPm: z.int().min(50).max(500),
});
export type CreaturePortraitCrop = z.output<typeof creaturePortraitCropSchema>;

/** 크리처 고유 무기 공격력(기준값 attack + 랜덤 지급 범위 min~max + 선택 12속성 계수‰) */
const creatureWeaponAttackSchema = z
  .strictObject({
    attack: z.int().min(0).max(1_000_000),
    min: z.int().min(0).max(1_000_000),
    max: z.int().min(0).max(1_000_000),
    elementsPm: z.array(z.int().min(-100_000).max(100_000)).length(ELEMENT_IDS.length).optional(),
  })
  .superRefine((val, ctx) => {
    if (typeof val !== "object" || val === null) return;
    if (typeof val.min === "number" && typeof val.max === "number" && val.min > val.max) {
      ctx.addIssue({
        code: "custom",
        path: ["min"],
        message: "고유 무기 공격력 최소값(min)이 최대값(max)보다 클 수 없습니다.",
        params: { rule: "creature_weapon_attack_range" },
      });
    }
  });

/** 크리처 고유 무기 추가 스탯 롤링 범위(아이템 장비 stats와 동일한 {stat, min, max}) */
const creatureWeaponStatRangeSchema = z
  .strictObject({
    stat: z.string().min(1).max(48),
    min: z.int().min(-10_000_000).max(10_000_000),
    max: z.int().min(-10_000_000).max(10_000_000),
  })
  .superRefine((row, ctx) => {
    if (typeof row !== "object" || row === null) return;
    if (typeof row.min === "number" && typeof row.max === "number" && row.min > row.max) {
      ctx.addIssue({
        code: "custom",
        path: ["min"],
        message: "고유 무기 추가 스탯의 min이 max보다 큽니다.",
        params: { rule: "creature_weapon_stat_range" },
      });
    }
  });

/** 크리처 고유 무기(아이템 무기처럼 성능 범위로 지급) */
export const creatureNaturalWeaponSchema = z
  .strictObject({
    name: localizedText.optional(),
    appropriate: z.enum(["str", "dex", "agi", "int"]).optional(),
    physical: creatureWeaponAttackSchema.optional(),
    elemental: creatureWeaponAttackSchema.optional(),
    skillElementsPm: z.array(z.int().min(-100_000).max(100_000)).length(ELEMENT_IDS.length).optional(),
    hitPm: z.int().min(0).max(2000).optional(),
    critPm: z.int().min(0).max(1000).optional(),
    intervalMs: z.int().min(200).max(60_000),
    range: z.int().min(1).max(64),
    arc: z.boolean().optional(),
    staminaCost: z.int().min(0).max(100_000).optional(),
    mpCost: z.int().min(0).max(100_000).optional(),
    stats: z.array(creatureWeaponStatRangeSchema).max(16).optional(),
  })
  .superRefine((weapon, ctx) => {
    if (typeof weapon !== "object" || weapon === null) return;
    const hasPhys = typeof weapon.physical === "object" && weapon.physical !== null;
    const hasElem = typeof weapon.elemental === "object" && weapon.elemental !== null;
    if (!hasPhys && !hasElem) {
      ctx.addIssue({
        code: "custom",
        path: [],
        message: "고유 무기에는 물리(physical) 또는 원소(elemental) 공격력이 하나 이상 있어야 합니다.",
        params: { rule: "creature_weapon_empty" },
      });
    }
  });
export type CreatureNaturalWeapon = z.output<typeof creatureNaturalWeaponSchema>;

/** 크리처 보유 스킬 링크 */
export const creatureSkillLinkSchema = z.strictObject({
  skill: ref("skills"),
  unlockLevel: z.int().min(1).max(100).optional(),
  innate: z.boolean().optional(),
});
export type CreatureSkillLink = z.output<typeof creatureSkillLinkSchema>;

/** 크리처 처치 전리품 드롭 행 */
export const creatureDropSchema = z
  .strictObject({
    item: ref("items"),
    chancePm: z.int().min(1).max(1000),
    min: z.int().min(1).max(999),
    max: z.int().min(1).max(999),
  })
  .superRefine((drop, ctx) => {
    if (typeof drop !== "object" || drop === null) return;
    if (typeof drop.min === "number" && typeof drop.max === "number" && drop.min > drop.max) {
      ctx.addIssue({
        code: "custom",
        path: ["min"],
        message: "드롭 최소 수량(min)이 최대 수량(max)보다 클 수 없습니다.",
        params: { rule: "creature_drop_range" },
      });
    }
  });
export type CreatureDrop = z.output<typeof creatureDropSchema>;

const primaryStatsSchema = z.strictObject({
  str: z.int().min(1).max(999),
  dex: z.int().min(1).max(999),
  agi: z.int().min(1).max(999),
  vit: z.int().min(1).max(999),
  int: z.int().min(1).max(999),
  wis: z.int().min(1).max(999),
});

export const creatureEntrySchema = z
  .strictObject({
    id: contentId,
    name: localizedText,
    description: localizedText.optional(),
    category: z.enum(CREATURE_CATEGORIES),
    grade: z.enum(CREATURE_GRADES),
    size: z.enum(CREATURE_SIZES),
    /** XL(초대형) 가운데 3타일 점유 거대 판정 여부(D-5023) */
    giant3Tile: z.boolean().optional(),
    /** 성향·세트·특성 다중 태그 */
    tags: z.array(contentId).max(24).optional(),
    /** 원본 이미지 파일 이름 또는 경로(예: "mon_goblin.webp", 확장자 자유) */
    image: z.string().min(1).max(200).optional(),
    /** 원본 이미지 위 원형 초상화 좌표(‰) */
    portraitCrop: creaturePortraitCropSchema.optional(),
    /** 6대 1차 스탯(STR·DEX·AGI·VIT·INT·WIS) */
    primaries: primaryStatsSchema,
    /** 12속성 점수(0~10, 합계 ≤ 20 권장, 41_Time_Units §4.3) */
    elements: z.array(z.int().min(0).max(ELEMENT_MAX)).length(ELEMENT_IDS.length),
    /** 12속성 추가 저항(‰, -1000 ~ +1000) */
    resistPm: z.array(z.int().min(-1000).max(1000)).length(ELEMENT_IDS.length).optional(),
    /** 허용 아종 코드 목록(sub_fire, sub_water 등) */
    allowedSubspecies: z.array(contentId).max(12).optional(),
    /** 스킬 슬롯 구조(D-427: 기본·환생당 추가·최대 ≤ 10) */
    skillSlots: z.strictObject({
      base: z.int().min(1).max(10),
      perRebirth: z.int().min(0).max(5),
      max: z.int().min(1).max(10),
    }),
    /** 종족 고유·해금 스킬 목록 */
    skills: z.array(creatureSkillLinkSchema).max(10).optional(),
    /** 크리처 고유 무기(성능 범위 포함) */
    naturalWeapon: creatureNaturalWeaponSchema.optional(),
    /** 사냥 전리품 드롭 테이블 */
    drops: z.array(creatureDropSchema).max(24).optional(),
    /** 2차맵 전투·조우 유닛 종류 연결(선택) */
    unitKind: ref("unit_kinds").optional(),
    enabled,
  })
  .superRefine((entry, ctx) => {
    if (typeof entry !== "object" || entry === null) return;
    if (entry.giant3Tile === true && entry.size !== "XL") {
      ctx.addIssue({
        code: "custom",
        path: ["giant3Tile"],
        message: "거대 3타일 판정(giant3Tile)은 크기(size)가 XL일 때만 켤 수 있습니다(D-5023).",
        params: { rule: "creature_giant_requires_xl" },
      });
    }
    if (
      typeof entry.skillSlots === "object" &&
      entry.skillSlots !== null &&
      typeof entry.skillSlots.base === "number" &&
      typeof entry.skillSlots.max === "number" &&
      entry.skillSlots.base > entry.skillSlots.max
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["skillSlots", "base"],
        message: "기본 스킬 슬롯(base)이 최대 슬롯(max)보다 클 수 없습니다(D-427).",
        params: { rule: "creature_skill_slots_range" },
      });
    }
    if (Array.isArray(entry.elements)) {
      const sum = entry.elements.reduce((acc, v) => acc + (typeof v === "number" ? v : 0), 0);
      if (sum > 20) {
        ctx.addIssue({
          code: "custom",
          path: ["elements"],
          message: `크리처 12속성 점수 합계(${sum})가 상한(20)을 넘었습니다(41_Time_Units §4.3).`,
          params: { rule: "creature_elements_sum" },
        });
      }
    }
  });

export type CreatureEntry = z.output<typeof creatureEntrySchema>;
