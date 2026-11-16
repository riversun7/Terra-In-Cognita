// 경제 분류 — 아이템·레시피·시설·생필품·국가 프리셋 (docs/adr/2026-10-31-economy-core.md 1절)
// 기획: 아이템 9대분류(D-5029)·티어 T0~T9와 시설 Lv1~5(D-5001)·생산 4단계(D-114)·유지비 = 생필품(D-150)·
// 세력 화폐(D-124·D-131)·켬/끔(D-398: 개발자 페이지에서 켜고 끈다. 시설은 켬·끔 없이 늘 켜짐 — 사용자 답 2026-11-03).
// 지금 팩은 형식 확인용 임시 데이터다(placeholder). 기획 출발값이 없는 칸(시작 시세·작업량·수량·세율)은 시험값이다.
import {
  FACILITY_BUILD_LIMITS,
  FACILITY_LEVEL_MAX,
  FACILITY_REPAIR_LIMITS,
} from "@terra/shared/facilityBuild";
import { EXCHANGE_KINDS } from "@terra/shared/exchange";
import { FACILITY_CATEGORIES } from "@terra/shared/facilityCategory";
import { FACILITY_LOOK_COLORS, FACILITY_LOOK_LIMITS, FACILITY_LOOK_MODELS } from "@terra/shared/facilityLook";
import { FACILITY_RUNTIME_LIMITS } from "@terra/shared/facilityRuntime";
import { GATHER_EXTRA_SUBCATEGORIES_MAX } from "@terra/shared/gatherMath";
import {
  isCurrencySymbol,
  isCurrencyTicker,
  isFactionColor,
  isFactionShort,
} from "@terra/shared/factionProfile";
import { NAME_STYLE_IDS } from "@terra/shared/nameGen";
import {
  EMBLEM_CHARGES,
  EMBLEM_DIVISIONS,
  EMBLEM_SCHEME_COUNT,
  EMBLEM_SHAPES,
} from "@terra/shared/nationEmblem";
import { NATION_LIST_LIMITS, NATION_SEED_LIMITS } from "@terra/shared/nationEditor";
import { NATION_TIER_LIMITS, POWER_TIERS } from "@terra/shared/nationTier";
import { z } from "zod";
import { boatTypesSchema, harborRoleSchema } from "./boats.ts";
import { EQUIP_SLOT_KINDS, PRIMARY_STAT_CODES } from "./combat.ts";
import { contentId, localizedText, ref } from "./common.ts";

// 아이템 항목·대분류는 items.ts(공통 칸 + 대분류별 묶음, docs/adr/2026-11-01-item-editor.md). 옛 가져오기 길을 지킨다
export { ITEM_CATEGORIES, itemEntrySchema, type ItemEntry } from "./items.ts";

/**
 * 생산 단계(D-114) + 영토(영토 비콘처럼 생산하지 않는 시설, D-485·49 N51 — docs/adr/2026-11-03-territory-layer.md) + 창고(일하지 않고
 * 물건을 두는 시설, 옛 야적장·창고·중앙창고·대규모 창고, 49 N50·D-121·D-516 382 — docs/adr/2026-11-07-buildings-runtime.md "바뀜 (창고·직무)")
 * + 신앙(일하지 않고 기도·헌금·환생·신격화 집전을 받는 신앙 시설, 46 §7·D-311) + 생명공학(비활성 휴먼을 유전자로 바꾸는 생명과학 연구소,
 * D-517·D-469 — 둘 다 docs/adr/2026-11-07-temple-religion.md) + 행정(폐허에 짓는 정부 = 행정 건물, D-510 —
 * docs/adr/2026-11-07-ruins-restoration.md) + 의료(다친 유닛을 돈을 받고 빨리 낫게 하는 병원, 의사 = 직무 배치 — D-521·D-311,
 * docs/adr/2026-11-08-injury.md) + 생활(일꾼이 쉬는 숙소 — 기획 48 §7.1·D-245·90 "생활 서비스", 지금은 NPC 휴먼의 밤 쉼터만,
 * docs/adr/2026-11-11-city-building-layout.md) + 방어(성벽 — 공성 전투에서 뚫어야 지나간다, 질문 1048 가, 같은 ADR "바뀜 (2026-11-12)")
 */
export const FACILITY_STAGES = [
  "gather",
  "process",
  "part",
  "finish",
  "territory",
  "storage",
  "religion",
  "biotech",
  "government",
  "medical",
  "living",
  "defense",
  // 교통(부두 — docs/adr/2026-11-13-boats.md 3절, 42 §5 대분류 "교통")
  "transport",
  // 상업(거래소 건물 — 기획 D-561·D-560 분류 "상업", docs/adr/2026-11-16-exchange-buildings.md). 일하지 않고 생산하지 않는다
  "commerce",
] as const;

/** 채집 방식: roll = 확률표 추첨, select = 선택 + 효율(옛 ITM-10) */
export const GATHER_MODES = ["roll", "select"] as const;

/** 켬·끔(D-398). 끈 항목은 세계에 새로 나오지 않는다(있는 것은 그대로) */
const enabled = z.boolean({ error: "enabled가 없습니다. true 또는 false로 적으세요(D-398 켬·끔)." });

