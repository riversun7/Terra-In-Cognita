// 2차맵 화면의 명령 안내(아래 판 한 줄)와 고른 유닛 상태 — SecondaryMapScreen.tsx에서 나눴다(파일 크기). docs/adr/2026-11-07-unit-control.md
// 이동·멈추기를 보냈다·결과·보내지 않은 까닭(내 유닛이 아님·수호신·포로·중태·끊김)을 지금 언어의 문장으로.
import type { MapUnitHold } from "@terra/shared/mapUnits";
import { m } from "../paraglide/messages.js";
import type { CommandReport } from "./feedTypes.ts";
import { resultText } from "./mapMessages.ts";
import { selectionText } from "./mapUnits.ts";
import type { TravelOutcome } from "./travelCommands.ts";
import { travelProblemText } from "./travelData.ts";

/** 아래 판의 명령 안내 */
export type CommandNotice =
  | { kind: "view_only" }
  | { kind: "offline" }
  /** 내 유닛이지만 지금 명령할 수 없다(수호신·포로·중태) — 보내지 않았다 */
  | { kind: "hold"; hold: MapUnitHold; label: string }
  | { kind: "sent"; unitId: number; action: "move" | "stop" }
  | { kind: "result"; report: CommandReport }
  /** 옆 2차맵 땅을 눌러 2차맵 사이 이동(travel_start)을 보낸 결과 — docs/adr/2026-11-08-seamless-second-map.md WP-3 "바뀜" */
  | { kind: "travel"; unitId: number; outcome: TravelOutcome | null };

/** 고른 유닛의 지금 상태(시야 전송의 내 유닛 표시·가는 중) — 고를 때와 1초마다 */
export interface SelectionState {
  own: boolean;
  moving: boolean;
}
export const NO_SELECTION: SelectionState = { own: false, moving: false };

/** 넓은 화면(데스크톱)인가 — 목록을 펼친 채 열고, 줄을 골라도 접지 않는다(기획 60 §2.4 "지도 옆에 유닛 목록") */
export const wideScreen = (): boolean => window.matchMedia("(min-width: 64em)").matches;

export function commandText(notice: CommandNotice): string {
  switch (notice.kind) {
    case "view_only":
      return m.map_view_only();
    case "offline":
      return m.map_command_offline();
    case "hold":
      return selectionText({ kind: "hold", hold: notice.hold }, notice.label, 0, false);
    case "sent":
      return notice.action === "stop"
        ? m.map_command_stop_sent({ id: notice.unitId })
        : m.map_command_sent({ id: notice.unitId });
    case "result": {
      const { outcome, unitId, action } = notice.report;
      if (action === "stop") {
        if (outcome.ok) return m.map_command_stopped({ id: unitId });
        return `${m.map_command_stop_failed({ id: unitId })} ${resultText(outcome.code)}`;
      }
      if (outcome.ok) return m.map_command_ok({ id: unitId });
      return `${m.map_command_failed({ id: unitId })} ${resultText(outcome.code)}`;
    }
    case "travel":
      if (notice.outcome === null) return m.map_command_sent({ id: notice.unitId });
      if (notice.outcome.ok) return m.map_travel_sent({ id: notice.unitId });
      return `${m.map_command_failed({ id: notice.unitId })} ${travelProblemText(notice.outcome.code)}`;
    default: {
      const unhandled: never = notice;
      return unhandled;
    }
  }
}

/** 시험(data-command)용 명령 상태: view_only·offline·sent·ok·결과 코드 */
export function commandState(notice: CommandNotice | null): string | undefined {
  if (!notice) return undefined;
  if (notice.kind === "travel")
    return notice.outcome === null ? "sent" : notice.outcome.ok ? "travel_ok" : notice.outcome.code;
  if (notice.kind !== "result") return notice.kind;
  return notice.report.outcome.ok ? "ok" : notice.report.outcome.code;
}
