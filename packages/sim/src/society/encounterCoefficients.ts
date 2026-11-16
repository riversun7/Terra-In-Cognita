// 유닛 조우 계수(팩 tuning 경로 "encounter.*", 모두 [임시]) — 기획 D-564 1641(적끼리 만나면 자동 조우)·D-570(다른 나라면 모두 대상, 일정 거리 안에
// 유닛·분대가 들면 AI 판단 — 회피·약탈·전투, 조우로 멈춘 유닛은 AI가 다시 판단). 질문 1905(조우 수치를 설정 칸으로). 셈은 서버
// apps/server/src/travel/(clash.ts·clashDecide.ts·encounterWorld.ts·afterEncounter.ts). 시뮬은 읽지 않는다(판정 바뀜 없음).

export interface EncounterCoefficients {
  /** [임시] 조우를 찾는 간격(ms). 띄운 2차맵·띄우지 않은 2차맵(좌표 유닛)을 같은 틱에 본다 */
  readonly scanMs: number;
  /** [임시] 조우가 난(또는 모두 회피한) 2차맵·두 나라 짝을 다시 보지 않는 시간(ms) */
  readonly cooldownMs: number;
  /** [임시] 한 틱에 여는 조우 전투 수 */
  readonly maxPerScan: number;
  /** [임시] 조우 전투맵 한 변(칸, 짝수로 내림 — 일반 전투 64) */
  readonly mapSize: number;
  /** [임시] 띄운 2차맵에서 만났다고 보는 거리(배치 칸, 체비쇼프) */
  readonly radiusCells: number;
  /** [임시] 한 편에 드는 유닛 상한(가까운 차례) */
  readonly maxSideUnits: number;
  /** [임시] 전쟁 중인 상대에게 싸움을 거는 전력 비(‰, 내 전력 ÷ 상대 전력) */
  readonly warRatioPm: number;
  /** [임시] 전쟁이 아닌 다른 나라 짐을 약탈하러 거는 전력 비(‰) */
  readonly lootRatioPm: number;
  /** [임시] NPC 공격 성향이 문턱을 옮기는 세기(‰): 성향 500 = 그대로, 0 = 문턱 × (1 + 0.5 × 이 값), 1000 = 문턱 × (1 − 0.5 × 이 값) */
  readonly aggressionPm: number;
  /** [임시] 플레이어 유닛의 자동 판단(행동 설정이 아직 없다): 0 = 늘 회피(먼저 걸지 않음), 1 = NPC와 같은 판단(성향 500) */
  readonly playerPolicy: number;
  /** [임시] 조우 뒤 다시 판단: 짐이 운반 상한의 이 몫(‰) 이상이면 전리품을 정리하러 출발한 자리로 */
  readonly fullPm: number;
  /** [임시] 조우 뒤 다시 판단: 남은 HP가 최대의 이 몫(‰) 아래이거나 부상이면 재정비하러 출발한 자리로 */
  readonly regroupHpPm: number;
}

export const START_ENCOUNTER: EncounterCoefficients = {
  scanMs: 10_000,
  cooldownMs: 30 * 60_000,
  maxPerScan: 4,
  mapSize: 64,
  radiusCells: 10,
  maxSideUnits: 24,
  warRatioPm: 800,
  lootRatioPm: 1500,
  aggressionPm: 1000,
  playerPolicy: 0,
  fullPm: 850,
  regroupHpPm: 500,
};
