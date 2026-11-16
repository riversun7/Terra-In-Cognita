// 실제 항목의 바로 처리(기획 대조 2163 — D-573 원문 "기다릴지 해지하고 다른곳으로 갈지 정함"). 새 공용 메시지(inbox_action)를 만들지 않고 그 시스템의 기존
// 명령을 쓴다(quickActions.ts LIVE_ACTION_KINDS):
// - labor_paused [기다림]: labor_wait(프로토콜 54, 기획 대조 2237 — D-6006·D-6011). 계약 상태는 그대로(이미 일시 중지 — 사업장에 수익이 나면 다시
//   일한다)이고, 서버가 그 멈춤 회차에 "기다림"을 남겨 같은 계정의 모든 기기에서 접힌다(같은 계약이 또 멈추면 다시 보인다). 예전: 이 기기에서만 접었다.
// - labor_paused [해지]: labor_terminate(경제 화면 노동 계약 칸과 같은 WebSocket 명령 — 경제 조각의 laborCommands.ts를 누를 때 불러온다).
// 끝나면 처리할 일을 다시 받는다(store.ts refreshInbox). 결과 문구를 돌려준다(목록이 그 줄 알림 영역에 보인다).
import type { InboxItem } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import type { QuickActionId } from "./quickActions.ts";
import { refreshInbox } from "./store.ts";

export async function runLiveAction(item: InboxItem, action: QuickActionId): Promise<string> {
  if (item.kind !== "labor_paused") return m.inbox_action_failed();
  const contractId = item.params.contractId;
  if ((action !== "wait" && action !== "terminate") || typeof contractId !== "number")
    return m.inbox_action_failed();
  try {
    const { sendLaborCommand } = await import("../economy/laborCommands.ts");
    const outcome = await sendLaborCommand(
      action === "wait"
        ? { t: "labor_wait", contractId, dueAt: item.firstSeenAt }
        : { t: "labor_terminate", contractId },
    );
    void refreshInbox();
    if (!outcome.ok) return m.inbox_action_failed();
    return action === "wait" ? m.inbox_action_waited() : m.inbox_action_terminated();
  } catch {
    return m.inbox_action_failed();
  }
}
