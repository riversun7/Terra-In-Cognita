// DT-CITY 도시 화면 — 거점 화면 위 건물 말풍선(D-6005). 거점이 아직 없어 빈 땅 그림 + "거점이 생기면 건물 위에 할 일이 보입니다",
// 그 아래에 처리할 일 목록(ADR 2026-10-29-app-shell 6절). 그림은 꾸밈이다(읽기 프로그램에는 문구만). 아래는 카드 격자.
import { useId } from "react";
import { m } from "../../paraglide/messages.js";
import { CardGrid } from "../CardGrid.tsx";
import { InboxIcon } from "../cards/icons.tsx";
import { PendingCount } from "../cards/InboxCard.tsx";
import type { TemplateProps } from "../homeTypes.ts";
import { InboxBody } from "../InboxBody.tsx";
import { PINNED_ROWS } from "../PinnedTodo.tsx";
import "./templates.css";

export default function CityTemplate(props: TemplateProps) {
  const titleId = useId();
  return (
    <>
      <div className="city-plate">
        <div className="city-scene" aria-hidden="true">
          <span className="city-sun" />
          <span className="city-ground" />
          <span className="city-lot city-lot-1" />
          <span className="city-lot city-lot-2" />
          <span className="city-lot city-lot-3" />
        </div>
        <p className="city-message">{m.home_city_empty()}</p>
      </div>
      <section className="home-panel" aria-labelledby={titleId}>
        <div className="home-panel-head">
          <span className="home-card-icon" data-card-icon="inbox">
            <InboxIcon />
          </span>
          <h2 id={titleId} className="home-panel-title">
            {m.card_inbox()} <PendingCount data={props.data} />
          </h2>
        </div>
        <InboxBody data={props.data} limit={PINNED_ROWS} />
      </section>
      <CardGrid {...props} />
    </>
  );
}
