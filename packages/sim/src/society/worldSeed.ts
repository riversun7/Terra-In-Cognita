// 세계 씨앗(고정 NPC 국가의 시작 도시 수·기본 시설 수) — 기획 D-6041(세력마다 시작 도시 여러 곳, 60 §7.1 "2~4곳")·46 §9.2(고정 국가)·
// 90 §2.1(기본 NPC 국가·시작 도시 배치), docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗"·"WP5 나라 성격". 수치는 모두 [임시](D-515: 밸런싱
// 단계에서 정한다). 시뮬은 읽지 않는다(서버가 켤 때 시험 세계를 차릴 때만 읽는다: apps/server/src/npc/nations.ts·facilities/npcSeed.ts·
// world/worldLayout.ts — 국가 자리, docs/adr/2026-11-07-world-layout.md). 배후지 칸(catchment*)은 시뮬 도시 경제도 읽는다(채집 다툼,
// docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)").
import {
  type CatchmentGrowthRules,
  type CatchmentSupplyRules,
  catchmentRadiusMilli,
} from "@terra/shared/catchment";

export interface WorldSeedCoefficients {
  /**
   * [임시] 국가 하나의 시작 도시 수 아래 끝(60 §7.1 "2~4곳"). 국가 프리셋에 성격 칸(시작 도시 수)이 없는 국가는 모두 이 수다
   * (기획 답 504 다 — 칸이 없으면 나 "모든 국가 같은 수")
   */
  readonly startCitiesMin: number;
  /**
   * [임시] 국가 하나의 시작 도시 수 위 끝. 프리셋 성격 칸의 수는 아래 끝~위 끝 안으로 자른다(둘이 거꾸로면 작은 값이 아래 끝).
   * 국력 등급이 있는 프리셋(사용자 답 2026-11-11 "실제 강대국 분포처럼", docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)")의 시작 도시
   * 수도 이 값을 넘지 않는다(아래 끝은 등급에 들지 않는다 — 도시국가는 한 곳). 그래서 출발값을 4 → 8로 올렸다(초강대국 6곳)
   */
  readonly startCitiesMax: number;
  /** [임시] 시작 도시 하나의 농장 수(팩 시설 farm) */
  readonly farms: number;
  /** [임시] 시작 도시 하나의 벌목장 수(팩 시설 lumber_camp) */
  readonly lumberCamps: number;
  /** [임시] 시작 도시 하나의 광산 수(팩 시설 mine) */
  readonly mines: number;
  /**
   * [임시] 시작 도시 하나의 약초원·목장·낚시터 수(팩 시설 herb_field·ranch·fishing_spot, docs/adr/2026-11-11-production-six.md). 출발값 0 =
   * 짓지 않는다(약초·축산물·어류를 쓰는 사슬이 NPC 경제에 아직 없다 — 확인 대기)
   */
  readonly herbFields: number;
  readonly ranches: number;
  readonly fishingSpots: number;
  /** [임시] 시작 도시 하나의 창고 수(팩 시설 storehouse) */
  readonly storehouses: number;
  /**
   * [임시] 새 시작 도시의 주거 수(기획 답 749 다 "주거 수 × 비율"의 주거). 이미 선 도시의 주거는 고치지 않는다(NPC 사회 런타임이 휴먼 수에
   * 맞춰 늘린다)
   */
  readonly startHousing: number;
  /**
   * [임시] 시작 도시 처음 인구 = floor(주거 × 이 천분율 ÷ 1000)(기획 답 749 다 — 봇 수와 무관하게 세계 씨앗이 세운다,
   * docs/adr/2026-11-07-play-flow.md "WP-NPC2"). 도시마다 한 번 모자란 만큼만 세운다(옛 세계의 휴먼은 지우지 않는다)
   */
  readonly populationPm: number;
  /**
   * [임시] 둘레 땅에 맞춘 채집 시설(기획 답 503 다, 60 §7.1 "주변 자원"): 시작 도시 고르기 판이 보이는 그 2차맵 칸의 행성 값으로 고른다.
   * 숲 밀도가 이 %(0~100, 화면의 "숲 N%"와 같은 셈) 이상이면 벌목장
   */
  readonly lumberMinForestPct: number;
  /**
   * [임시] 칸 고도(게임 m)가 이 값 이상이면 광석 몫 1000(기획 D-533, @terra/shared/catchment oreSharePm). 옛 뜻은 "광산을 짓는 문턱"이었다 —
   * 이제 광산은 마른 땅 어디에나 선다. 높은 티어 광석의 산지 고도는 oreHighMinM(기획 D-535)
   */
  readonly mineMinHeightM: number;
  /**
   * [임시] 높은 티어 광석 산지 고도(m, 기획 D-535 질문 1121 "기준을 낮춰라"): 이 이상인 마른 땅은 산지(광석 비트) — 높은 티어 몫 1000, 광산
   * 국가 지방 도시 자리 점수(catchmentMountainSitePm)도 이 칸을 센다
   */
  readonly oreHighMinM: number;
  /**
   * [임시] 산지 밖 마른 땅의 높은 티어 몫(‰, 기획 D-535 "평지도 드물게 소량 분포"): 광산이 산지 밖 가장 높은 티어(oreLowTierMax) 위를 뽑으면
   * 이 몫만큼만 그대로 나온다(@terra/shared/catchment highOrePm·oreTierCapOf). 0이면 옛 규칙(산지에서만)
   */
  readonly oreFlatHighPm: number;
  /**
   * [임시] 광석 고도 몫(기획 D-533 — 질문 1020·1064 "석재·구리는 어디서나 조금(고도에 따른 몫)"): 0m 이하 땅의 몫(‰), 언덕 고도(m)와 그 몫(‰).
   * 산지 고도(mineMinHeightM) 이상은 1000, 사이는 곧게 잇는다
   */
  readonly oreShareLowPm: number;
  readonly oreShareHillM: number;
  readonly oreShareHillPm: number;
  /**
   * [임시] 산지가 아닌 광석이 낼 수 있는 가장 높은 티어(D-507 "하위 광석(잡석·석재·구리)은 건축 재료" = T0~T2). 광산이 이보다 높은 티어를
   * 뽑으면 배후지 광석 가운데 산지 몫만큼만 그 티어로 나오고 나머지는 이 티어로 내려간다
   */
  readonly oreLowTierMax: number;
  /**
   * [임시] 목재·약초·목장 바이옴 나눔과 노이즈(기획 D-536 — 사용자 2026-11-12 "목재와 약초 목장 분포가 너무 겹친다"): 무리 배율(‰)·노이즈
   * 격자 간격(1차맵 칸)·노이즈 바닥(‰)·자원마다 노이즈 시드·약초·축산물 있음 비트 문턱(‰). 셈은 @terra/shared/catchment woodSharePm·herbSharePm·
   * livestockSharePm(서버 경제·시작 도시 자리·1차맵 자원 레이어가 같은 함수)
   */
  readonly woodForestPm: number;
  readonly woodOtherPm: number;
  /** [임시] 목재 바닥(‰, 사용자 결정 2026-11-12 기본 재료 바닥 보장): 숲이 없는 마른 땅의 목재 몫(관목·흩어진 나무, 노이즈 배율 전) */
  readonly woodBaselinePm: number;
  readonly herbWetlandPm: number;
  readonly herbAlpinePm: number;
  readonly herbForestPm: number;
  readonly herbOtherPm: number;
  readonly herbClearingPm: number;
  readonly livestockPasturePm: number;
  readonly livestockOtherPm: number;
  readonly resourceNoiseCells: number;
  readonly resourceNoiseFloorPm: number;
  readonly woodNoiseSeed: number;
  readonly herbNoiseSeed: number;
  readonly livestockNoiseSeed: number;
  readonly resourceBitMinPm: number;
  /** [임시] 기온(°C)이 이 값 이상이고 강수(mm)가 아래 값 이상이면 농장(농사지을 땅) */
  readonly farmMinTempC: number;
  readonly farmMinRainMm: number;
  /**
   * [임시] 국가 자리 고르기(사용자 지적 2026-11-07 "도시가 겹치고 세력 범위가 엉망", docs/adr/2026-11-07-world-layout.md): 첫 국가 수도
   * 둘레 이 반경(1차맵 칸) 안의 알맞은 땅에서 국가 수도를 서로 가장 멀게 고른다. 국가 사이 거리가 아래 값보다 짧으면 반경을 두 배씩 넓힌다
   */
  readonly layoutRegionCells: number;
  /** [임시] 국가 수도 사이 가장 짧은 거리(1차맵 칸). 비콘 거리(N42 위 끝 13.3칸)의 두 배보다 길어 국가 영토가 닿지 않는다 */
  readonly layoutNationGapCells: number;
  /** [임시] 한 국가 시작 도시 사이 칸(1 = 수도와 붙은 2차맵 — 띄운 2차맵끼리 이어져 걸어서 오간다) */
  readonly layoutCityStepCells: number;
  /** [임시] 시작 도시가 설 땅: 물(바다·호수·강·해안) 없음 + 칸 고도 0 초과 이 값(m) 이하 */
  readonly layoutLandMaxHeightM: number;
  /** [임시] 시작 도시가 설 땅: 기온(°C) 아래 끝·위 끝 */
  readonly layoutLandMinTempC: number;
  readonly layoutLandMaxTempC: number;
  /** [임시] 시작 도시가 설 땅: 강수(mm) 아래 끝(사막을 빼고 농사지을 땅) */
  readonly layoutLandMinRainMm: number;
  /**
   * [임시] 도시 배후지(docs/adr/2026-11-11-city-catchment.md, 사용자 지적 2026-11-11 "도시를 유지하기 위한 주변 지형자원의 점유 영역이 겹쳐"):
   * 도시 2차맵에서 이 반경(1차맵 칸) 안의 칸들이 그 도시의 자원 점유 영역이다. 0이면 배후지 규칙을 쓰지 않는다(옛 배치 — 수도 둘레 고리 ×
   * 걸음). 지방 도시 자리는 배후지 덮임(여섯 원자재 몫, @terra/shared/catchment)이 높은 곳을 고르고, 도시 사이를 아래 간격만큼 띄운다
   */
  readonly catchmentRadiusCells: number;
  /** [임시] 같은 국가 도시 사이 가장 짧은 거리 = 배후지 지름(2R) × 이 천분율(1000 = 배후지 가장자리가 닿아도 됨) */
  readonly catchmentSameGapPm: number;
  /** [임시] 다른 국가 도시 사이 가장 짧은 거리 = 2R × 이 천분율(배후지가 겹치지 않고 사이가 빈다) */
  readonly catchmentForeignGapPm: number;
  /** [임시] 지방 도시 자리를 찾는 반경(수도에서 1차맵 칸) */
  readonly catchmentSearchCells: number;
  /** [임시] 수도에서 배후지 지름 하나만큼 멀어질 때마다 자리 점수에서 빼는 덮임(‰) — 나라가 흩어지지 않게 */
  readonly catchmentCompactPm: number;
  /**
   * [임시] 광산 국가의 산지 점수(기획 D-534 — 질문 1079 나 "광산 국가는 지방 도시 자리에 산지 점수(철 캐는 국가가 생김)"): 광산을 쓰는 국가
   * (시작 시설에 광산)의 지방 도시 자리 점수에 배후지 산지 몫(산지 칸 몫 ‰) × 이 천분율 ÷ 1000을 더한다. 0이면 더하지 않는다
   */
  readonly catchmentMountainSitePm: number;
  /**
   * [임시] 도시 크기에 따라 넓어지는 배후지(docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)", 사용자 지적 2026-11-11 "인구와
   * 도시등급이 높을 수록 높은자원과 기술을 요구하여 요구 영토범위가 넓어지고"): 요구 넓이(칸) = 인구 × catchmentCellsPerHundred ÷ 100 ×
   * 요구 배율(등급 기본 + 걸음 × (등급 − 1) + 기술 × 기술 몫, ‰), 반경 = √(넓이 ÷ π)(아래·위 끝 1000분율 칸). @terra/shared/catchment
   */
  readonly catchmentCellsPerHundred: number;
  readonly catchmentGradeNeedBasePm: number;
  readonly catchmentGradeNeedStepPm: number;
  readonly catchmentTechNeedPm: number;
  readonly catchmentMinRadiusMilli: number;
  readonly catchmentMaxRadiusMilli: number;
  /** [임시] 시작 도시 배치: 수도는 인구(주거) × 이 천분율, 등급 + 1로 반경을 잡는다(더 크게 자랄 자리) */
  readonly catchmentCapitalPm: number;
  /** [임시] 시작 도시 배치: 처음 기간에 이를 도시 등급(인구는 주거만큼 찬다고 본다) */
  readonly catchmentPlanGrade: number;
  /**
   * [임시] 채집 다툼과 고갈: 칸 하나 원자재 재고 상한, 하루 로지스틱 다시 자람(‰)·바닥, 도시가 요구 넓이 칸마다 캐려는 양(칸이 버티는 양의 ‰),
   * 구인(인구 늘리기)에 필요한 받은 몫(‰), 채집 시설 빠르기 바닥(‰)
   */
  readonly catchmentStockPerCell: number;
  readonly catchmentRegrowPm: number;
  readonly catchmentRegrowFloor: number;
  readonly catchmentDrawPm: number;
  readonly catchmentGrowthMinPm: number;
  readonly catchmentYieldFloorPm: number;
  /**
   * [임시] 옆 2차맵을 그때 띄우기(기획 답 730 다, docs/adr/2026-11-07-play-flow.md "WP15"): 서버가 그때 띄운 2차맵 상한(부팅 씨앗 2차맵 —
   * 시험 줄·도시 — 은 세지 않는다). 꽉 차면 빈 것을 내리고 띄우고, 빈 것이 없으면 띄우지 않는다. NAS 1GiB에서 2차맵 하나 약 5~7MB
   */
  readonly mapSpawnMaxLoaded: number;
  /** [임시] 그때 띄운 2차맵이 비어 있은 지 이만큼(ms) 지나면 내린다(유닛·건물·도시·구독·이동이 없음) */
  readonly mapSpawnIdleMs: number;
  /**
   * [임시] 옆 2차맵 미리 띄우기(docs/adr/2026-11-08-seamless-second-map.md "바뀜 (2026-11-12)"): 플레이어 유닛이 변에서 이만큼(배치 칸) 안에
   * 서거나 그 안에서 끝나는 길을 걸으면 그 변 너머 2차맵을 넘기 전에 띄운다. 0이면 미리 띄우지 않는다
   */
  readonly mapPreopenCells: number;
  /** [임시] 미리 띄운 2차맵에 유닛이 들어서지 않은 채 비어 있으면(변 가까운 유닛도 없음) 이만큼(ms) 뒤 내린다 */
  readonly mapPreopenIdleMs: number;
  /**
   * [임시] NPC 휴먼이 일터에 가는 지역 시각(기획 답 770 나 — 아침에 일터, 밤에 집, 하늘 낮밤과 맞춤, docs/adr/2026-11-07-play-flow.md
   * "WP-NPC4"): 그 2차맵 지역 하루의 천분율(250 = 06:00, 750 = 18:00). 시작 > 끝이면 밤을 넘는 몫, 같으면 늘 집. 보이는 움직임만(D-142 —
   * 산출은 도시 경제가 센다). 개발자 패널에서 0·1000으로 두면 바로 모두 일터로 가는 모습을 볼 수 있다
   */
  readonly workStartPm: number;
  readonly workEndPm: number;
  /**
   * [임시] NPC 수도 옮기기 문턱(기획 D-528 "수도는 발전도가 높은곳이나 적정한 곳을 npc가 설정하고 상황에 따라 바꿀 수있음",
   * docs/adr/2026-11-07-world-layout.md "바뀜 (D-528)"): 하루 끝에 같은 나라의 다른 도시 발전도가 지금 수도보다 이 값(발전도 점, 0~100) 이상 높으면
   * 수도를 그 도시로 옮긴다(작은 차이로 매일 오가지 않게). 서버만 읽는다(src/npc/capitals.ts)
   */
  readonly capitalSwitchDev: number;
  /**
   * [임시] 시작 도시 하나의 숙소 수 위 끝(팩 시설 lodging, 생활 단계 — docs/adr/2026-11-11-city-building-layout.md). 실제 수 = ⌈주거 ÷ 숙소
   * Lv1 침대(logistics.lodgingBedsPerLevel)⌉, 이 값까지(질문 1049 나, 서버 facilities/npcSeed.ts seedLodgings). 일꾼의 회복 쉼터이자 주거
   */
  readonly lodgings: number;
  /**
   * [임시] 시작 도시가 아닌 마을(NPC 새 마을·가문 마을·되살린 폐허)의 숙소 수 — 마을이 서면 행정 건물(가운데) + 숙소를 전략 배치로 세운다
   * (질문 1052 다, 기획 D-533 "추천대로"). 마을 건물 수·값은 기획이 정할 일이라 이 칸 하나만 둔다. 서버만 읽는다(facilities/npcSeed.ts)
   */
  readonly villageLodgings: number;
  /**
   * [임시] 도시 건물 배치(사용자 요청 2026-11-11 "건물들도 바둑판 배열이 아닌 전략적으로", docs/adr/2026-11-11-city-building-layout.md):
   * 1 = 전략 배치(행정 건물 가운데 → 숙소 → 창고 → 채집소 겹, apps/server/src/facilities/cityLayout.ts), 0 = 옛 배치(가운데 마당 밖 고리마다
   * 처음 맞는 자리). 서버만 읽는다
   */
  readonly cityLayoutMode: number;
  /** [임시] 행정 건물 둘레 비우는 광장(배치 칸) */
  readonly cityLayoutPlazaCells: number;
  /** [임시] 가공·기타 건물이 서는 안쪽 고리 반경(행정 건물 가운데에서 배치 칸) */
  readonly cityLayoutInnerCells: number;
  /** [임시] 채집소가 서는 띠: 행정 건물 가운데에서 이 칸 이상 ~ 아래 칸 이하(배치 칸) */
  readonly cityLayoutGatherMinCells: number;
  readonly cityLayoutGatherMaxCells: number;
  /** [임시] 채집소 자리 점수: 이 칸 안의 맡는 원자재 오브젝트 수 */
  readonly cityLayoutGatherReachCells: number;
  /** [임시] 창고 자리 = 행정 건물 → 채집소 묶음 길의 이 천분율 지점(1000 = 채집소 곁) */
  readonly cityLayoutStoreRoutePm: number;
  /** [임시] 숙소 자리 = 같은 길의 이 천분율 지점(일꾼이 일터와 가운데 사이에서 쉰다) */
  readonly cityLayoutLodgeRoutePm: number;
  /** [임시] 목표 칸을 흔드는 칸(도시마다 모양이 다르게) */
  readonly cityLayoutJitterCells: number;
  /**
   * [임시] 성벽 고리(질문 1048 가, docs/adr/2026-11-11-city-building-layout.md "바뀜 (2026-11-12)"): 1 = NPC 시작 도시가 행정 건물 둘레에
   * 성벽(팩 city_wall) 고리를 세운다, 0 = 세우지 않는다. 서버만 읽는다(apps/server/src/facilities/cityWalls.ts)
   */
  readonly cityWallMode: number;
  /** [임시] 성벽 고리 = 행정 건물 칸에서 이 체비쇼프 거리(배치 칸, 광장 바로 밖) */
  readonly cityWallRingCells: number;
  /** [임시] 고리의 틈(성문) 수 — 2차맵에서는 사람이 지나가는 틈, 공성 전투에서는 수비 편만 지나가는 성문 */
  readonly cityWallGates: number;
  /** [임시] 틈 하나의 폭(칸) */
  readonly cityWallGateCells: number;
}