const stack = z.strictObject({ item: ref("items"), qty: z.int().positive().max(1_000_000) });
/** 건설 재료 한 줄(묶음 수량, 범위는 @terra/shared FACILITY_BUILD_LIMITS) */
const buildStack = z.strictObject({
  item: ref("items"),
  qty: z.int().min(FACILITY_BUILD_LIMITS.qty.min).max(FACILITY_BUILD_LIMITS.qty.max),
});

/**
 * 장비 수리 줄(기획 D-512 323, 옛 enhancement_routes.js REPAIR_MAP 878~883): 무기 종류(weaponTypes)가 맞거나 칸(slots)이 맞는 장비를 고친다
 * (위에서부터 첫 맞는 줄). 재료는 기본 양이고 수리 한 번 = max(1, ⌈기본 × 티어 × 잃은 ÷ 최대⌉)(@terra/sim items/repair.ts). 칸·무기
 * 종류가 하나도 없으면 아무것도 고치지 못해 막는다
 */
const repairRule = z
  .strictObject({
    slots: z.array(z.enum(EQUIP_SLOT_KINDS)).max(FACILITY_REPAIR_LIMITS.targets),
    weaponTypes: z.array(ref("weapon_types")).max(FACILITY_REPAIR_LIMITS.targets),
    materials: z
      .array(
        z.strictObject({
          item: ref("items"),
          qty: z.int().min(FACILITY_REPAIR_LIMITS.qty.min).max(FACILITY_REPAIR_LIMITS.qty.max),
        }),
      )
      .min(1)
      .max(FACILITY_REPAIR_LIMITS.materials),
  })
  .superRefine((rule, ctx) => {
    // 필드 검사가 실패해도 불린다(AGENTS 6장 Zod 4.6.7): 모양을 다시 보고 틀리면 건너뛴다
    const slots: unknown = rule.slots;
    const types: unknown = rule.weaponTypes;
    if (!Array.isArray(slots) || !Array.isArray(types)) return;
    if (slots.length === 0 && types.length === 0)
      ctx.addIssue({
        code: "custom",
        path: ["slots"],
        message: "수리 줄은 칸(slots)이나 무기 종류(weaponTypes)를 적어도 하나 적습니다.",
        params: { rule: "repair_targets_empty" },
      });
  });

/**
 * 시설. 켬·끔 칸(enabled)이 없다: 시설은 늘 켜져 있다(팩 core@32, 사용자 답 2026-11-03 "켜고 끄는건 말이 안된다. 다른 재료로 바꾸면
 * 되지" — 쓰고 싶지 않은 재료는 건물 재료를 바꾼다). 옛 덮어쓰기 줄의 enabled는 서버 contentEdit/legacy.ts가 빼고 읽는다
 */
