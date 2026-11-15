// 배 계수(팩 tuning 경로 "boats.*", 모두 [임시]) — docs/adr/2026-11-13-boats.md 1·3·4절(기획 D-540·D-5052, 49 P20 출발값 없음),
// 만드는 시간·유지비는 "바뀜 (2026-11-14, B2)"(기획 D-541 1271 나·1277 다).
// 서버 배 서비스(apps/server/src/boats)가 계수표에서 읽는다. 판정 셈(길찾기)은 grid/waterGrid.ts.
// 배 체계 개편(기획 D-545·D-547·D-548, docs/adr/2026-11-15-shipyard-harbor.md): 조선소·정박장·교역 부두·배 내구도 칸을 더했다(모두 [임시] — 수치는
// 묻지 않는다, D-515). 시뮬은 땅·물을 몰라 배가 없으므로 이 칸들은 서버만 읽는다(시뮬 판정·출력 그대로).

export interface BoatCoefficients {
  /** [임시] 배 빠르기(고정소수점 단위/초, 49 P20 "수단 최고 속도" D-5052). 1,536 = 1.5칸/초 ≈ 8.9m/s(걷기 437과 차 4,813 사이) */
  readonly speed: number;
  /** [임시] 배 하나에 탈 수 있는 유닛 수 — 배 종류 표(조선소 boats 칸)에 자리 수가 없을 때만(옛 배·종류를 모르는 배) */
  readonly capacity: number;
  /** [임시] 배 값 = 배 종류 재료 × 이 값 ÷ 1000(D-547 1484 — 배 종류마다 재료) */
  readonly costPm: number;
  /** [임시] 타고 내리는 거리(배치 칸): 유닛 몸과 배 몸 사이가 이 안이면 바로 탄다, 내릴 땅 칸을 이 안에서 찾는다 */
  readonly boardCells: number;
  /**
   * [임시] 배 만드는 시간 = 배 종류 기준 시간 × 이 값 ÷ 1000(D-547 1484, 질문 1271 나). 일꾼 배율은 없다. 건조 특화 조선소는
   * shipyardBuildSpecPm을 더 곱한다. 0이면 바로 만든다
   */
  readonly buildTimePm: number;
  /** [임시] 배 유지비 무게(‰, 보통 유닛 1000 — 질문 1277 다, 기획 D-541 "사람보다 싸게") */
  readonly upkeepPm: number;
  /**
   * [임시] 배에서 캐는 거리(배치 칸, 기획 D-541 1280 가 — "바뀜 (2026-11-14, B3)"): 배 몸 가운데와 바다 오브젝트(어군은 지금 자리) 사이가 이 안이면
   * 승객이 배에서 캔다. 물가에서 낚는 어군(reach > 0)은 둘 가운데 큰 값
   */
  readonly gatherCells: number;
  /** [임시] NPC 정박장 하나에 두는 NPC 배 상한(D-547 1497 — NPC도 조선소에서 만들고 정박장에 산다. 0이면 NPC는 배를 만들지 않는다) */
  readonly npcPerDock: number;
  /** [임시] NPC 배 하나에 태우는 어부 수(그 도시 휴먼, 자리 수 boat_capacity 안) */
  readonly npcFishers: number;
  // ---------- 조선소(D-547 1481·1483·1494) ----------
  /** [임시] 조선소 기본 도크 수(동시에 만들거나 고치는 배, 1483 "기본 한척") */
  readonly shipyardDocks: number;
  /** [임시] 도크 모듈을 붙인 조선소가 레벨 1 위로 한 레벨마다 더 얻는 도크 */
  readonly shipyardDockModule: number;
  /** [임시] 건조 특화 모듈: 만드는 시간 × 이 값 ÷ 1000 */
  readonly shipyardBuildSpecPm: number;
  /** [임시] 수리 특화 모듈: 수리 재료·시간 × 이 값 ÷ 1000 */
  readonly shipyardRepairSpecPm: number;
  /** [임시] 조선소에 닿았다고 보는 거리(배치 칸) — 이 안 물에 선 배를 고친다(1494 "조선소 도크에서") */
  readonly shipyardReachCells: number;
  /** [임시] 수리 재료 = 배 종류 재료 × (잃은 몫) × 이 값 ÷ 1000(올림) */
  readonly repairCostPm: number;
  /** [임시] 수리 시간 = 배 만드는 시간 × (잃은 몫) × 이 값 ÷ 1000 */
  readonly repairTimePm: number;
  // ---------- 정박장(1487·1490·1491·1500) ----------
  /** [임시] 정박장 레벨마다 정박 자리 수(1487 "레벨마다 늘어남") */
  readonly berthsPerLevel: number;
  /** [임시] 정박장에 들었다고 보는 거리(배치 칸) — 집 정박장 둘레 이 안이면 "정박 중"(1496 정박장 옆 바다에 보임) */
  readonly harborReachCells: number;
  /** [임시] 정박료 처음 값(하루, 화폐 최소 단위) — 주인이 바꾼다. 남의 배만 낸다 */
  readonly berthFeePerDay: number;
  /** [임시] 정박료를 못 낸 날이 이만큼 쌓이면 집 정박 자리를 잃는다(배는 잃지 않는다 — 1486 가) */
  readonly arrearsDays: number;
  /** [임시] 배 시설 내구도가 이보다 낮으면(‰) 새 배·임시 정박을 받지 않는다(1500 가, D-198·49 C30) */
  readonly harborStopPm: number;
  // ---------- 교역 부두(1488·1489) ----------
  /** [임시] 교역 부두 레벨마다 임시 자리 수 */
  readonly tradeSlotsPerLevel: number;
  /** [임시] 교역 부두 한 시간 요금 처음 값(화폐 최소 단위) — 주인이 바꾼다 */
  readonly tradeFeePerHour: number;
  /** [임시] 한 번에 살 수 있는 시간(시간) 상한 */
  readonly tradeMaxHours: number;
  /** [임시] 산 시간을 넘기면 초과 한 시간마다 요금 × 이 값(1489 "초과시간마다 높은 비용") */
  readonly tradeOverstayMul: number;
  // ---------- 배 내구도(1485·1486·1493·1495) ----------
  /** [임시] 집 정박장에 든 배가 하루에 닳는 양(‰/일) */
  readonly wearBerthedPd: number;
  /** [임시] 집이 있는 배가 정박장 밖에 있을 때 하루에 닳는 양(‰/일, 쓰지 않아도 — 1485) */
  readonly wearAwayPd: number;
  /** [임시] 집 정박 자리가 없는 배는 정박장 밖 닳음 × 이 값(1485 "방치하면 더 빨리 닳고") */
  readonly wearHomelessMul: number;
  /** [임시] 내구도 0인 배의 빠르기(‰, 1495 가 "아주 느리게") */
  readonly brokenSpeedPm: number;
}

export const START_BOATS: BoatCoefficients = {
  speed: 1536,
  capacity: 4,
  costPm: 1000,
  boardCells: 3,
  buildTimePm: 1000,
  upkeepPm: 300,
  gatherCells: 4,
  npcPerDock: 1,
  npcFishers: 2,
  shipyardDocks: 1,
  shipyardDockModule: 1,
  shipyardBuildSpecPm: 700,
  shipyardRepairSpecPm: 600,
  shipyardReachCells: 8,
  repairCostPm: 500,
  repairTimePm: 300,
  berthsPerLevel: 2,
  harborReachCells: 8,
  berthFeePerDay: 10,
  arrearsDays: 3,
  harborStopPm: 500,
  tradeSlotsPerLevel: 4,
  tradeFeePerHour: 5,
  tradeMaxHours: 24,
  tradeOverstayMul: 5,
  wearBerthedPd: 2,
  wearAwayPd: 10,
  wearHomelessMul: 4,
  brokenSpeedPm: 250,
};