/** 출발값 — 모두 [임시](옛 규칙 없음, D-515). 시작 도시 2~4곳(60 §7.1), 기본 시설은 종류마다 하나 */
export const START_WORLD_SEED: WorldSeedCoefficients = {
  startCitiesMin: 2,
  startCitiesMax: 8,
  farms: 1,
  lumberCamps: 1,
  mines: 1,
  herbFields: 0,
  ranches: 0,
  fishingSpots: 0,
  storehouses: 1,
  // 옛 시작 도시와 같은 주거 40(npc/nations.ts 옛 START_CITY_HOUSING), 처음 인구는 그 3/4 = 30명(NPC 구인 목표 = 주거까지 남은 자리)
  startHousing: 40,
  populationPm: 750,
  // 시작 도시 판의 숲 표시 문턱(숲 밀도 13/255 ≈ 5%)과 같다: 판에 숲이 보이면 벌목장
  lumberMinForestPct: 5,
  mineMinHeightM: 500,
  // 광석 고도 몫: 해수면 35%, 언덕(200m) 55%, 산지(500m) 100% — 낮은 땅 도시도 석재·구리를 캔다. 산지가 아니면 구리(T2)까지.
  // 바뀜 (2026-11-12, 사용자 결정 "일반 땅에서도 기본 건축에 필요한 광물은 채집가능해야함" — 기본 재료 바닥 보장): 해수면 15 → 35%, 언덕 40 → 55%
  oreShareLowPm: 350,
  oreShareHillM: 200,
  oreShareHillPm: 550,
  oreLowTierMax: 2,
  // 목재·약초·목장(D-536): 목재 = 숲 무리 100%·그 밖 30%(숲 밀도 몫에 곱함), 약초 = 습지 100%·고산 초지 80%·숲 가장자리·빈터 45%(목재 노이즈
  // 반대를 80% 따름)·그 밖 10%, 목장 = 초지·사바나·툰드라 100%·그 밖 0. 노이즈 격자 8칸(배후지 지름 약 4칸의 두 배 — 도시마다 섞임이 다르다),
  // 배율 25% ~ 175%(가운데 100% — 무리 평균은 거의 그대로). 시드는 서로 다른 아무 수. 약초·축산물 있음 비트는 몫 150‰부터. 숲 약초 45%·빈터 80%는
  // S2 시험 행성에서 잰 값(apps/server/bench/resourceOverlap.ts — 숲에서 목재·약초 칸 상관 −0.85, 둘 다 500‰ 이상인 땅 칸 3%)
  woodForestPm: 1000,
  woodOtherPm: 300,
  // 목재 바닥(사용자 결정 2026-11-12 "건축시 목재와 석재는 필수이다" — 기본 재료 바닥 보장): 마른 땅 어디나 300‰(관목·흩어진 나무)
  woodBaselinePm: 300,
  herbWetlandPm: 1000,
  herbAlpinePm: 800,
  herbForestPm: 450,
  herbOtherPm: 100,
  herbClearingPm: 800,
  livestockPasturePm: 1000,
  livestockOtherPm: 0,
  resourceNoiseCells: 8,
  resourceNoiseFloorPm: 250,
  woodNoiseSeed: 5361,
  herbNoiseSeed: 70913,
  livestockNoiseSeed: 288149,
  resourceBitMinPm: 150,
  // 높은 티어 광석(기획 D-535): 시험 행성 알맞은 땅(기온 8~32°C)의 위 0.6%·도시가 설 땅의 위 1.1%가 200m 이상(250m는 0.07%·0.12%,
  // 300m는 거의 0 — 2026-11-12 측정, docs/worklog/2026/11/12-*-ore-3.md). 산지 밖은 높은 티어 추첨의 5%만 그대로 둔다
  oreHighMinM: 200,
  oreFlatHighPm: 50,
  farmMinTempC: 5,
  farmMinRainMm: 250,
  // 국가 자리: 지금 시험 행성(반지름 약 531km)에서 국가 넷이 수십~백 km 떨어지게, 사막·추운 땅을 빼고(기온 8~32°C·강수 300mm 이상)
  layoutRegionCells: 48,
  layoutNationGapCells: 30,
  layoutCityStepCells: 1,
  layoutLandMaxHeightM: 1500,
  layoutLandMinTempC: 8,
  layoutLandMaxTempC: 32,
  layoutLandMinRainMm: 300,
  // 배후지: 반경 2칸(약 3km — 기획 42 §2.1 도시 영향권 1.1칸·대도시 1.9칸 사이), 같은 국가는 배후지가 닿을 만큼(4칸), 다른 국가는 1.5배(6칸),
  // 수도에서 12칸 안을 찾고, 배후지 지름(4칸)마다 덮임 100‰을 뺀다
  catchmentRadiusCells: 2,
  catchmentSameGapPm: 1000,
  catchmentForeignGapPm: 1500,
  catchmentSearchCells: 12,
  catchmentCompactPm: 100,
  // 산지 점수: 배후지가 모두 산지면 +500‰(덮임 평균 약 730의 2/3) — 산지 칸이 몇 개만 있어도 낮은 땅 자리보다 앞선다
  catchmentMountainSitePm: 500,
  // 크기에 따라 넓어지는 배후지: 40명·등급 4·기술 2 ≈ 반경 2.07칸(옛 고정 2칸), 초강대국 수도(주거 60 × 1.25, 등급 5) ≈ 3.2칸, 소국 지방 도시 ≈ 1.8칸.
  // 칸 재고 1000, 하루 40% 로지스틱 + 바닥 20(버티는 양 120), 배후지 칸마다 버티는 양의 75%(혼자면 재고 약 77%에서 머물고, 둘이 다 겹치면
  // 150% — 열흘 남짓에 바닥나 바닥 다시 자람만 나눈다)
  catchmentCellsPerHundred: 27,
  catchmentGradeNeedBasePm: 700,
  catchmentGradeNeedStepPm: 150,
  catchmentTechNeedPm: 50,
  catchmentMinRadiusMilli: 1000,
  catchmentMaxRadiusMilli: 8000,
  catchmentCapitalPm: 1250,
  catchmentPlanGrade: 4,
  catchmentStockPerCell: 1000,
  catchmentRegrowPm: 400,
  catchmentRegrowFloor: 20,
  catchmentDrawPm: 750,
  catchmentGrowthMinPm: 900,
  catchmentYieldFloorPm: 100,
  // 그때 띄우기: 지금 NAS(17장 RSS 약 430MB)에 32장(약 +200MB)을 더해도 1GiB 안, 비우고 10분 뒤 내림
  mapSpawnMaxLoaded: 32,
  mapSpawnIdleMs: 10 * 60_000,
  // 미리 띄우기: 시야(24칸)보다 두 배 먼 48칸(약 280m) — 시야가 경계를 넘기 전에 띄워 둔다. 들어서지 않으면 비우고 2분 뒤 내림
  mapPreopenCells: 48,
  mapPreopenIdleMs: 2 * 60_000,
  // 낮밤 일: 06:00~18:00(춘분·추분에 해가 뜨고 지는 지역 시각 — 1차맵 하늘 자전축 [임시] 23.44°라 계절·위도에 따라 해 뜨는 때는 다르다)
  workStartPm: 250,
  workEndPm: 750,
  // 수도 옮기기: 발전도 10점(도시 등급 한 칸쯤) 넘게 앞서야 옮긴다
  capitalSwitchDev: 10,
  // 도시 건물 배치(docs/adr/2026-11-11-city-building-layout.md): 전략 배치 켬.
  // 띠: 옛 씨앗이 건물을 세우던 반경(가운데에서 48칸 안)과 채집소 반경(40칸) 안 — 채집소 20~42칸, 고리 9칸, 창고는 길의 75%, 숙소는 35%.
  // 숙소: 채집 구역(창고 수)마다 길 위 하나, 남는 것은 행정 건물의 빈 쪽. 수는 주거 ÷ 침대 올림, 이 값은 위 끝(질문 1049 나)(측정 docs/worklog/2026/11/12-0130-city-layout.md)
  lodgings: 8,
  // 마을: 행정 건물 + 숙소 하나(질문 1052 추천 가)
  villageLodgings: 1,
  cityLayoutMode: 1,
  cityLayoutPlazaCells: 3,
  cityLayoutInnerCells: 9,
  cityLayoutGatherMinCells: 20,
  cityLayoutGatherMaxCells: 42,
  cityLayoutGatherReachCells: 14,
  cityLayoutStoreRoutePm: 750,
  cityLayoutLodgeRoutePm: 350,
  cityLayoutJitterCells: 2,
  // 성벽 고리(질문 1048 가): 광장(3칸) 바로 밖 4칸 고리, 변마다 가운데 2칸 틈 넷(측정 docs/worklog/2026/11/12-0930-siege-layout.md)
  cityWallMode: 1,
  cityWallRingCells: 4,
  cityWallGates: 4,
  cityWallGateCells: 2,
};

