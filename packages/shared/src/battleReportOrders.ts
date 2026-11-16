// 전투 보고서 파티·군단 명령 모양과 검사 — 기획 D-549·D-558, docs/adr/2026-11-14-battle-report.md "바뀜 (D-558)". battleReport.ts가 다시 내보낸다
// (1,000줄 상한으로 나눔). 다른 내부 꾸러미를 가져오지 않는다.

/**
 * 파티·군단 명령 종류(판정 PartyOrderInput과 같은 이름, 기획 D-549·D-558): 진형 전진·자리 지키기·목표 공격·퇴각·거두기(AI로)·집결(군단 =
 * 지휘관 자리, 파티 = 파티 가운데)·따라가기(다른 파티 뒤)·대형 고르기·AI 전개 방식
 */
export const REPORT_ORDER_KINDS = [
  "advance",
  "hold",
  "attack",
  "retreat",
  "free",
  "rally",
  "follow",
  "formation",
  "tactic",
] as const;
export type ReportOrderKind = (typeof REPORT_ORDER_KINDS)[number];
/** 대형(판정 FORMATION_SHAPES와 같은 목록 — 서버 시험이 견준다): 횡대·종대·쐐기·방진·손으로 짠 진형(custom — 유닛 진형판 자리, D-172·D-571 답 1965) */
export const REPORT_FORMATIONS = ["line", "column", "wedge", "block", "custom"] as const;
export type ReportFormation = (typeof REPORT_FORMATIONS)[number];
/** AI 전개 방식(판정 TACTICS와 같은 목록, D-558 2차): 돌격·수비 집중·중앙 돌파·측면 우회·후방 침투·집중 사격·견제·지연전 */
export const REPORT_TACTICS = [
  "assault",
  "defend",
  "center",
  "flank",
  "infiltrate",
  "focus",
  "harass",
  "delay",
] as const;
export type ReportTactic = (typeof REPORT_TACTICS)[number];
/** 군단 명령 자리(ReportOrder.party) */
export const REPORT_LEGION_ORDER = -1;

/**
 * 시각 명령 하나: atSec초에 파티(0부터) 또는 군단(REPORT_LEGION_ORDER)에. 목표 공격은 상대 군단의 파티·자리. 전진·집결의 칸(cell)은 전투맵
 * 명령 화면(3D 관람, D-558 1546)이 전장을 눌러 넣는다 — 그 판 전투맵 칸이라 편·공격 변이 바뀌는 여러 판에서는 같은 칸이 다른 뜻일 수 있다
 */
export interface ReportOrder {
  readonly atSec: number;
  readonly party: number;
  readonly kind: ReportOrderKind;
  readonly target?: { readonly party: number; readonly index: number } | undefined;
  /** 따라가기: 따라갈 같은 군단 파티 번호(0부터) */
  readonly leader?: number | undefined;
  /** 대형 고르기: 대형 */
  readonly shape?: ReportFormation | undefined;
  /** 전개 방식 */
  readonly tactic?: ReportTactic | undefined;
  /** 전진·집결의 전투맵 칸(없으면 전진 = 적 쪽으로, 집결 = 지휘관 자리·파티 가운데) */
  readonly cell?: { readonly x: number; readonly y: number } | undefined;
}

/** 명령 칸 좌표 상한(전투맵 한 변 − 1, 공성 128 — 작은 맵이면 판정이 지도 밖 칸을 거절한다) */
export const REPORT_ORDER_CELL_MAX = 255;

const intIn = (value: number, min: number, max: number): boolean =>
  Number.isInteger(value) && value >= min && value <= max;

/**
 * 군단 명령 줄 검사(수·시각·자리·목표·종류별 칸). 문제가 있으면 true. parties = 그 군단 분대 수, enemyUnits = 상대 군단 분대마다 유닛 수
 * (상대가 실험실 군단이 아니면 null — 목표 공격을 넣을 수 없다)
 */
export function reportOrdersProblem(
  orders: readonly ReportOrder[],
  parties: number,
  limitSec: number,
  enemyUnits: readonly number[] | null,
  ordersMax: number,
): boolean {
  if (orders.length > ordersMax) return true;
  return orders.some((order) => {
    if (!intIn(order.atSec, 0, limitSec) || !REPORT_ORDER_KINDS.includes(order.kind)) return true;
    if (!intIn(order.party, REPORT_LEGION_ORDER, parties - 1)) return true;
    // 종류마다 그 칸만(따라가기 = 같은 군단의 다른 분대, 대형·전개 방식 = 목록 안)
    if ((order.kind === "follow") !== (order.leader !== undefined)) return true;
    if ((order.kind === "formation") !== (order.shape !== undefined)) return true;
    if ((order.kind === "tactic") !== (order.tactic !== undefined)) return true;
    if (order.cell !== undefined) {
      if (order.kind !== "advance" && order.kind !== "rally") return true;
      if (!intIn(order.cell.x, 0, REPORT_ORDER_CELL_MAX) || !intIn(order.cell.y, 0, REPORT_ORDER_CELL_MAX))
        return true;
    }
    if (order.leader !== undefined)
      return !intIn(order.leader, 0, parties - 1) || order.leader === order.party;
    if (order.shape !== undefined) return !REPORT_FORMATIONS.includes(order.shape);
    if (order.tactic !== undefined) return !REPORT_TACTICS.includes(order.tactic);
    if (order.kind !== "attack") return order.target !== undefined;
    const target = order.target;
    if (!target || !enemyUnits) return true;
    const count = enemyUnits[target.party];
    return count === undefined || !intIn(target.index, 0, count - 1);
  });
}
