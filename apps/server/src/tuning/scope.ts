// 설정 칸이 서버 어디에 듣나 — docs/adr/2026-11-01-dev-settings-panel.md 7절(반영 범위)
// 서버가 지금 실효 값(TuningState.society())을 쓸 때마다 읽는 세력·사회 계수표 칸. 칸 ID가 아니라 계수표 경로로 적는다
// (팩 항목 ID → 경로는 @terra/sim TUNING_KEYS). 서버에서 새로 읽는 곳을 더하면 여기에 줄을 더한다(시험이 경로가 표에 있는지 본다).
// 여기 없는 TUNING_KEYS 칸은 "sim"(시뮬레이터·내보내기에만), TUNING_KEYS에 없는 팩 ID는 "none"이다.
import type { TuningScope } from "@terra/shared/tuning";
import { TUNING_KEYS } from "@terra/sim";

export const SERVER_LIVE_PATHS: readonly string[] = [
  // 사이보그 만들기(cyborg/service.ts): 굴리기 N9, 성장 K N6, 시작 도시 붐빔 D-6041, 속성 분배 N36
  "cyborg.initialSum",
  "cyborg.initialMin",
  "cyborg.initialMax",
  "cyborg.initialRerolls",
  "cyborg.initialFavorMilli",
  "cyborg.initialSpreadMilli",
  "cyborg.kMinPm",
  "cyborg.kMaxPm",
  "cyborg.startCrowdNormal",
  "cyborg.startCrowdBusy",
  "cyborg.elementCells",
  "cyborg.elementPoints",
  // 정착 지원금(cyborg/service.ts grantFor → @terra/sim settlementGrant) N39
  "cyborg.grantBase",
  "cyborg.grantMaxPm",
  "cyborg.grantMinPm",
  "cyborg.grantStepPm",
  // 사이보그 화면(roster/services.ts·cyborgBody.ts): 만렙 N7, 환생 조건 N34, 생활비 효율 N38
  "cyborg.maxLevel",
  "cyborg.rebirthFaith",
  "cyborg.rebirthCurrency",
  "cyborg.livingUnpaidPm",
  // 세력 화면(factionScreen/tuning.ts): 민심 문턱 S26·N35, 공물 S33, 배당·공물 주기 D-130·D-443
  "rebellionThreshold",
  "rebellionWarningAt",
  "sabotageAt",
  "tributePm",
  "tributeEveryMs",
  "dividendEveryMs",
  // 정원사(npc/gardener.ts → @terra/sim attachGardener, docs/adr/2026-11-01-gardener-r5b.md): 하루 끝·웨이브 도착마다 읽는다.
  // 유목 부대 수(s16_nomad_scouts·legions)는 처음 차릴 때만 읽어서 여기 없다(sim)
  "gardener.cellMax",
  "gardener.battle",
  "gardener.humanStep",
  "gardener.humansPerStep",
  "gardener.forestDaily",
  "gardener.purifyAmount",
  "gardener.decayBp",
  "gardener.spreadBp",
  "gardener.influenceRadius",
  "gardener.chanceDivisor",
  "gardener.chanceMaxPm",
  "gardener.strengthBase",
  "gardener.strengthHumansPer",
  "gardener.strengthTreasuryUnit",
  "gardener.noticeMs",
  "gardener.cooldownMs",
  "gardener.cooldownChanceBp",
  "gardener.physicalDivisor",
  "gardener.physicalMaxPm",
  "gardener.unitBudget",
  "gardener.mothershipBp",
  "gardener.nomadDetect",
  "gardener.nomadNoticeMs",
  "gardener.nomadThreshold",
  "gardener.nomadExcludeMs",
  "gardener.nomadScoutSize",
  "gardener.nomadLegionAt",
  "gardener.nomadLegionStep",
  // 아이템 편집기 미리 보기의 채집 티어 추첨(itemEdit/services.ts preview, D-506 N43): 미리 보기마다 읽는다
  "gatherLevelBonus",
  // 같은 미리 보기의 진행 속도·수확량·필요 진행(D-507 N32·N44)
  "productionMainDivisor",
  "productionSubYieldPm",
  "gatherTierProgressBase",
  "gatherTierProgressStep",
  "gatherTickMs",
  "gatherOreGrams",
  // 건물 편집기(buildingEdit/services.ts list, 49 M14·D-508): 레벨별 건설 시간·유지비 미리 보기. 짓기가 생기면 그쪽도 읽는다
  "facilityBuild.msPerKg",
  "facilityBuild.timeFactorPm.0",
  "facilityBuild.timeFactorPm.1",
  "facilityBuild.timeFactorPm.2",
  "facilityBuild.timeFactorPm.3",
  "facilityBuild.timeFactorPm.4",
  "facilityBuild.upkeepPm",
  "facilityBuild.upkeepMin",
  // 영토 서비스(territory/service.ts, docs/adr/2026-11-03-territory-layer.md): 배치를 셈할 때마다(조회 30초·명령마다) 읽는다
  "territory.gradeAtDevelopment.0",
  "territory.gradeAtDevelopment.1",
  "territory.gradeAtDevelopment.2",
  "territory.gradeAtDevelopment.3",
  "territory.gradeAtDevelopment.4",
  "territory.influenceMilli.0",
  "territory.influenceMilli.1",
  "territory.influenceMilli.2",
  "territory.influenceMilli.3",
  "territory.influenceMilli.4",
  "territory.influenceMilli.5",
  "territory.beaconsPerCity.0",
  "territory.beaconsPerCity.1",
  "territory.beaconsPerCity.2",
  "territory.beaconsPerCity.3",
  "territory.beaconsPerCity.4",
  "territory.beaconsPerCity.5",
  "territory.beaconRangeMilli.0",
  "territory.beaconRangeMilli.1",
  "territory.beaconRangeMilli.2",
  "territory.beaconRangeMilli.3",
  "territory.beaconRangeMilli.4",
  "territory.beaconRangeMilli.5",
  "territory.beaconDurability",
  // 보유 물건 전투 닳기(holdings/service.ts applyBattle, 49 N49·C20): 전투가 끝날 때마다 읽는다. 수리(F11·F12)는 아직 고리라 sim
  "durability.wearChancePm",
  "durability.wearAmount",
  "durability.wearLossChancePm",
  "durability.wearLossAmount",
  // 물약·요리 쿨(holdings/service.ts use, D-509·D-510): 쓸 때마다 읽는다. 탄약 보충 감소(d509_ammo_refill_loss)·자동 물약 HP 문턱
  // (d510_potion_hp_threshold)은 아직 고리라 sim
  "consumables.potionCooldownMs",
  "consumables.foodCooldownMs",
];

const LIVE = new Set(SERVER_LIVE_PATHS);
const KEY_PATHS = new Map(
  TUNING_KEYS.map((key) => [key.id, key.target === "society" ? key.path : `combat:${key.path}`]),
);

/** 팩 칸 ID → 반영 범위 */
export function tuningScopeOf(id: string): TuningScope {
  const path = KEY_PATHS.get(id);
  if (path === undefined) return "none";
  return LIVE.has(path) ? "live" : "sim";
}
