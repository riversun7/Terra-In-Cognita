// 정부 창구(외교·의뢰·국적 상담) — 기획 정리 742 나(지도자와 대화 — 외교·의뢰·국적 상담 창구, 정부 판과 같은 창구), docs/adr/2026-11-07-play-flow.md
// "WP-NPC3". 지금 있는 화면으로 잇는 자리다(새 규칙 없음):
// - 외교: 세력 화면(외교 칸 — 나라 사이 관계·전쟁).
// - 의뢰: 나라 의뢰(46 §9 정착 안내 등)는 아직 없다 → 받은 의뢰·구인이 모이는 처리할 일.
// - 국적 상담: CitizenshipSlot.tsx(citizenship 줄기가 귀화 신청을 넣는 자리).
// 정부 대화상자(GovernmentDialog.tsx)가 행정 건물·지도자 어느 쪽으로 열든 둔다.
import type { GovernmentResponse } from "@terra/shared/government";
import { useId } from "react";
import { m } from "../paraglide/messages.js";
import { CitizenshipSlot } from "./CitizenshipSlot.tsx";

/** 창구가 여는 화면(대화상자를 닫고 간다) */
export type DeskRoute = "faction" | "inbox";

export interface GovernmentDeskProps {
  readonly government: GovernmentResponse;
  readonly onNavigate: (route: DeskRoute) => void;
}

/** 창구 한 줄: 이름·설명 + 가는 단추 */
function DeskRow(props: { part: string; name: string; note: string; action: string; onAction: () => void }) {
  return (
    <div className="gov-desk-row" data-part={props.part}>
      <div className="gov-desk-text">
        <span className="gov-desk-name">{props.name}</span>
        <span className="gov-muted">{props.note}</span>
      </div>
      <button type="button" className="button-small gov-desk-go" onClick={props.onAction}>
        {props.action}
      </button>
    </div>
  );
}

export function GovernmentDesk({ government, onNavigate }: GovernmentDeskProps) {
  const titleId = useId();
  return (
    <section className="gov-section" aria-labelledby={titleId} data-part="government-desk">
      <h3 id={titleId} className="gov-section-title">
        {m.government_desk_title()}
      </h3>
      <DeskRow
        part="government-diplomacy"
        name={m.government_desk_diplomacy()}
        note={m.government_desk_diplomacy_note()}
        action={m.nav_faction()}
        onAction={() => onNavigate("faction")}
      />
      <DeskRow
        part="government-quests"
        name={m.government_desk_quests()}
        note={m.government_desk_quests_note()}
        action={m.inbox_title()}
        onAction={() => onNavigate("inbox")}
      />
      <CitizenshipSlot government={government} />
    </section>
  );
}