export const facilityEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  stage: z.enum(FACILITY_STAGES),
  /**
   * 시설 분류(기획 D-560 시설 분류표 — 도시 화면 건물 무리·지도 이름표 색, @terra/shared/facilityCategory). 판정에 쓰지 않는다.
   * 없으면 생산 단계에서 고른다(facilityCategoryOf — 옛 덮어쓰기 줄·편집기로 만든 시설). 새 시설은 건물 편집기에서 고른다
   */
  category: z.enum(FACILITY_CATEGORIES).optional(),
  /** 최고 레벨(D-5001 시설 Lv1~5). 없으면 5. 건설 재료 구간·편집기 레벨 표가 본다 */
  maxLevel: z.int().min(1).max(FACILITY_LEVEL_MAX).optional(),
  /** [임시] 레벨당 일하는 자리 수(Lv × 이 값). 기획 수치 없음(E29 근처, 건물 데이터 D-5044). 영토 비콘처럼 일하지 않는 시설은 0 */
  slotsPerLevel: z.int().min(0).max(1000),
  /**
   * [임시] 오염 값: 레벨 1이 1시간 일할 때 그 1차맵 칸에 더하는 오염(D-460 200 "시설 레벨 × 시설 오염 값", D-464 215 출발값,
   * 개발자 페이지 콘텐츠 D-398). 없으면 0
   */
  pollution: z.int().min(0).max(10_000).optional(),
  /**
   * 채집 티어 추첨(D-506, 질문 300·301): 이 시설의 레시피 가운데 산출이 모두 이 중분류인 것은 산출 묶음마다 티어를 뽑는다.
   * 유효 스탯 = 일꾼의 primary + secondary(43 §4: 광산 STR + VIT, 벌목 DEX + STR, 약초 INT + WIS, 낚시 AGI + DEX)
   * + 레벨 보너스(설정 칸 N43 n43_level_bonus × (레벨 − 1)), 확률표 = gather_tiers. 채집 단계(stage gather) 시설에만 쓴다
   */
  gather: z
    .strictObject({
      primary: z.enum(PRIMARY_STAT_CODES),
      secondary: z.enum(PRIMARY_STAT_CODES),
      subcategory: ref("item_subcategories"),
      /**
       * 함께 내는 중분류(질문 946 나, docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)"): 사다리 = 주 중분류 + 이 중분류들의
       * 켜진 아이템을 티어마다 한데 모은 것(옛 목장 RANCH_T0~T9 = 축산물 + 목축 부산물 30개). 원자재 중분류만, 주 중분류·서로 겹치지 않게
       * (2단계 검사 gather_subcategory_major·gather_subcategory_duplicate). 없으면 주 중분류 하나(앞 판 그대로)
       */
      extraSubcategories: z
        .array(ref("item_subcategories"))
        .min(1)
        .max(GATHER_EXTRA_SUBCATEGORIES_MAX)
        .optional(),
      /**
       * 채집 방식(옛 ITM-10, 43 §4): roll = 확률표 추첨(기본, 광산·벌목장·약초원·낚시터), select = 선택 + 효율(농장·목장):
       * 해금 티어 min(⌊(주 + 보조) ÷ 20⌋, 9)(49 P8)에서 켜진 아이템이 있는 가장 높은 티어를 고른다
       */
      mode: z.enum(GATHER_MODES).optional(),
      /**
       * 수확량(옛 gather_type_config, 기획 D-507·49 N32): 한 번 캘 때 개수 = min(yieldCap, yieldBase + ⌊보조 스탯 × yieldPerStatPm ÷ 1000⌋).
       * 없으면 yieldBase 1, yieldPerStatPm = 설정 칸 n32_sub_yield, 상한 없음. 광석은 개수 = 묶음 수(49 N44).
       * 주 스탯은 진행 속도 max(1, ⌊주 ÷ n32_main_divisor⌋)를 정한다(시설 칸 없음)
       */
      yieldBase: z.int().min(0).max(1000).optional(),
      yieldPerStatPm: z.int().min(0).max(100_000).optional(),
      yieldCap: z.int().min(1).max(1000).optional(),
      /**
       * 성공 확률(낚시터, 옛 fishing_config·BuildingGatherEngine.js 638~642·715~716, docs/adr/2026-11-11-production-six.md): 한 번 시도할 때
       * 성공 ‰ = min(maxPm, basePm + ⌊statPm × min(fullStat, 주 + 보조) ÷ fullStat⌋). 실패한 번은 아무것도 나오지 않는다(T0 시간은 든다).
       * 옛 값 0.30·0.80·0.50·200 → 300·800·500·200. 없으면 늘 성공(광산·벌목장·약초원·농장·목장)
       */
      catch: z
        .strictObject({
          basePm: z.int().min(0).max(1000),
          maxPm: z.int().min(0).max(1000),
          statPm: z.int().min(0).max(1000),
          fullStat: z.int().min(1).max(100_000),
        })
        .optional(),
    })
    .optional(),
  /**
   * 건설 재료(49 M14·D-508, 옛 building_seed.js buildCost — docs/adr/2026-11-02-building-editor.md): 레벨 구간마다 재료를 적는다.
   * 레벨 L에는 from ≤ L인 마지막 구간(levels)을 쓰고, 줄마다 round(qty × L² × mulPm ÷ 1000)(옛 Base × 티어² × 분류 배율, 옛 "티어"를
   * 새 시설 레벨로 읽은 것은 기술 해석 ⏳). 셈은 @terra/shared/facilityBuild 하나다. D-508: 처음 레벨은 1차 원자재로 지어 초기 발전이
   * 막히지 않게, 그 위 레벨 대부분은 가공품(판자·벽돌·주괴). 출발값(옛 raw → Lv1 원자재·Lv2부터 가공품)은 [임시]이고 건물 편집기
   * (/dev/buildings)에서 고친다. 구간 규칙(첫 from 1·늘어나기만·최고 레벨 이하·같은 아이템 한 줄)은 2단계 검사(validate/facilities.ts).
   * 수량은 레시피와 같은 묶음 단위다. mulPm = 옛 분류 배율(PRIMARY 0.8 → 800, SECONDARY 1.2 → 1200). 짓기·레벨 올림·수리는 서버
   * 건물 서비스(docs/adr/2026-11-07-buildings-runtime.md)가 셈한다
   */
  build: z
    .strictObject({
      mulPm: z.int().min(FACILITY_BUILD_LIMITS.mulPm.min).max(FACILITY_BUILD_LIMITS.mulPm.max),
      levels: z
        .array(
          z.strictObject({
            from: z.int().min(1).max(FACILITY_LEVEL_MAX),
            materials: z.array(buildStack).min(1).max(FACILITY_BUILD_LIMITS.materials),
          }),
        )
        .min(1)
        .max(FACILITY_BUILD_LIMITS.levels),
    })
    .optional(),
  /**
   * 장비 수리 줄(D-512 323): 이 시설이 고치는 장비와 기본 재료. 출발값 = 옛 공방 넷(무기 공방 주괴 2, 원거리 공방 목재 2 + 주괴 1, 방어구
   * 공방 주괴 1 + 가죽 1, 장신구 공방 크리스탈 1 — 팩에 크리스탈이 없어 [임시] 은 괴)이고 건물 편집기(/dev/buildings)에서 고친다.
   * 없으면 수리하지 않는 시설. 수리는 끝까지만, 수수료 없음(노동 = 장인의 직무 시간 D-171)
   */
  repair: z.array(repairRule).min(1).max(FACILITY_REPAIR_LIMITS.rules).optional(),
  /**
   * 2차맵에 짓는 칸 크기(배치 칸, 회전 전 가로·세로, D-102·D-5041 레벨이 올라도 넓히지 않음). [임시] 출발값, 건물 편집기에서 고친다.
   * 없으면 2차맵에 지을 수 없다(영토 비콘은 1차맵 칸에 놓아 칸 크기가 없다). docs/adr/2026-11-07-buildings-runtime.md
   */
  footprint: z
    .strictObject({
      width: z.int().min(FACILITY_RUNTIME_LIMITS.footprint.min).max(FACILITY_RUNTIME_LIMITS.footprint.max),
      height: z.int().min(FACILITY_RUNTIME_LIMITS.footprint.min).max(FACILITY_RUNTIME_LIMITS.footprint.max),
    })
    .optional(),
  /**
   * 물가 조건(질문 947 나, 옛 water_adjacent·낚시 반경 5칸 — docs/adr/2026-11-11-production-six.md "바뀜 (2026-11-11, 946·947)"): 있으면
   * 2차맵에 놓을 때 건물 칸(회전한 칸 크기)에서 이 배치 칸 수 안(체비쇼프 거리 — 칸을 사방으로 이만큼 넓힌 네모)에 물 칸(지표 물·얕은 물)이
   * 하나라도 있어야 한다. 서버 짓기·NPC 씨앗이 같은 함수(@terra/shared/waterNearby)로 본다. 출발값 = 낚시터 5. 없으면 땅 조건 없음
   */
  needsWaterWithin: z
    .int()
    .min(FACILITY_RUNTIME_LIMITS.needsWaterWithin.min)
    .max(FACILITY_RUNTIME_LIMITS.needsWaterWithin.max)
    .optional(),
  /**
   * 레벨 1 최대 내구도(49 M15 "건물 에디터 입력값"). 레벨 L = 이 값 × (1 + (L − 1) × 설정 칸 m15_durability_step). 출발값 = 옛
   * seeds/building_seed.js hp. 없으면 100(옛 코드 기본 max_durability). 영토 비콘은 설정 칸 n51_beacon_durability를 쓴다
   */
  durability: z
    .int()
    .min(FACILITY_RUNTIME_LIMITS.durability.min)
    .max(FACILITY_RUNTIME_LIMITS.durability.max)
    .optional(),
  /**
   * 레벨 1 창고 용량(kg, 49 N50 "기본 1t·10t·100t·500t"). 레벨 L = 이 값 × (1 + (L − 1) × 설정 칸 n50_storage_step).
   * 창고 단계(stage storage) 시설만 물건을 넣는다(원장 위치 = 그 건물, 무게 합 ≤ 용량). 채집 시설은 임대형 임차인 몫이 쌓이는 그 건물
   * 창고의 상한이다(넘친 산출은 나오지 않는다, 기획 정리 D-518 523 ②·414 — 넣기 명령은 받지 않는다).
   * 출발값 = 옛 야적장 1t·창고 10t·중앙창고 100t·대규모 창고 500t, 벌목장·광산 200kg·농장 300kg(seeds/building_seed.js weight_limit)
   */
  storageKg: z
    .int()
    .min(FACILITY_RUNTIME_LIMITS.storageKg.min)
    .max(FACILITY_RUNTIME_LIMITS.storageKg.max)
    .optional(),
  /**
   * 2차맵 겉모습(그림 자료, 판정에 쓰지 않음 — docs/adr/2026-11-08-building-art.md "바뀜 (2026-11-09)"): 모델 종류(엔진 로우폴리 모델)·
   * 벽 색·지붕 색(엔진 색 표 이름)·높이 배율(‰). 모두 선택: 모델이 없으면 엔진이 시설 ID로 고르고(모르는 ID는 일반 집), 색이 없으면 그
   * 모델의 기본 색, 높이가 없으면 1000‰. 출발값 = 엔진이 시설 ID로 고르던 모델(core@59). 건물 편집기 "2차맵 모습"에서 고친다
   */
  /**
   * 배 시설 역할(기획 D-547 1481·1488, docs/adr/2026-11-15-shipyard-harbor.md): shipyard = 조선소(배 만들기·고치기), berth = 정박장(배가 사는 곳),
   * trade_dock = 교역 부두(시간을 사서 상하차). 교통 단계(transport)·물가 조건과 함께 쓴다. 없으면 배 시설이 아니다
   */
  harbor: harborRoleSchema.optional(),
  /** 조선소가 만드는 배 종류 표(D-547 1484 — 배 종류마다 재료·시간). 조선소(harbor shipyard)에만 쓴다 */
  boats: boatTypesSchema.optional(),
  /**
   * 거래소 종류(기획 D-561 "거래소는 건물", docs/adr/2026-11-16-exchange-buildings.md, @terra/shared/exchange): goods = 물자 거래소, fx = 외환 거래소,
   * units = 유닛 거래소(D-242, 기능 전 잠금), securities = 증권 거래소(D-393·D-409 출시 뒤 잠금). 상업 단계(commerce)에만 쓴다. 없으면 거래소가 아니다
   */
  exchange: z.enum(EXCHANGE_KINDS).optional(),
  look: z
    .strictObject({
      model: z.enum(FACILITY_LOOK_MODELS).optional(),
      wall: z.enum(FACILITY_LOOK_COLORS).optional(),
      roof: z.enum(FACILITY_LOOK_COLORS).optional(),
      heightPm: z
        .int()
        .min(FACILITY_LOOK_LIMITS.heightPm.min)
        .max(FACILITY_LOOK_LIMITS.heightPm.max)
        .optional(),
    })
    .optional(),
});
export type FacilityEntry = z.output<typeof facilityEntrySchema>;

