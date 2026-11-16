// 실제 항목의 바로 처리(기획 대조 2163 — D-573 원문 "기다릴지 해지하고 다른곳으로 갈지 정함"). 새 공용 메시지(inbox_action)를 만들지 않고 그 시스템의 기존
// 명령을 쓴다(quickActions.ts LIVE_ACTION_KINDS):
// - labor_paused [기다림]: 서버 상태는 그대로(계약은 이미 일시 중지 — 사업장에 수익이 나면 다시 일한다). 이 기기에서 그 경고를 접는다(folded.ts).
// - labor_paused [해지]: labor_terminate(경제 화면 노동 계약 칸과 같은 WebSocket 명령 — 경제 조각의 laborCommands.ts를 누를 때 불러온다).
// 끝나면 처리할 일을 다시 받는다(store.ts refreshInbox). 결과 문구를 돌려준다(목록이 그 줄 알림 영역에 보인다).
import type { InboxItem } from "@terra/shared/inbox";
import { m } from "../paraglide/messages.js";
import { foldInboxItem } from "./folded.ts";
import type { QuickActionId } from "./quickActions.ts";
import { refreshInbox } from "./store.ts";

export async function runLiveAction(item: InboxItem, action: QuickActionId): Promise<string> {
  if (item.kind !== "labor_paused") return m.inbox_action_failed();
  if (action === "wait") {
    foldInboxItem(item.id, item.firstSeenAt);
    void refreshInbox();
    return m.inbox_action_waited();
  }
  const contractId = item.params.contractId;
  if (action !== "terminate" || typeof contractId !== "number") return m.inbox_action_failed();
  try {
    const { sendLaborCommand } = await import("../economy/laborCommands.ts");
    const outcome = await sendLaborCommand({ t: "labor_terminate", contractId });
    void refreshInbox();
    return outcome.ok ? m.inbox_action_terminated() : m.inbox_action_failed();
  } catch {
    return m.inbox_action_failed();
  }
}