/**
 * 시작 도시 수가 놓일 수 있는 범위(60 §7.1 "2~4곳"이 출발이고, 국력 등급의 강대국은 더 많다 — 사용자 답 2026-11-11. 칸이 1까지는 받는다)
 */
export const START_CITIES_LIMIT = { min: 1, max: 8 } as const;

/** 시작 도시 수 범위 안으로 자른다(정수) */
const clamp = (value: number) =>
  Math.max(START_CITIES_LIMIT.min, Math.min(START_CITIES_LIMIT.max, Math.trunc(value)));

/**
 * 고정 국가 하나가 가질 시작 도시 수(기획 답 504 다): 국가 프리셋 성격 칸의 수(personality)를 설정 칸 아래 끝~위 끝 안으로 자른 값.
 * 성격 칸이 없으면 모든 국가가 아래 끝(504 나). 칸 두 값이 거꾸로여도 작은 값을 아래로 친다. 결과는 START_CITIES_LIMIT 안이다
 */
export function startCitiesFor(seed: WorldSeedCoefficients, personality?: number): number {
  const low = clamp(Math.min(seed.startCitiesMin, seed.startCitiesMax));
  const high = clamp(Math.max(seed.startCitiesMin, seed.startCitiesMax));
  if (personality === undefined || !Number.isFinite(personality)) return low;
  return Math.max(low, Math.min(high, Math.trunc(personality)));
}