/** 채집 티어 수(T0~T9, D-5001) */
export const GATHER_TIER_COUNT = 10;
/** 구간 가중치 합(‰) */
export const GATHER_WEIGHT_TOTAL = 1000;

/**
 * 채집·채굴 티어 확률표 한 구간(49 N43, D-506): 유효 스탯이 from 이상(다음 구간 from 미만)이면 이 가중치(‰, T0~T9 차례, 합 1000)로
 * 티어를 뽑는다. 파일 차례 = from 차례(첫 구간 from 0, 늘어나기만, 2단계 검사). 마지막 구간은 위 끝이 없다.
 * 옛 프로젝트 skill_tier_probability(20 단위 구간)를 ‰로 옮겼고, 0~39는 [임시] T0 700·T1 150·T2 100·T3 50(사용자 답 300)
 * 바뀜(기획 D-552 "표 하나", docs/adr/2026-11-15-gather-object-tiers.md): 사다리마다 띠 표(D-540 1217 나, ladder 칸)를 없앴다 — 모든 채집이
 * 이 표 하나를 쓰고, 오브젝트마다 티어 범위(gather_objects tierRange)로 자른다.
 */
export const gatherTierEntrySchema = z
  .strictObject({
    id: contentId,
    from: z.int().min(0).max(100_000),
    weightsPm: z.array(z.int().min(0).max(GATHER_WEIGHT_TOTAL)).length(GATHER_TIER_COUNT),
  })
  .superRefine((entry, ctx) => {
    // 필드 검사가 실패해도 불린다(AGENTS 6장 Zod 4.6.7): 모양을 다시 보고 틀리면 건너뛴다
    const weights: unknown = entry.weightsPm;
    if (!Array.isArray(weights) || !weights.every((value) => Number.isInteger(value))) return;
    const sum = weights.reduce((total: number, value: number) => total + value, 0);
    if (sum !== GATHER_WEIGHT_TOTAL)
      ctx.addIssue({
        code: "custom",
        path: ["weightsPm"],
        message: `가중치 합이 ${sum}입니다. 합은 ${GATHER_WEIGHT_TOTAL}(‰)이어야 합니다.`,
        params: { rule: "gather_weights_sum" },
      });
  });
