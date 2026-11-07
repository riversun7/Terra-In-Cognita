// 세력·사회 계수표 — docs/adr/2026-10-31-faction-society-core.md "계수 한 곳"
// 세력·도시·인구·기술·노동 규칙의 수치를 이 표 하나에 모은다. 기획 설정 칸(49 §6.5 N·§7 S·T)에 출발값이 있으면 그 값, 없으면 [임시].
// 노동 공식(labor.ts)의 정본은 기획 48 §7이다. 시각은 실제 시간 ms, 배율은 ‰. N·S 코드 ↔ 칸 대응은 ADR faction-society-core.
import { type FacilityBuildRules, OLD_FACILITY_BUILD_RULES } from "@terra/shared/facilityBuild";
import { type FacilityRuntimeRules, OLD_FACILITY_RUNTIME_RULES } from "@terra/shared/facilityRuntime";
import { START_TERRITORY_COEFFICIENTS, type TerritoryCoefficients } from "@terra/shared/territory";
import { type LaborRules, OLD_LABOR_RULES } from "../economy/laborContract.ts";
import { type GardenerCoefficients, TEST_GARDENER_COEFFICIENTS } from "../gardener/coefficients.ts";
import { type NpcCoefficients, TEST_NPC_COEFFICIENTS } from "../npc/coefficients.ts";
import { type SystemSwitches, TEST_SYSTEM_SWITCHES } from "../tuningSwitches.ts";
import type { CyborgTemperament } from "./cyborgStats.ts";
import { type FusionCoefficients, OLD_FUSION_COEFFICIENTS } from "./fusion.ts";
import { OLD_RECRUIT_COEFFICIENTS, type RecruitCoefficients } from "./recruitment.ts";

