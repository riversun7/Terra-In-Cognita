// 정부(행정 건물) 대화상자 — docs/adr/2026-11-07-play-flow.md "WP-NPC"(사용자 지적 2026-11-08 "정부 건물의 기본 기능도 없음"). 지연 조각(default export).
// 2차맵 정부 작은 판(GovernmentSheet.tsx)의 [정부 열기]가 연다. 모바일 우선: 좁으면 화면 전체, 넓으면 가운데 판(복귀 요약과 같은 틀).
// - 도시와 주인 나라: 나라 이름(내 나라 표)·지도자(NPC 국가 지도자 사이보그)·시장(서버에 임명이 없어 "없음", 질문 744)·세율·행정 레벨·휴먼 수.
// - 구인: 경제 화면 구인 판(economy/RecruitPanel.tsx)을 이 도시로 그대로 쓴다(tRPC recruit.board → WebSocket recruit_hire). 판정은 서버.
// - [창고]·[거래소]: 경제 화면 칸으로 간다(대화상자를 닫고 이동).
// - 국적 바꾸기(귀화, 질문 745 나): 내 나라가 아닌 도시면 NaturalizePanel.tsx 한 칸(docs/adr/2026-11-08-citizenship.md).
import type { GovernmentResponse } from "@terra/shared/government";
import { useEffect, useId, useRef } from "react";
import { RecruitPanel } from "../economy/RecruitPanel.tsx";
import { NaturalizePanel } from "./NaturalizePanel.tsx";
import { m } from "../paraglide/messages.js";
import { navigate } from "../shell/routerStore.ts";
import { cityTitle, leaderTitle, nationTitle, populationText, taxText } from "./governmentData.ts";
import "../economy/economy.css";
import "../economy/labor.css";
import "../economy/facilities.css";
import "./government.css";

export interface GovernmentDialogProps {
  readonly government: GovernmentResponse;
  /** 대화상자가 닫혔다([닫기]·Esc·이동) */
  readonly onClose: () => void;
}

/** 사실 한 줄(이름표 + 값) */
function Fact({ label, value, part }: { label: string; value: string; part: string }) {
  return (
    <div className="gov-fact" data-part={part}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default function GovernmentDialog({ government, onClose }: GovernmentDialogProps) {
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
  const go = (route: "economy_warehouse" | "economy_market"): void => {
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
          <h2 id={titleId} ref={headingRef} className="gov-title" tabIndex={-1}>
            {m.government_title({ city: cityTitle(city) })}
          </h2>
          <button type="button" className="button-small gov-close" onClick={close}>
            {m.government_close()}
          </button>
        </div>
        <p className="gov-chips">
          {nation.mine ? <span className="gov-chip">{m.government_chip_mine()}</span> : null}
          {city.capital ? <span className="gov-chip">{m.government_chip_capital()}</span> : null}
          {city.start ? <span className="gov-chip">{m.government_chip_start()}</span> : null}
        </p>
        <dl className="gov-facts">
          <Fact part="government-nation" label={m.government_field_nation()} value={nationTitle(nation)} />
          <Fact
            part="government-leader"
            label={m.government_field_leader()}
            value={
              leader !== null && !leader.here
                ? m.government_leader_away({ name: leaderTitle(leader) })
                : leaderTitle(leader)
            }
          />
          <Fact
            part="government-mayor"
            label={m.government_field_mayor()}
            value={m.government_mayor_none()}
          />
          <Fact part="government-tax" label={m.government_field_tax()} value={taxText(nation.taxBp)} />
          <Fact
            part="government-admin"
            label={m.government_field_admin()}
            value={m.government_admin_level({ level: city.adminLevel })}
          />
          <Fact part="government-humans" label={m.government_field_humans()} value={populationText(city)} />
        </dl>
        <div className="gov-links">
          <button type="button" className="button-small gov-link" onClick={() => go("economy_warehouse")}>
            {m.government_go_storage()}
          </button>
          <button type="button" className="button-small gov-link" onClick={() => go("economy_market")}>
            {m.government_go_market()}
          </button>
        </div>
        <NaturalizePanel government={government} />
        <p className="gov-muted">{m.government_recruit_hint()}</p>
        <RecruitPanel cityId={city.id} />
      </div>
    </dialog>
  );
}
