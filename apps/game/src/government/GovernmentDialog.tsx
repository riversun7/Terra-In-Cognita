// 정부(행정 건물) 대화상자 — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "정부 건물의 기본 기능도 없음"). 지연 조각(default export).
// 2차맵 정부 작은 판(GovernmentSheet.tsx)의 [정부 열기]가 연다. 모바일 우선: 좁으면 화면 전체, 넓으면 가운데 판(복귀 요약과 같은 틀).
// - 도시와 주인 나라: 나라 이름(내 나라 표)·지도자(NPC 국가 지도자 사이보그)·시장(NPC 도시 자동 지정 휴먼, 744 나 — MayorFact.tsx)·세율·
//   행정 레벨·휴먼 수.
// - 구인: 경제 화면 구인 판(economy/RecruitPanel.tsx)을 이 도시로 그대로 쓴다(tRPC recruit.board → WebSocket recruit_hire). 판정은 서버.
// - [창고]·[거래소]: 경제 화면 칸으로 간다(대화상자를 닫고 이동).
// 바뀜("WP-NPC3", 기획 정리 742 나·743 나): 지도자로 열면(via "leader" — 2차맵에서 누른 지도자, LeaderSheet.tsx) 머리가 지도자(이름·나라)다.
// 사실 줄 아래 도시 하루 값(GovernmentDay.tsx), 링크 아래 창구(외교·의뢰·국적 상담, GovernmentDesk.tsx — 국적 상담은 CitizenshipSlot.tsx —
// 다른 나라 정부면 귀화 신청 NaturalizePanel.tsx, docs/adr/2026-11-08-citizenship.md).
// 바뀜(사용자 지적 2026-11-15 "정보창 ui가 매우 허접 … 너무 단일톤 … 칸이나 정보구간 나누는것도 다 똑같에서 구분이 안된다"): 사실 줄을 두 구간으로
// 나눴다 — [다스리는 사람](나라·지도자·시장, 역할 색 사람 줄 PersonFact.tsx)과 [도시 현황](거래세·행정 레벨·휴먼, 큰 숫자 칸). 하루 값은 막대.
// 바뀜(질문 2012·2018 답): 지도자 덧말에 지배 가문, 하루 값 아래 가문 이동 정책 칸(HouseEntryPolicy.tsx — 도시 주인·독립 나라 가문장이 정한다).
// 바뀜(D-574): 지도자 덧말에 나라를 이끄는 방식(체제 — 10), 가문 도시면 다른 가문 짓기 정책 칸(HouseBuildPolicy.tsx — 2124).
import type { GovernmentResponse } from "@terra/shared/government";
import { useEffect, useId, useRef } from "react";
import { RecruitPanel } from "../economy/RecruitPanel.tsx";
import { m } from "../paraglide/messages.js";
import { NationEmblem } from "../ui/NationEmblem.tsx";
import { navigate } from "../shell/routerStore.ts";
import { GovernmentDay } from "./GovernmentDay.tsx";
import { type DeskRoute, GovernmentDesk } from "./GovernmentDesk.tsx";
import { LeaderHead } from "./LeaderHead.tsx";
import {
  cityTitle,
  leaderHouseText,
  leaderRuleText,
  leaderTitle,
  nationTitle,
  populationText,
  taxText,
} from "./governmentData.ts";
import { HouseBuildPolicy } from "./HouseBuildPolicy.tsx";
import { HouseEntryPolicy } from "./HouseEntryPolicy.tsx";
import { MayorFact } from "./MayorFact.tsx";
import { PersonFact } from "./PersonFact.tsx";
import "../economy/economy.css";
import "../economy/labor.css";
import "../economy/facilities.css";
import "./government.css";

export interface GovernmentDialogProps {
  readonly government: GovernmentResponse;
  /** 대화상자가 닫혔다([닫기]·Esc·이동) */
  readonly onClose: () => void;
  /** 어디서 열었나: 행정 건물(기본) 또는 2차맵 지도자(742 나 — 머리가 지도자) */
  readonly via?: "building" | "leader" | undefined;
}