export interface SocietyCoefficients {
  /** 도시 주식 수(D-130) */
  readonly sharesPerCity: number;
  /** 배당(도시 세금 정산) 주기(D-130 7일, D-443 설정값). 시뮬은 하루 끝에서 날 수로 내림해 돈다 */
  readonly dividendEveryMs: number;
  /** 상장폐지 뒤 다시 내는 주식 수(D-298·D-443 설정값, 출발값 = 도시 주식 수). 받는 곳은 점령국 체제대로(D-444) */
  readonly delistReissueShares: number;
  /**
   * 독재 점령국의 재발행에서 지배 가문이 충성 보상으로 나눠 주는 몫(‰, D-344·D-444 설정값. 기획 값이 없어 출발값은 기술 기본안
   * 200 = 20%). 지배 가문 과반을 넘겨 줄 수는 없다
   */
  readonly delistLoyaltyPm: number;
  /** 반란 문턱: 도시 평균 만족도(S26 예시 40). 이하면 반란 중(D-253) */
  readonly rebellionThreshold: number;
  /** 민심 표 반란 예고 문턱(N35 설정값, 출발값 50 — D-444·D-5032): 반란 문턱 위 ~ 이 값 이하 = 반란 예고(D-443 155) */
  readonly rebellionWarningAt: number;
  /** 민심 표 태업 조짐 문턱(49 N35 설정값 출발값 60, D-443·D-446·D-5032): 반란 예고 위 ~ 이 값 이하 = 태업 조짐 */
  readonly sabotageAt: number;
  /** 독립 통과 문턱(S27 구조 값): 자본주의 찬성 지분 ‰ 이상, 민주주의 가문 과반 */
  readonly independencePassPm: number;
  /** [임시] 편입 제안 기한(S30 출발값 없음) */
  readonly offerDeadlineMs: number;
  /** [임시] 점령 만족도 하락: 약탈·통합(D-186 Step 5), 상장폐지(S31), 독재로 바뀜(S23) */
  readonly lootSatisfactionDrop: number;
  readonly integrateSatisfactionDrop: number;
  readonly delistSatisfactionDrop: number;
  readonly dictatorshipSatisfactionDrop: number;
  /** [임시] 상장폐지 때 다른 세력과의 관계 점수 하락(S31) */
  readonly delistRelationDrop: number;
  /** [임시] 약탈이 가져가는 도시 금고·공공 창고 몫(만분율) */
  readonly lootTakeBp: number;
  /** 상속세(S22 기존 50%, 만분율) */
  readonly inheritanceTaxBp: number;
  /** 휴먼 수명(T4 참고값 실제 2~3개월) */
  readonly lifespanMinMs: number;
  readonly lifespanMaxMs: number;
  /** [임시] 수명이 다했을 때 환생·신격화 확률(‰, D-395 시설 서비스 전 단계) */
  readonly rebirthPm: number;
  readonly deifyPm: number;
  /**
   * 구인 카드(D-469 출생 없음 → 인구는 행정 건물 구인 카드로만, 49 N45 옛 hq_routes.js 값, Lv4·Lv5 [임시]). 팩 tuning 경로 "recruit.*".
   * 규칙은 society/recruitment.ts
   */
  readonly recruit: RecruitCoefficients;
  /**
   * 사이보그 유닛 융합·유전자 조각(D-470·D-478·D-481, 49 N46·N47, 옛 craftCyborg·LifeEngine·reincarnate 값). 팩 tuning 경로 "fusion.*".
   * 규칙은 society/fusion.ts. 시뮬은 읽지 않는다(서버 융합·환생·사망 조각이 읽는다)
   */
  readonly fusion: FusionCoefficients;
  /** 지상 기술 단계 상한(질문 121 기본안: 시설 Lv1~5 사다리) */
  readonly techGroundMax: number;
  /** [임시] 단계 n으로 오르는 연구 작업량(효율 1000인 연구 일꾼 한 시간 = 1000) = researchWorkBase × n */
  readonly researchWorkBase: number;
  /** [임시] 단계 n의 도시 발전도 하한 = developmentPerTech × (n − 1) */
  readonly developmentPerTech: number;
  /** 설계도 할인(D-396 출발값 50%, 만분율) */
  readonly blueprintDiscountBp: number;
  /** 피로 상한(N21 구조 값 120) */
  readonly fatigueMax: number;
  /** 피로 구간 불이익(N23): 구간 하한(포함) → 능력 ‰, 이동 ‰ */
  readonly fatigueBands: readonly {
    readonly from: number;
    readonly abilityPm: number;
    readonly movePm: number;
  }[];
  /** 피로 회복 기본(N24 +1/3분 = 1점 푸는 데 180,000ms) */
  readonly fatigueRecoverStepMs: number;
  /** 주거 등급 1~3 회복 배율(N24 ×1.5·×2·×3, ‰). 0번은 쓰지 않는다(주거 없음 = 노숙) */
  readonly housingRecoveryPm: readonly number[];
  /** [임시] 노숙 회복 배율(S25 "아주 크게", 출발값 없음) */
  readonly homelessRecoveryPm: number;
  /** [임시] 만족도 → 회복 배율(N25 출발값 없음): 만족도 0이면 이 ‰, 100이면 1000 */
  readonly lowSatisfactionRecoveryPm: number;
  /** 기준 단가(N27 기존 고정 2.0 = 효율 1점당 2,000밀리 화폐) */
  readonly wageRateMilli: number;
  /** [임시] 기준 단가 수급(N27 모양 기술 기본안): 수요/공급 비가 1을 벗어난 만큼 이 ‰로 움직이고 [min, max]‰ 안 */
  readonly wageElasticityPm: number;
  readonly wageRateMinPm: number;
  readonly wageRateMaxPm: number;
  /** [임시] 기준 단가 재계산 주기(N27) */
  readonly wageRecalcMs: number;
  /** [임시] 고용주 조정 범위(N28 출발값 없음, ‰) */
  readonly employerAdjustMinPm: number;
  readonly employerAdjustMaxPm: number;
  /** 직무 스킬 보너스(N31 기존 레벨 × 2.0 → "생활" 태그 스킬 등급당 2점) */
  readonly lifeSkillBonusPerGrade: number;
  /** 생산(N32): 진행 = max(1, ⌊주 ÷ 나눔⌋)/틱, 추가 수확 = ⌊보조 × ‰⌋ */
  readonly productionMainDivisor: number;
  readonly productionSubYieldPm: number;
  /**
   * [임시] 채집 시설 레벨의 상위 티어 확률 보너스(49 N43, D-506 301): 티어 추첨의 유효 스탯 += 이 값 × (레벨 − 1).
   * 출발값 없음(사용자 확인 대기) → 10점(economy/gather.ts gatherStat)
   */
  readonly gatherLevelBonus: number;
  /**
   * 1차 생산 필요 진행(49 N44, D-507, 옛 BuildingGatherEngine tierRequiredProgress): 티어 T 한 번 = max(기본, 기본 + T × 걸음) 진행.
   * 옛 값 기본 30·걸음 30(T0 30 … T9 300). 사다리(추첨·선택)에서 나오는 산출에 쓴다(레시피 작업량은 사다리 밖 산출)
   */
  readonly gatherTierProgressBase: number;
  readonly gatherTierProgressStep: number;
  /** 진행 1의 길이(49 N44): 기준 일꾼(진행 속도 1)이 진행 1을 쌓는 시간. 옛 1분 틱(server.js BuildingGatherTick 60,000ms) */
  readonly gatherTickMs: number;
  /** 광석 한 번 캘 때 g(49 N44, 기술 처리): 옛 1개 = 1kg(ITM-10 무게 1.0) → 1,000g. 기본 단위가 g인 아이템(묶음 > 1)에 쓴다 */
  readonly gatherOreGrams: number;
  /** 포만감 효율 배율(N33): 포만감 이하 → 효율 ‰ (기존 50 이하 0.7, 30 이하 0) */
  readonly foodEfficiency: readonly { readonly atMost: number; readonly pm: number }[];
  /** 임금 비교 범위(N30 같은 도시 같은 직무 상위 25%, ‰) */
  readonly wageTopSharePm: number;
  /**
   * [임시] 만족도 요소의 목표 기여(N29 출발값 없음, 점): 기본, 포만감(충족도 1000‰일 때), 주거(등급 1·2·3), 노숙,
   * 임금(상위 평균과 같을 때), 임금 격차 불만(비율이 문턱 아래), 신앙, 전쟁, 부상
   */
  readonly satisfactionTarget: {
    readonly base: number;
    readonly food: number;
    readonly housing: readonly number[];
    readonly homeless: number;
    readonly wage: number;
    readonly wageGap: number;
    readonly wageGapFloorPm: number;
    readonly faith: number;
    readonly war: number;
    readonly injury: number;
  };
  /** [임시] 목표값으로 다가가는 속도(N29 복원 속도, 하루에 차이의 ‰) */
  readonly satisfactionRestorePmPerDay: number;
  /** 속국·봉신 공물(S33 설정값 ‰, 출발값 주 5% — D-443·D-444·D-5032): 상위 세력에 내는 국고 몫. 세력 화면도 이 값을 보인다 */
  readonly tributePm: number;
  /** 공물 주기(주마다). 시뮬은 하루 끝에서 날 수로 내림해 돈다 */
  readonly tributeEveryMs: number;
  /** NPC 판단 계수(docs/adr/2026-11-01-npc-brain-r5.md, 팩 tuning 경로 "npc.*") */
  readonly npc: NpcCoefficients;
  /** 오염·정원사 웨이브 계수(docs/adr/2026-11-01-gardener-r5b.md, 팩 tuning 경로 "gardener.*") */
  readonly gardener: GardenerCoefficients;
  /**
   * 시설 건설 시간(49 M14, D-508, 팩 tuning 경로 "facilityBuild.*"): 옛 seeds/building_seed.js 값. 셈은 @terra/shared/facilityBuild.
   * 화폐 유지비는 없다(D-171, 49 N50: 건물 유지 = 내구도 + 수리 재료).
   * 지금 짓기가 없어 시뮬은 읽지 않는다(건물 편집기 미리 보기가 읽는다, docs/adr/2026-11-02-building-editor.md)
   */
  readonly facilityBuild: FacilityBuildRules;
  /**
   * 건물 노화·상태 문턱·수리·일꾼 단축·레벨별 내구도·창고·장비 수리 시간(49 N50·M15·N54, D-509·D-514, 팩 tuning 경로 "facilityRuntime.*",
   * docs/adr/2026-11-07-buildings-runtime.md). 셈은 @terra/shared/facilityRuntime. 시뮬은 읽지 않는다(서버 건물 서비스가 읽는다)
   */
  readonly facilityRuntime: FacilityRuntimeRules;
  /**
   * 영토 층(49 M2·M3·N42·N51, D-104·D-485·D-486, 팩 tuning 경로 "territory.*", docs/adr/2026-11-03-territory-layer.md): 도시 등급 문턱·
   * 영향권 반경·비콘 수·거리·내구도. 셈은 @terra/shared/territory. 시뮬은 아직 읽지 않는다(서버 영토 서비스가 읽는다)
   */
  readonly territory: TerritoryCoefficients;
  /** 노동 계약(49 N48, D-479, 팩 tuning 경로 "labor.*"): 옛 규칙 값. docs/adr/2026-11-03-labor-contracts.md */
  readonly labor: LaborRules;
  /** 사이보그 성장·환생·속성·유지·정착 지원금(48 §2, D-417·D-440·D-441·D-450~D-453·D-455, 49 N6·N7·N9·N34·N36~N39) */
  readonly cyborg: {
    /** 만렙(N7 기본 50, 구조 값). 특수 만렙 60은 누가 받는지 정해지지 않아 두지 않는다 */
    readonly maxLevel: number;
    /** 레벨당 성장률(N5 출발값 100‰, D-417): 1차 = 초기 × (1000 + 성장률 × K × (Lv − 1) ÷ 1000) ÷ 1000 */
    readonly growthPm: number;
    /** K 범위(N6 800~1200‰, 생성·환생 리롤 때 균등) */
    readonly kMinPm: number;
    readonly kMaxPm: number;
    /** 초기 스탯 합·칸 범위(N9 합 60, 칸 1~20). 환생 분포 변경(다시 굴림, D-444)도 이 안 */
    readonly initialSum: number;
    readonly initialMin: number;
    readonly initialMax: number;
    /**
     * 성향 목록(N9, D-6039·D-445 168): 고르면 그 칸의 평균이 오른다. 출발값은 균형(치우침 없음)·전투형 STR·VIT·기술형
     * INT·DEX·교역형 INT·WIS. 팩 tuning은 정수 칸만이라 목록은 이 표에 둔다(개발자 설정 D1이 생기면 옮긴다)
     */
    readonly temperaments: readonly CyborgTemperament[];
    /** 다시 굴리기 횟수(N9 출발값 3, 처음 굴림은 따로 — D-445 169). 생성과 환생이 같은 값을 쓴다(D-444 164) */
    readonly initialRerolls: number;
    /**
     * 성향 칸 평균을 올리는 양(치우침 값, 설정값). 나머지 칸 평균은 합이 그대로가 되게 내려간다. 출발값 4000(D-445 168이 받은
     * 첫 접속 질문 168 가: 고른 두 칸 평균 14, 나머지 넷 8, 균형은 모두 10)
     */
    readonly initialFavorMilli: number;
    /** 칸마다 정규분포 표준편차(밀리점, 옛 CHR-1 §4.2 "약 3" → 3000, D-445 168 "표준편차 약 3") */
    readonly initialSpreadMilli: number;
    /**
     * 첫 접속 시작 도시 붐빔 띠(D-6041·D-445 175 설정값, 그 도시에서 시작한 사이보그 수): 이 수부터 보통, 다음 수부터 붐빔.
     * 출발값 20·50(docs/adr/2026-11-01-first-login-cyborg.md)
     */
    readonly startCrowdNormal: number;
    readonly startCrowdBusy: number;
    /** 스킬 최대 등급 = min(기본 + 환생 횟수, 상한)(D-031 기본 3, D-5001 상한 10) */
    readonly skillGradeBase: number;
    readonly skillGradeMax: number;
    /**
     * 환생 비용(N34 설정값, 출발값 신앙도 50·화폐 10,000 — D-444·D-5032): 신앙도 문턱(0~100, 쓰지 않고 이만큼 있는지만 본다.
     * 환생하면 0 — D-451), 화폐(신전 도시 화폐 최소 단위)
     */
    readonly rebirthFaith: number;
    readonly rebirthCurrency: number;
    /** 생성 속성 분배(N36 구조 값, D-450 원문 "두가지속성만 선택"·"10개씩 분배"): 4원소 가운데 고를 수 있는 칸 수, 나눌 점수 */
    readonly elementCells: number;
    readonly elementPoints: number;
    /** 종교 환생 빛·어둠 값(N37, 출발값 없음 → 설정값 출발값 5): 진로별 종교 아이템으로 갈래를 열면 그 칸에 더한다(D-450·D-452) */
    readonly lightDarkPoints: number;
    /**
     * 사이보그 인공장기·생활비(N38, 출발값 없음 → 설정값 출발값, D-453): 유지비 경계(정시)마다 닳는 내구도, 수리로 되찾는 내구도
     * 1점당 비용(최소 단위), 생활비(유닛 유지비 D-150)를 못 냈을 때 효율(‰)
     */
    readonly organWearPerPeriod: number;
    readonly organRepairCost: number;
    readonly livingUnpaidPm: number;
    /**
     * 정착 지원금(N39, D-455 190·D-163·D-218, 출발값 없음 → 설정값 출발값): 기본액(최소 단위, 처음 며칠 생활비 — 출발값 72 = 3일 × 정시 24번 ×
     * 시험 유지비 1), 세력 배율 ‰ = 최대 − 걸음 × (그 세력 시작 수 − 가장 적은 세력 시작 수), 최소에서 멈춤
     */
    readonly grantBase: number;
    readonly grantMaxPm: number;
    readonly grantMinPm: number;
    readonly grantStepPm: number;
  };
  /**
   * 장비·인공장기 수리(D-5031, 49 F11·F12): 수리 시설 Lv1~5의 최대 내구도 감소(%, 장인 실력 1000‰이면 반으로 줄어든다), 감소 하한(%),
   * 최대 내구도가 이 값 이하면 파괴(분해만 가능).
   * 장비 전투 닳기(D-496 289, 49 N49·C20, docs/adr/2026-11-03-item-holdings.md): 전투마다 입은 장비가 wearChancePm(‰) 확률로 wearAmount
   * (이겨도, 옛 BattleResult 25%·1), 지면 wearLossChancePm 확률로 wearLossAmount를 더(옛 문서 "약 15% 확률로 크게", 양은 [임시] 4)
   */
  readonly durability: {
    readonly repairLossPct: readonly number[];
    readonly repairLossFloorPct: number;
    readonly destroyAtMax: number;
    readonly wearChancePm: number;
    readonly wearAmount: number;
    readonly wearLossChancePm: number;
    readonly wearLossAmount: number;
    /** 탄약 보충 한 번에 줄어드는 최대 내구도(‰, 올림, D-509 "최대내구도 점차 감소" — 값 [임시]) */
    readonly ammoRefillLossPm: number;
    /**
     * 장인 실력의 적정 점수(D-512 323 ④, D-420 틀): 장인 실력‰ = min(1000, 제작 직무 점수 × 1000 ÷ 이 값). 제작 직무 점수 = 가중치 표의
     * 제작 직무 행(팩 stat_rows job_crafting, 48 §7.2). 값 [임시] 50(새 유닛 평균 1차 10이면 200‰, 48 §3.5 Lv30 예 ≈ 44.5 → 890‰)
     */
    readonly craftAppropriate: number;
  };
  /**
   * 소모품 사용(D-509·D-510): 물약은 전투·비전투 상관없이 유닛마다 한 번 쓰면 potionCooldownMs 뒤에 다시 쓴다(스태미나 소모 없음),
   * 요리(식품)는 foodCooldownMs(5분, 생필품 포만감 N33은 따로). 자동 물약: HP가 문턱(‰, 플레이어 AI 작전 슬라이더 D-5039의 출발값 [임시] — D-510 예 40%) 아래면
   * 모자란 HP를 가장 덜 넘치게 채우는 물약(docs/adr/2026-11-03-item-holdings.md)
   */
  readonly consumables: {
    readonly potionCooldownMs: number;
    readonly foodCooldownMs: number;
    readonly potionHpThresholdPm: number;
    /**
     * 보관 곳마다 보존 배율(‰, 1000 = ×1, 0 = 멈춤 — D-512 322, 49 N49). 출발값 = 옛 문서 Consolidated_Item.md:1862~1868(냉장 ×2·절임 ×3·
     * 통조림 ×5·냉동 멈춤), 유닛이 듦 ×1·거래소 멈춤(D-289), 창고(보존 시설 없음) ×1 [임시]. 칸 이름 = @terra/sim items/holding.ts STORAGE_PLACES
     */
    readonly preservePm: {
      readonly unit: number;
      readonly storage: number;
      readonly fridge: number;
      readonly pickle: number;
      readonly can: number;
      readonly freezer: number;
      readonly exchange: number;
    };
  };
  /**
   * 생명 수치 회복(D-514, 49 N54): 부상 단계(0 없음·1 경상·2 중상·3 중태, D-145)마다 분당 HP 회복에 곱하는 ‰와 1차 스탯
   * 불이익(‰ 감소). 0번 칸은 다치지 않은 유닛(1000·0, 구조 값). [임시] 출발값
   */
  readonly vitals: {
    readonly injuryRegenPm: readonly number[];
    readonly injuryPenaltyPm: readonly number[];
  };
  /** 운영자 런타임 온/오프 스위치(49 N53, D-513, 팩 tuning 경로 "switches.*") */
  readonly switches: SystemSwitches;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;

export const TEST_SOCIETY_COEFFICIENTS: SocietyCoefficients = {
  sharesPerCity: 1000,
  dividendEveryMs: 7 * DAY,
  delistReissueShares: 1000,
  delistLoyaltyPm: 200,
  rebellionThreshold: 40,
  rebellionWarningAt: 50,
  sabotageAt: 60,
  independencePassPm: 500,
  offerDeadlineMs: 3 * DAY,
  lootSatisfactionDrop: 25,
  integrateSatisfactionDrop: 5,
  delistSatisfactionDrop: 15,
  dictatorshipSatisfactionDrop: 20,
  delistRelationDrop: 20,
  lootTakeBp: 5000,
  inheritanceTaxBp: 5000,
  lifespanMinMs: 60 * DAY,
  lifespanMaxMs: 90 * DAY,
  rebirthPm: 100,
  deifyPm: 10,
  recruit: {
    ...OLD_RECRUIT_COEFFICIENTS,
    levels: OLD_RECRUIT_COEFFICIENTS.levels.map((level) => ({ ...level })),
  },
  fusion: { ...OLD_FUSION_COEFFICIENTS },
  techGroundMax: 5,
  researchWorkBase: 48_000,
  developmentPerTech: 20,
  blueprintDiscountBp: 5000,
  fatigueMax: 120,
  fatigueBands: [
    { from: 0, abilityPm: 1000, movePm: 1000 },
    { from: 31, abilityPm: 900, movePm: 1000 },
    { from: 61, abilityPm: 750, movePm: 850 },
    { from: 91, abilityPm: 500, movePm: 700 },
  ],
  fatigueRecoverStepMs: 180_000,
  housingRecoveryPm: [1000, 1500, 2000, 3000],
  homelessRecoveryPm: 100,
  lowSatisfactionRecoveryPm: 500,
  wageRateMilli: 2000,
  wageElasticityPm: 500,
  wageRateMinPm: 500,
  wageRateMaxPm: 2000,
  wageRecalcMs: 6 * HOUR,
  employerAdjustMinPm: 800,
  employerAdjustMaxPm: 1500,
  lifeSkillBonusPerGrade: 2,
  productionMainDivisor: 20,
  productionSubYieldPm: 80,
  gatherLevelBonus: 10,
  gatherTierProgressBase: 30,
  gatherTierProgressStep: 30,
  gatherTickMs: 60_000,
  gatherOreGrams: 1000,
  foodEfficiency: [
    { atMost: 30, pm: 0 },
    { atMost: 50, pm: 700 },
  ],
  wageTopSharePm: 250,
  satisfactionTarget: {
    base: 20,
    food: 40,
    housing: [0, 15, 20, 25],
    homeless: -20,
    wage: 20,
    wageGap: -10,
    wageGapFloorPm: 600,
    faith: 10,
    war: -15,
    injury: -10,
  },
  satisfactionRestorePmPerDay: 300,
  tributePm: 50,
  tributeEveryMs: 7 * DAY,
  npc: TEST_NPC_COEFFICIENTS,
  gardener: TEST_GARDENER_COEFFICIENTS,
  facilityBuild: { ...OLD_FACILITY_BUILD_RULES, timeFactorPm: [...OLD_FACILITY_BUILD_RULES.timeFactorPm] },
  facilityRuntime: { ...OLD_FACILITY_RUNTIME_RULES },
  territory: {
    influenceMilli: [...START_TERRITORY_COEFFICIENTS.influenceMilli],
    beaconRangeMilli: [...START_TERRITORY_COEFFICIENTS.beaconRangeMilli],
    beaconsPerCity: [...START_TERRITORY_COEFFICIENTS.beaconsPerCity],
    gradeAtDevelopment: [...START_TERRITORY_COEFFICIENTS.gradeAtDevelopment],
    beaconDurability: START_TERRITORY_COEFFICIENTS.beaconDurability,
  },
  labor: { ...OLD_LABOR_RULES },
  cyborg: {
    maxLevel: 50,
    growthPm: 100,
    kMinPm: 800,
    kMaxPm: 1200,
    initialSum: 60,
    initialMin: 1,
    initialMax: 20,
    temperaments: [
      { id: "balanced", favored: [] },
      { id: "combat", favored: ["str", "vit"] },
      { id: "tech", favored: ["int", "dex"] },
      { id: "trade", favored: ["int", "wis"] },
    ],
    initialRerolls: 3,
    initialFavorMilli: 4000,
    initialSpreadMilli: 3000,
    startCrowdNormal: 20,
    startCrowdBusy: 50,
    skillGradeBase: 3,
    skillGradeMax: 10,
    rebirthFaith: 50,
    rebirthCurrency: 10_000,
    elementCells: 2,
    elementPoints: 10,
    lightDarkPoints: 5,
    organWearPerPeriod: 1,
    organRepairCost: 100,
    livingUnpaidPm: 700,
    grantBase: 72,
    grantMaxPm: 1500,
    grantMinPm: 1000,
    grantStepPm: 50,
  },
  durability: {
    repairLossPct: [30, 25, 20, 15, 10],
    repairLossFloorPct: 5,
    destroyAtMax: 10,
    wearChancePm: 250,
    wearAmount: 1,
    wearLossChancePm: 150,
    wearLossAmount: 4,
    ammoRefillLossPm: 50,
    craftAppropriate: 50,
  },
  consumables: {
    potionCooldownMs: 30_000,
    foodCooldownMs: 300_000,
    potionHpThresholdPm: 400,
    preservePm: { unit: 1000, storage: 1000, fridge: 2000, pickle: 3000, can: 5000, freezer: 0, exchange: 0 },
  },
  // [임시] D-514: 부상 중 회복은 경상 ½·중상 ¼·중태 ⅒, 불이익은 D-145 범위 가운데(경상 15%·중상 40%)·중태 50%
  vitals: { injuryRegenPm: [1000, 500, 250, 100], injuryPenaltyPm: [0, 150, 400, 500] },
  switches: { ...TEST_SYSTEM_SWITCHES },
};
