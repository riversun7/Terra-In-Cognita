// 2차맵 원자재 오브젝트 채집 손잡이 — docs/adr/2026-11-07-gather-objects.md, 사용자 답(2026-11-07, 원문은 ADR 배경). 기획 D-112(채집 지점마다
// 다시 자라는 시각)·D-5030·D-5032(실제 시간, 개발자 패널 설정값)·D-115(오염된 땅은 덜 자람). 수치는 모두 [임시](D-515: 밸런싱 단계에서 정한다).
// 옛 규칙이 있는 칸은 옛 값(AntiGravt01 terra-server/game/gather/FieldGatherEngine.js: 화물 상한 max_carry_weight 80,000g — 오브젝트 종류마다의
// 값은 팩 gather_objects). 시뮬은 읽지 않는다(서버 채집 서비스 apps/server/src/gather/가 읽는다).

export interface GatherObjectCoefficients {
  /** [임시] 유닛 하나가 채집하며 드는 화물 상한(g). 옛 max_carry_weight 기본 80,000g */
  readonly carryGrams: number;
  /** [임시] 직접 채집(벌목장·광산 반경 밖, 창고·도시 창고로 나름) 수확 배율(‰). 사용자 답 "나무에서 직접 채집도 가능하나 효율이 떨어짐" */
  readonly directYieldPm: number;
  /** [임시] 벌목장·광산 반경(배치 칸). 반경 안 그 시설이 맡는 오브젝트는 그 시설에 바로 넣고 버프를 받는다 */
  readonly campRadiusCells: number;
  /** [임시] 시설 레벨 하나 오를 때마다 더하는 수확(‰, Lv1 = 1000) — "건물 등급에 따른 채집량" */
  readonly campLevelPm: number;
  /** [임시] 시설 반경 안 채집 한 번의 피로 배율(‰) — "피로도 소모감소" */
  readonly campFatiguePm: number;
  /** [임시] 일하는 시설 반경 안 오브젝트의 다시 자라는 시간 배율(‰) — "오브젝트 빠른 재생" */
  readonly campRegrowPm: number;
  /** [임시] 채집 한 번에 쌓이는 피로(점, 피로 상한 N21) */
  readonly fatiguePerGather: number;
  /** [임시] 오브젝트가 다 떨어지면 다음 같은 종류 오브젝트를 찾는 반경(배치 칸) */
  readonly nextRadiusCells: number;
  /** [임시] 오염 최대(100,000)일 때 다시 자라는 시간에 더하는 몫(‰). 오염 값에 비례(D-115) */
  readonly pollutionRegrowPm: number;
  /**
   * [임시] 채집소(벌목장·광산) 레벨 하나 오를 때마다 넓어지는 반경(배치 칸, Lv1 = campRadiusCells). 사용자 지적(2026-11-08) "원자재채집소의 기능도
   * 필요" — 레벨에 따라 버프가 커진다(docs/adr/2026-11-07-gather-objects.md "바뀜 (2026-11-08 사용자 지적: 채집소 기능)")
   */
  readonly stationRadiusStep: number;
  /** [임시] 채집소 레벨 하나 오를 때마다 피로 배율에서 빼는 몫(‰, Lv1 = campFatiguePm) */
  readonly stationFatigueStepPm: number;
  /** [임시] 채집소 레벨 하나 오를 때마다 다시 자람 시간 배율에서 빼는 몫(‰, Lv1 = campRegrowPm) */
  readonly stationRegrowStepPm: number;
  /** [임시] 채집소 피로·다시 자람 배율의 하한(‰) — 레벨이 높아도 이보다 줄지 않는다 */
  readonly stationFloorPm: number;
  /** [임시] 채집소 창고 → 그 도시의 주인 도시 창고 자동 옮김 간격(ms). 0이면 자동으로 옮기지 않는다(손으로만) */
  readonly stationHaulMs: number;
}

export const START_GATHER_OBJECTS: GatherObjectCoefficients = {
  carryGrams: 80_000,
  directYieldPm: 500,
  campRadiusCells: 40,
  campLevelPm: 200,
  campFatiguePm: 500,
  campRegrowPm: 500,
  fatiguePerGather: 1,
  nextRadiusCells: 24,
  pollutionRegrowPm: 1000,
  stationRadiusStep: 4,
  stationFatigueStepPm: 50,
  stationRegrowStepPm: 50,
  stationFloorPm: 200,
  stationHaulMs: 600_000,
};
