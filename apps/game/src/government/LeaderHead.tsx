// 지도자로 연 정부 대화상자의 머리 — 기획 정리 742 나(지도자 = 정부 창구, 정부 판이 지도자를 머리로), docs/adr/2026-11-07-play-flow.md "WP-NPC3".
// 지도자 표시(지도 이름표와 같은 왕관 꼴)·"NPC 국가 지도자" + 지도자 이름(제목) + "나라 · 수도 도시 정부" 한 줄.
import type { GovernmentResponse } from "@terra/shared/government";
import type { Ref } from "react";
import { m } from "../paraglide/messages.js";
import { EntityRef, EntitySymbol } from "../ui/EntityRef.tsx";
import { cityTitle, leaderTitle, nationTitle } from "./governmentData.ts";

export interface LeaderHeadProps {
  readonly government: GovernmentResponse;
  /** 대화상자 제목 ID(aria-labelledby) */
  readonly titleId: string;
  /** 열 때 초점을 받는 제목 */
  readonly headingRef: Ref<HTMLHeadingElement>;
}

/** 지도자 표시(왕관 꼴, 꾸밈 — 이름은 옆 글자가 알린다) */
export function LeaderMark({ className }: { readonly className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 17.5h16l1.2-9.5-5.2 3.8L12 5l-4 6.8L2.8 8z" />
    </svg>
  );
}

export function LeaderHead({ government, titleId, headingRef }: LeaderHeadProps) {
  const { city, nation, leader } = government;
  return (
    <div className="gov-leader-head" data-part="government-leader-head">
      <p className="gov-kicker">
        <LeaderMark className="gov-leader-mark" />
        {m.government_leader_kicker()}
      </p>
      <h2 id={titleId} ref={headingRef} className="gov-title gov-title-city" tabIndex={-1}>
        <EntitySymbol kind="unit" role="leader" size={20} />
        <span translate="no">{leaderTitle(leader)}</span>
      </h2>
      {city && nation ? (
        <p className="gov-sheet-line">
          <EntityRef kind="nation" emblem={nation.emblem} name={nationTitle(nation)} />
          <span aria-hidden="true">·</span>
          <EntityRef kind="city" name={cityTitle(city)} />
        </p>
      ) : null}
    </div>
  );
}