export type GatherTierEntry = z.output<typeof gatherTierEntrySchema>;

/** 파싱한 띠 구간 → 판정·미리 보기의 띠 모양(@terra/shared/gatherMath GatherBand: from·weightsPm). 읽는 곳이 모두 이 함수를 쓴다 */
export function gatherBandOfEntry(entry: GatherTierEntry): { from: number; weightsPm: number[] } {
  return { from: entry.from, weightsPm: [...entry.weightsPm] };
}

export const recipeEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  facility: ref("facilities"),
  inputs: z.array(stack).max(16),
  outputs: z.array(stack).min(1).max(16),
  /** [임시] 한 번 만드는 데 드는 작업량(효율 1000인 일꾼 한 시간 = 1000) */
  work: z.int().positive().max(100_000_000),
  enabled,
});
export type RecipeEntry = z.output<typeof recipeEntrySchema>;

export const necessityEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  item: ref("items"),
  /** [임시] 유닛 하나가 주기마다 쓰는 양(E28: 등급별 요구량은 기획 Step 5) */
  perUnit: z.int().positive().max(1_000_000),
  /** 주기(실제 시간 시, 질문 112 기본안: 1시간마다) */
  periodHours: z
    .int()
    .positive()
    .max(24 * 30),
  enabled,
});
export type NecessityEntry = z.output<typeof necessityEntrySchema>;

/** 국가 프리셋 도시 이름 하나(D-476: 도시 이름은 번역하지 않는다 — ko·en이 같은 글자 하나). 제어 문자 없이 1~24자 */
const cityName = z
  .string()
  .min(1)
  .max(24)
  .refine((text) => text.trim() === text && text !== "" && !/\p{Cc}/u.test(text), {
    error: "도시 이름은 앞뒤 빈칸·제어 문자 없이 1~24자로 적으세요(번역하지 않는다, D-476).",
    params: { rule: "city_name" },
  });

/** 국가 프리셋 사람 이름 조각 하나(휴먼 이름, 기획 답 773 나 — 도시 이름처럼 번역하지 않는다 D-476). 제어 문자 없이 1~16자 */
const personName = z
  .string()
  .min(1)
  .max(16)
  .refine((text) => text.trim() === text && text !== "" && !/\p{Cc}/u.test(text), {
    error: "사람 이름은 앞뒤 빈칸·제어 문자 없이 1~16자로 적으세요(번역하지 않는다, D-476).",
    params: { rule: "person_name" },
  });

