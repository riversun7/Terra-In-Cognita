// 보고서 군단 명령 → 판정 입력 — 기획 D-545·D-549(파티·군단 명령), docs/adr/2026-11-14-battle-report.md "바뀜 (2026-11-14, 파티·군단 명령)".
// 전투 보고서(setup.ts)와 실험실 한 판·3D 관람(battleLab services)이 같이 쓴다. 시각 명령(초) → 그 시각 틱, 파티 번호 → 판정 파티 ID,
// 군단 명령 → 편 번호(편 바꾼 판이면 바뀐 편), 목표 공격의 상대 파티·자리 → 상대 유닛 ID. 순수 함수다.
import {
  type ReportLegion,
  REPORT_LEGION_ORDER,
  type ReportOrder,
  legionOrders,
} from "@terra/shared/battleReport";
import type { BattleInput, PartyOrderInput } from "@terra/sim";

/** 군단 하나가 판정에서 쓰는 번호 */
export interface LegionIds {
  /** 군단 안 파티 번호 → 판정 파티 ID */
  readonly partyId: (p: number) => number;
  /** 이 군단의 편 */
  readonly side: number;
  /** 상대 군단 파티·자리 → 상대 유닛 ID(상대가 실험실 군단이 아니면 없다 — 목표 공격을 넣지 않는다) */
  readonly enemyId?: ((p: number, index: number) => number) | undefined;
}

/** 보고서 명령 하나 → 판정 명령(목표를 풀 수 없으면 null) */
function orderOf(order: ReportOrder, ids: LegionIds): PartyOrderInput | null {
  switch (order.kind) {
    case "attack": {
      const target = order.target;
      if (!target || !ids.enemyId) return null;
      return { kind: "attack", target: ids.enemyId(target.party, target.index) };
    }
    case "advance":
      return { kind: "advance" };
    case "hold":
      return { kind: "hold" };
    case "retreat":
      return { kind: "retreat" };
    default:
      return { kind: "free" };
  }
}

/** 군단 명령(옛 군단 퇴각 시각 포함) → 판정 입력(시각 차례) */
export function legionInputs(legion: ReportLegion, ids: LegionIds, tickMs: number): BattleInput[] {
  const out: BattleInput[] = [];
  for (const order of legionOrders(legion)) {
    const command = orderOf(order, ids);
    if (!command) continue;
    const tick = Math.ceil((order.atSec * 1000) / tickMs);
    if (order.party === REPORT_LEGION_ORDER)
      out.push({ tick, kind: "legion", side: ids.side, order: command });
    else out.push({ tick, kind: "order", party: ids.partyId(order.party), order: command });
  }
  return out;
}
