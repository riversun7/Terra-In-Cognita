// 정부 창구의 국적 상담 자리 — docs/adr/2026-11-07-play-flow.md "WP-NPC3"(기획 정리 742 나 지도자 = 외교·의뢰·국적 상담 창구, 745 나 다른 나라
// 정부에서 귀화). 국적 바꾸기(귀화 신청·값·쉬는 날)는 citizenship 줄기의 몫이다 — 그 줄기가 이 컴포넌트의 몸을 귀화 신청으로 바꾼다
// (받는 값: 이 정부 판 응답 government — 도시·나라(내 나라인가 mine)·지도자). 지금은 "준비 중" 한 줄만 그린다(단추 없음).
import type { GovernmentResponse } from "@terra/shared/government";
import { m } from "../paraglide/messages.js";

export interface CitizenshipSlotProps {
  /** 이 정부 판(나라·도시). 귀화 신청이 들어오면 다른 나라(nation.mine false)에서만 신청을 보인다 */
  readonly government: GovernmentResponse;
}

export function CitizenshipSlot(_props: CitizenshipSlotProps) {
  return (
    <div className="gov-desk-row" data-part="government-citizenship" data-state="placeholder">
      <div className="gov-desk-text">
        <span className="gov-desk-name">{m.government_desk_citizenship()}</span>
        <span className="gov-muted">{m.government_desk_citizenship_note()}</span>
      </div>
    </div>
  );
}