/** 세계 씨앗 설정 칸 → 도시 크기에 따른 요구 배후지 규칙(docs/adr/2026-11-11-city-catchment.md "바뀜 (2026-11-12)") */
export function catchmentGrowthOf(seed: WorldSeedCoefficients): CatchmentGrowthRules {
  return {
    cellsPerHundred: seed.catchmentCellsPerHundred,
    gradeNeedBasePm: seed.catchmentGradeNeedBasePm,
    gradeNeedStepPm: seed.catchmentGradeNeedStepPm,
    techNeedPm: seed.catchmentTechNeedPm,
    minRadiusMilli: seed.catchmentMinRadiusMilli,
    maxRadiusMilli: seed.catchmentMaxRadiusMilli,
  };
}

/** 세계 씨앗 설정 칸 → 칸 재고·다시 자람·캐려는 양 규칙 */
export function catchmentSupplyOf(seed: WorldSeedCoefficients): CatchmentSupplyRules {
  return {
    stockPerCell: seed.catchmentStockPerCell,
    regrowPm: seed.catchmentRegrowPm,
    regrowFloor: seed.catchmentRegrowFloor,
    drawPm: seed.catchmentDrawPm,
  };
}

/**
 * 시작 도시 배치에 쓰는 반경(1000분율 칸): 처음 기간에 이를 크기 — 인구 = 주거(구인 목표까지 찬다), 등급 = catchmentPlanGrade. 수도는 인구 ×
 * catchmentCapitalPm, 등급 + 1(더 크게 자랄 자리를 미리 잡는다). 그래서 시작 도시가 자라도 바로 부딪치지 않는다
 */
export function plannedCityRadiusMilli(
  seed: WorldSeedCoefficients,
  city: { readonly housing: number; readonly tech: number; readonly capital: boolean },
): number {
  const housing = Math.max(0, Math.trunc(city.housing));
  return catchmentRadiusMilli(
    {
      population: city.capital
        ? Math.floor((housing * Math.max(1000, seed.catchmentCapitalPm)) / 1000)
        : housing,
      grade: seed.catchmentPlanGrade + (city.capital ? 1 : 0),
      tech: city.tech,
    },
    catchmentGrowthOf(seed),
  );
}
