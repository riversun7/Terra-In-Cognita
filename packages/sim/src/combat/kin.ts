// 같은 무리끼리 치지 않기 — 사용자 결정 D-593(2681 "공격자체가 불가": 같은 가문끼리는 공격하지 못한다), 기획 검토 2715(fixes-1117j: 쿠데타에서 같은 가문원이 맞선 편에
// 들어도 서로 싸우지 않는다). 전투 엔진의 적·아군은 편(side)으로 갈리고, 이 칸은 편과 따로 "서로 치지 않는 짝"을 만든다.
// - CombatUnitSpec.kin: 같은 값을 가진 두 유닛은 다른 편이어도 서로 목표로 삼지 않고(가장 가까운 적·명령 목표·전개 방식 적 목록), 기본 공격·스킬 피해(둘레·연쇄 포함)·
//   밀치기 부딪힘을 주지 않는다. 시야(보이는 적 목록)·은신 들킴은 그대로다(보이는 것은 막지 않는다 — 치지만 않는다).
// - 칸이 없으면(undefined — 서버가 쿠데타 전투에서만 넣는다, 시뮬레이터·다른 전투는 넣지 않는다) 옛 판정 그대로다.
import type { UnitState } from "./battleTypes.ts";

type Kinned = Pick<UnitState, "kin">;

/** 같은 무리인가(둘 다 kin이 있고 같다) — 서로 치지 않는다 */
export function sameKin(a: Kinned, b: Kinned): boolean {
  return a.kin !== undefined && a.kin === b.kin;
}