/** 도시 현황 칸 하나(작은 이름표 + 큰 값) */
function Tile({ label, value, part }: { label: string; value: string; part: string }) {
  return (
    <div className="gov-tile" data-part={part}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function GovernmentDialog({ government, onClose, via = "building" }: GovernmentDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    // 읽기 프로그램이 제목부터 읽게 한다
    headingRef.current?.focus();
  }, []);

  const close = (): void => dialogRef.current?.close();
  const go = (route: "economy_warehouse" | "economy_market" | DeskRoute): void => {
    close();
    navigate({ route });
  };

  const { city, nation, leader } = government;
  if (!city || !nation) return null;
  return (
    <dialog
      ref={dialogRef}
      className="gov-dialog"
      aria-labelledby={titleId}
      onClose={onClose}
      data-part="government-dialog"
      data-city={city.id}
    >
      <div className="gov-panel">
        <div className="gov-head">
          {via === "leader" ? (
            <LeaderHead government={government} titleId={titleId} headingRef={headingRef} />
          ) : (
            <h2 id={titleId} ref={headingRef} className="gov-title" tabIndex={-1}>
              {m.government_title({ city: cityTitle(city) })}
            </h2>
          )}
          <button type="button" className="button-small gov-close" onClick={close}>
            {m.government_close()}
          </button>
        </div>
        {via === "leader" ? <p className="gov-muted">{m.government_leader_desk_hint()}</p> : null}
        <p className="gov-chips">
          {nation.emblem ? (
            // 나라 마크(NPC 국가의 만든 마크·올린 그림 — docs/adr/2026-11-11-faction-identity.md 6절)
            <NationEmblem
              spec={nation.emblem.spec}
              color={nation.emblem.color}
              uploaded={nation.emblem.uploaded}
              size={32}
              className="gov-emblem"
            />
          ) : null}
          {nation.mine ? <span className="gov-chip">{m.government_chip_mine()}</span> : null}
          {city.capital ? <span className="gov-chip">{m.government_chip_capital()}</span> : null}
          {city.start ? <span className="gov-chip">{m.government_chip_start()}</span> : null}
        </p>
        <section
          className="gov-section gov-band"
          aria-labelledby={`${titleId}-rulers`}
          data-part="government-rulers"
        >
          <h3 id={`${titleId}-rulers`} className="gov-section-title">
            {m.government_rulers_title()}
          </h3>
          <dl className="gov-people">
            <PersonFact
              part="government-nation"
              role="nation"
              label={m.government_field_nation()}
              name={nationTitle(nation)}
            />
            <PersonFact
              part="government-leader"
              role="leader"
              label={m.government_field_leader()}
              name={leaderTitle(leader)}
              empty={leader === null}
              notes={[
                ...(leader !== null && !leader.here ? [{ text: m.government_leader_away_note() }] : []),
                // 지배 가문(질문 2012 답 — 국가 지도자 = 지배 가문의 장)
                ...(leaderHouseText(leader) === null
                  ? []
                  : [{ text: leaderHouseText(leader) ?? "", part: "government-leader-house" }]),
                // 나라를 이끄는 방식(D-574 10 — 체제대로: 독재자·투표·지분)
                ...(leaderRuleText(leader) === null
                  ? []
                  : [{ text: leaderRuleText(leader) ?? "", part: "government-leader-rule" }]),
              ]}
            />
            <MayorFact mayor={government.mayor} />
          </dl>
        </section>
        <section
          className="gov-section gov-band"
          aria-labelledby={`${titleId}-city`}
          data-part="government-city"
        >
          <h3 id={`${titleId}-city`} className="gov-section-title">
            {m.government_city_title()}
          </h3>
          <dl className="gov-tiles">
            <Tile part="government-tax" label={m.government_field_tax()} value={taxText(nation.taxBp)} />
            <Tile
              part="government-admin"
              label={m.government_field_admin()}
              value={m.government_admin_level({ level: city.adminLevel })}
            />
            <Tile part="government-humans" label={m.government_field_humans()} value={populationText(city)} />
          </dl>
        </section>
        <GovernmentDay day={city.day} />
        {government.houseEntry ? <HouseEntryPolicy cityId={city.id} policy={government.houseEntry} /> : null}
        {government.houseEntry?.build ? (
          <HouseBuildPolicy
            cityId={city.id}
            build={government.houseEntry.build}
            canSet={government.houseEntry.canSetCity}
          />
        ) : null}
        <div className="gov-links">
          <button type="button" className="button-small gov-link" onClick={() => go("economy_warehouse")}>
            {m.government_go_storage()}
          </button>
          <button type="button" className="button-small gov-link" onClick={() => go("economy_market")}>
            {m.government_go_market()}
          </button>
        </div>
        <GovernmentDesk government={government} onNavigate={go} />
        <p className="gov-muted">{m.government_recruit_hint()}</p>
        <RecruitPanel cityId={city.id} />
      </div>
    </dialog>
  );
}
