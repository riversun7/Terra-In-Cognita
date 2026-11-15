// 3D 관람 전투맵 명령 → 전투 보고서 명령(D-558 1546) — 관람 화면(BattleCommandBar)이 고른 명령을 그 판 군단 명령 줄(ReportOrder)로 바꾼다.
// 서버가 그 명령을 넣어 같은 시드의 판을 다시 기록한다(판정은 서버). 파티 = 그 편 파티 ID 차례, 목표 = 상대 파티 차례·자리, 시각 = 초(버림).
// 순수 함수다(시험 대상).
import { REPORT_LEGION_ORDER, type ReportOrder } from "@terra/shared/battleReport";
import {
  type BattleCommandIssue,
  type CommandUnits,
  sideParties,
  unitSlot,
} from "../../../battle/battleCommands.ts";

/** 관람 명령 하나 → 보고서 명령(풀 수 없으면 null — 다른 편 파티·같은 편 목표 등) */
export function reportOrderOf(
  issue: BattleCommandIssue,
  replay: CommandUnits,
  side: number,
): ReportOrder | null {
  const parties = sideParties(replay, side);
  const index = issue.party === null ? 0 : parties.indexOf(issue.party);
  if (index < 0) return null;
  const party = issue.party === null ? REPORT_LEGION_ORDER : index;
  const base = { atSec: Math.max(0, Math.floor(issue.atMs / 1000)), party };
  const order = issue.order;
  switch (order.kind) {
    case "attack": {
      const slot = unitSlot(replay, order.target);
      if (!slot || slot.side === side || slot.party < 0 || slot.index < 0) return null;
      return { ...base, kind: "attack", target: { party: slot.party, index: slot.index } };
    }
    case "follow": {
      const leader = parties.indexOf(order.leader);
      if (leader < 0 || leader === party) return null;
      return { ...base, kind: "follow", leader };
    }
    case "formation":
      return { ...base, kind: "formation", shape: order.shape };
    case "tactic":
      return { ...base, kind: "tactic", tactic: order.tactic };
    case "advance":
    case "rally":
      return order.cell ? { ...base, kind: order.kind, cell: order.cell } : { ...base, kind: order.kind };
    default:
      return { ...base, kind: order.kind };
  }
}
