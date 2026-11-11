// 세계 씨앗(고정 NPC 국가의 시작 도시 수·기본 시설 수) — 기획 D-6041(세력마다 시작 도시 여러 곳, 60 §7.1 "2~4곳")·46 §9.2(고정 국가)·
// 90 §2.1(기본 NPC 국가·시작 도시 배치), docs/adr/2026-11-07-play-flow.md "WP1 세계 씨앗"·"WP5 나라 성격". 수치는 모두 [임시](D-515: 밸런싱
// 단계에서 정한다). 시뮬은 읽지 않는다(서버가 켤 때 시험 세계를 차릴 때만 읽는다: apps/server/src/npc/nations.ts·facilities/npcSeed.ts·
// world/worldLayout.ts — 국가 자리, docs/adr/2026-11-07-world-layout.md).

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
  /** [임시] 칸 고도(게임 m)가 이 값 이상이면 광산(산·고원) */
  readonly mineMinHeightM: number;
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