/** 한 목록 안에서 겹치지 않는 사람 이름 조각 목록 */
const personNames = (max: number) =>
  z
    .array(personName)
    .max(max)
    .refine((names) => new Set(names).size === names.length, {
      error: "사람 이름 조각이 겹칩니다. 한 목록 안에서 하나씩 적으세요.",
      params: { rule: "person_name_unique" },
    });

/**
 * 국가 성격(기획 답 504 다·531 다·533 다·553 나·554 다, D-518 — docs/adr/2026-11-07-play-flow.md "WP5 나라 성격"·"WP10 경제 마무리"). 칸이
 * 없으면 모든 국가가 같은 기본이다(시작 도시 수 = 설정 칸 아래 끝, 도시 직무 = 서버 기본 셋, 처음 창고 = 생필품 48시간분).
 * - startCities: 큰 나라·작은 나라(고정 NPC 국가의 시작 도시 수, 설정 칸 d6041_start_cities_min~max 안으로 자른다)
 * - cityJobs: 특산 — 그 시설 건물이 없는 NPC 도시의 휴먼이 이 레시피를 Lv1로 돌리고, 그 시설 건물이 있으면 건물이 특산 차례대로 이 레시피를
 *   돌린다(레시피의 시설이 facility와 같아야 쓴다)
 * - startNecessityHours: 처음 창고 생필품 = 휴먼 수 × 이 시간분(없으면 48시간, 554 다)
 * - startStock: 처음 창고 특산 물건 — NPC 도시 하나가 처음 한 번 받는 고정 양(팩 수량 = 묶음 단위). 생필품은 위 시간분으로 받는다(554 다)
 */
const nationPersonality = z.strictObject({
  startCities: z
    .int()
    .min(NATION_SEED_LIMITS.startCities.min)
    .max(NATION_SEED_LIMITS.startCities.max)
    .optional(),
  startNecessityHours: z
    .int()
    .min(0)
    .max(24 * 30)
    .optional(),
  cityJobs: z
    .array(z.strictObject({ facility: ref("facilities"), recipe: ref("recipes") }))
    .min(1)
    .max(8)
    .optional(),
  startStock: z.array(stack).max(16).optional(),
  /**
   * 국가마다 세계 씨앗 값(docs/adr/2026-11-10-nation-editor.md 2절, 사용자 요청 2026-11-10 "유닛 수 등등 디테일한 조정"): 칸이 없으면 모든
   * 국가가 같은 설정 칸 값(49 worldSeed — npc_seed_housing·npc_seed_population_pm·npc_seed_farms·npc_seed_lumber_camps·npc_seed_mines·
   * npc_seed_storehouses). 범위는 그 설정 칸과 같다. 새로 서는 시작 도시·모자란 기본 시설·처음 인구에만 든다(이미 선 것은 고치지 않는다)
   */
  startHousing: z.int().min(NATION_SEED_LIMITS.housing.min).max(NATION_SEED_LIMITS.housing.max).optional(),
  startPopulationPm: z
    .int()
    .min(NATION_SEED_LIMITS.populationPm.min)
    .max(NATION_SEED_LIMITS.populationPm.max)
    .optional(),
  startFarms: z.int().min(NATION_SEED_LIMITS.facility.min).max(NATION_SEED_LIMITS.facility.max).optional(),
  startLumberCamps: z
    .int()
    .min(NATION_SEED_LIMITS.facility.min)
    .max(NATION_SEED_LIMITS.facility.max)
    .optional(),
  startMines: z.int().min(NATION_SEED_LIMITS.facility.min).max(NATION_SEED_LIMITS.facility.max).optional(),
  startStorehouses: z
    .int()
    .min(NATION_SEED_LIMITS.facility.min)
    .max(NATION_SEED_LIMITS.facility.max)
    .optional(),
  /**
   * 국가마다 경비대 수(시작 도시 하나)·처음 기술 단계(docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)"): 칸이 없으면 국력 등급 표
   * (nation_tiers) 값, 등급도 없으면 경비대 0·기술 1
   */
  startGuards: z.int().min(NATION_SEED_LIMITS.guards.min).max(NATION_SEED_LIMITS.guards.max).optional(),
  startTech: z.int().min(NATION_SEED_LIMITS.tech.min).max(NATION_SEED_LIMITS.tech.max).optional(),
});

/**
 * 국가 마크 사양(만든 마크 — docs/adr/2026-11-10-nation-editor.md 4절): 틀·나눔·상징·색 짜임. 색은 시그니처 컬러에서 낸다
 * (@terra/shared/nationEmblem). 없으면 프리셋 ID로 정해지는 기본 마크. 편집기에서 올린 그림은 팩이 아니라 그 세계 DB에 있다
 */
