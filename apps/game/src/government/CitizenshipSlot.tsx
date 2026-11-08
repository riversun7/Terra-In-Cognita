// 정부 창구의 국적 상담 자리 — docs/adr/2026-11-07-play-flow.md "WP-NPC3"(기획 정리 742 나 지도자 = 외교·의뢰·국적 상담 창구), 745 나(다른 나라
// 정부에서 귀화), docs/adr/2026-11-08-citizenship.md.
// - 다른 나라 정부(nation.mine false): 귀화 신청 칸(NaturalizePanel.tsx — 조건 tRPC world.naturalization, 신청 WebSocket nationality_change).
// - 내 나라 정부: 창구 한 줄 "내 나라 정부, 다른 나라 정부에서 귀화를 신청할 수 있다"(단추 없음).
import type { GovernmentResponse } from "@terra/shared/government";
import { m } from "../paraglide/messages.js";
import { NaturalizePanel } from "./NaturalizePanel.tsx";

export interface CitizenshipSlotProps {
  /** 이 정부 판(나라·도시). 다른 나라(nation.mine false)에서만 귀화 신청을 보인다 */
  readonly government: GovernmentResponse;
}

export function CitizenshipSlot({ government }: CitizenshipSlotProps) {
  if (government.nation && !government.nation.mine) return <NaturalizePanel government={government} />;
  return (
    <div className="gov-desk-row" data-part="government-citizenship" data-state="member">
      <div className="gov-desk-text">
        <span className="gov-desk-name">{m.government_desk_citizenship()}</span>
        <span className="gov-muted">{m.government_desk_citizenship_note()}</span>
      </div>
    </div>
  );
}