const nationEmblem = z.strictObject({
  shape: z.enum(EMBLEM_SHAPES),
  division: z.enum(EMBLEM_DIVISIONS),
  charge: z.enum(EMBLEM_CHARGES),
  scheme: z
    .int()
    .min(0)
    .max(EMBLEM_SCHEME_COUNT - 1),
});

export const nationPresetEntrySchema = z.strictObject({
  id: contentId,
  name: localizedText,
  /**
   * 세력 약어·시그니처 컬러(docs/adr/2026-11-09-faction-profiles.md): 그 나라 세력이 처음 생길 때 정체성 값으로 쓴다(관리자가 나중에 고친다).
   * 없으면 서버 기본값(약어 = "F" + 세력 ID, 색 = 기본 색 표). 약어는 세계 안에서 하나여야 해서, 겹치면 서버가 처음 정할 때 기본값으로 바꾼다
   */
  shortName: z
    .string()
    .refine(isFactionShort, {
      error: "세력 약어는 빈칸 없이 글자·숫자 2~5자로 적으세요.",
      params: { rule: "faction_short" },
    })
    .optional(),
  color: z
    .string()
    .refine(isFactionColor, { error: "색은 #rrggbb(소문자)로 적으세요.", params: { rule: "faction_color" } })
    .optional(),
  /**
   * 세력 화폐(D-124·D-131). 원장 자산 코드는 "cur:<code>". symbol = 화폐 기호(1~3자), ticker = 3글자 약어(영어 대문자, 세계 안에서 하나 — 겹치면 서버가 처음 정할 때 다른 3자로 바꾼다).
   * 없으면 서버 기본값(기호 = 이름 첫 글자, 약어 = 코드에서 만든 겹치지 않는 3자)
   */
  currency: z.strictObject({
    code: contentId,
    name: localizedText,
    symbol: z
      .string()
      .refine(isCurrencySymbol, {
        error: "화폐 기호는 빈칸 없이 1~3자로 적으세요.",
        params: { rule: "currency_symbol" },
      })
      .optional(),
    ticker: z
      .string()
      .refine(isCurrencyTicker, {
        error: "화폐 약어는 영어 대문자 3자로 적으세요.",
        params: { rule: "currency_ticker" },
      })
      .optional(),
  }),
  /** 국가 마크(만든 마크 사양, 위). 없으면 프리셋 ID로 정해지는 기본 마크 */
  emblem: nationEmblem.optional(),
  /**
   * 이름 말씨(편집기 [이름 만들기]가 쓰는 음절 표, @terra/shared/nameGen — 기획 30 §5.3 문화 모티프 16개에 하나씩 [임시]). 게임 규칙은
   * 읽지 않는다(이름 후보를 만들 때만)
   */
  nameStyle: z.enum(NAME_STYLE_IDS).optional(),
  /**
   * 국력 등급(사용자 답 2026-11-11 "실제 강대국 분포처럼" — docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)"): 등급 표(nation_tiers)의
   * 그 줄이 시작 도시 수·주거·처음 인구·기본 시설·경비대·기술·국고·자리 간격의 기본값이 된다(성격 칸의 국가마다 값이 먼저). 없으면 등급 없이
   * 옛 규칙(설정 칸 worldSeed)
   */
  powerTier: z.enum(POWER_TIERS).optional(),
  /** [임시] 거래세(만분율). NPC 세율은 규칙식(D-323, R5)이 바꾼다 */
  tradeTaxBp: z.int().min(0).max(10_000),
  /**
   * 성향 칸(기획 D-573 1991 — 사용자 답 "국가 편집기에 성향 칸, 비어 있으면 무작위"): 세력 성향 4축(공격·상업·신앙·정거장 태도, 0~1000 — D-327)과 지도자 기질
   * (−1000~1000‰ — 설정 칸 폭 안 위치). NPC 판단·채집 티어 성향·도시 성장 성향이 읽는다. 빈 칸(축마다)은 (세계 시드, 세력)으로 굴린 값. 없으면 모두 무작위
   */
  temper: z
    .strictObject({
      aggression: z.int().min(0).max(1000).optional(),
      commerce: z.int().min(0).max(1000).optional(),
      faith: z.int().min(0).max(1000).optional(),
      station: z.int().min(0).max(1000).optional(),
      leader: z.int().min(-1000).max(1000).optional(),
    })
    .optional(),
  /** 나라 성격(위). 없으면 모든 국가가 같은 기본 */
  personality: nationPersonality.optional(),
  /**
   * NPC 도시 이름(기획 답 510 다, D-476 번역 안 함): 그 국가의 NPC 도시가 차례로 쓴다(도시 ID 차례, 쓴 이름은 건너뜀). 없거나 모자라면
   * 화면이 "<국가> 도시 N"으로 부른다. 목록 안에서 겹치지 않는다
   */
  cityNames: z
    .array(cityName)
    .max(32)
    .refine((names) => new Set(names).size === names.length, {
      error: "도시 이름이 겹칩니다. 한 국가 안에서 하나씩 적으세요.",
      params: { rule: "city_name_unique" },
    })
    .optional(),
  /**
   * 국가 지도자 사이보그 이름(기획 46 §10.1 NPC 지도자·30 §5.3 대표 유닛 D-075 — docs/adr/2026-11-07-play-flow.md "WP-NPC"). 서버가 그 국가
   * 수도 행정 건물 곁에 지도자 유닛을 세우고 세력 화면·정부 판·지도의 한눈 정보가 이 이름을 보인다. 없으면 화면이 "지도자"
   * 기획 정리 747 나("WP-NPC3"): 이 칸은 지도자(지금 통치자)만이다. 국가 대표 유닛(D-075 신화·전설·역사 인물, 여럿, 전투·수집 콘텐츠)은
   * 지도자와 따로 둔다 — TODO: 대표 유닛 목록 칸(예: representativeUnits)은 개발자 페이지에서 정하는 콘텐츠(D-398)가 생길 때 더한다(지금 칸 없음).
   * 이름은 가상 이름 [임시](D-076, docs/adr/2026-11-10-nation-editor.md 3절).
   */
  leaderName: localizedText.optional(),
  /**
   * 한 줄 소개(첫 접속 나라 고르기 카드 — 사용자 요청 2026-11-11 "간단소개", docs/adr/2026-11-01-first-login-cyborg.md "바뀜 (2026-11-11)").
   * 가상 나라의 분위기 글 [임시](실제 나라 이름·실존 인물 금지). 게임 규칙은 읽지 않는다. 없으면 카드에 소개 줄이 없다
   */
  intro: localizedText
    .refine(
      (text) =>
        text.ko.length <= NATION_LIST_LIMITS.introLength && text.en.length <= NATION_LIST_LIMITS.introLength,
      {
        error: `소개는 언어마다 ${NATION_LIST_LIMITS.introLength}자까지 적으세요.`,
        params: { rule: "nation_intro_length" },
      },
    )
    .optional(),
  /**
   * NPC 휴먼 이름(기획 답 773 나 — 이름 규칙 + 목록 콘텐츠, D-5045·D-398, docs/adr/2026-11-07-play-flow.md "WP-NPC4"). 이름 규칙 [임시] =
   * "이름 성"(성 목록이 없으면 이름만): 서버가 유닛 ID로 이름·성을 하나씩 결정적으로 고른다(그 휴먼이 사는 나라의 목록 — 반란·종주·태어날 때
   * 부모를 따라감). 번역하지 않는다(D-476). 없으면 화면이 "휴먼 #ID". 목록은 개발자 페이지에서 정할 콘텐츠(D-398) — 지금 값은 [임시]
   */
  humanNames: z
    .strictObject({
      given: personNames(64).refine((names) => names.length > 0, {
        error: "이름 목록은 하나 이상이어야 합니다.",
        params: { rule: "person_name_given" },
      }),
      family: personNames(64).optional(),
    })
    .optional(),
  enabled,
});
export type NationPresetEntry = z.output<typeof nationPresetEntrySchema>;

/**
 * 국력 등급 표 한 줄(분류 nation_tiers, 사용자 답 2026-11-11 — docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)"). ID = 등급
 * (@terra/shared/nationTier POWER_TIERS). 수치는 모두 [임시](질문 916). 시설 수는 시설 ID마다 적는다(둘레 땅에 맞는 것만 선다, 줄이 없는
 * 시설은 설정 칸 값)
 */
export const nationTierEntrySchema = z.strictObject({
  id: z.enum(POWER_TIERS),
  name: localizedText,
  startCities: z.int().min(NATION_TIER_LIMITS.startCities.min).max(NATION_TIER_LIMITS.startCities.max),
  startHousing: z.int().min(NATION_TIER_LIMITS.housing.min).max(NATION_TIER_LIMITS.housing.max),
  startPopulationPm: z
    .int()
    .min(NATION_TIER_LIMITS.populationPm.min)
    .max(NATION_TIER_LIMITS.populationPm.max),
  facilities: z
    .array(
      z.strictObject({
        facility: ref("facilities"),
        count: z.int().min(NATION_TIER_LIMITS.facilityCount.min).max(NATION_TIER_LIMITS.facilityCount.max),
      }),
    )
    .max(NATION_TIER_LIMITS.facilities)
    .refine((rows) => new Set(rows.map((row) => row.facility.id)).size === rows.length, {
      error: "시설이 겹칩니다. 시설마다 한 줄만 적으세요.",
      params: { rule: "tier_facility_unique" },
    }),
  guardsPerCity: z.int().min(NATION_TIER_LIMITS.guardsPerCity.min).max(NATION_TIER_LIMITS.guardsPerCity.max),
  startTech: z.int().min(NATION_TIER_LIMITS.startTech.min).max(NATION_TIER_LIMITS.startTech.max),
  startCreditPm: z.int().min(NATION_TIER_LIMITS.startCreditPm.min).max(NATION_TIER_LIMITS.startCreditPm.max),
  cityStepCells: z.int().min(NATION_TIER_LIMITS.cityStepCells.min).max(NATION_TIER_LIMITS.cityStepCells.max),
  homeGapPm: z.int().min(NATION_TIER_LIMITS.homeGapPm.min).max(NATION_TIER_LIMITS.homeGapPm.max),
});
export type NationTierEntry = z.output<typeof nationTierEntrySchema>;
