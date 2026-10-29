// 카드 목록(그리기) — 카드 ID → 제목 키·머리 링크·몸 부품. ID·크기·자료 출처는 @terra/shared/dashboard(HOME_CARDS)에 있다.
// 새 카드를 더하는 순서: dashboard.ts의 HOME_CARDS 한 줄(+ 시험) → messages의 card_<id>(ko·en) → 여기 한 줄 → icons.tsx 아이콘.
// satisfies Record<CardId, …>라 빠진 카드는 타입 검사가 잡는다. 빈 문구 키는 homeMessages.test.ts, 카드마다 이름이 그려지는지는 homeRender.test.ts가 본다.
import type { RouteTarget } from "@terra/shared";
import type { CardId } from "@terra/shared/dashboard";
import type { ComponentType } from "react";
import { m } from "../../paraglide/messages.js";
import type { CardBodyProps, HomeViewProps } from "../homeTypes.ts";
import type { ShownCard } from "../homeView.ts";
import { BriefingCardBody } from "./BriefingCard.tsx";
import { CardFrame } from "./CardFrame.tsx";
import { DiagnosticsCardBody } from "./DiagnosticsCard.tsx";
import { InboxCardBody, PendingCount } from "./InboxCard.tsx";
import { MapsCardBody } from "./MapsCard.tsx";
import { AssetsCardBody, CyborgCardBody, FactionCardBody, UnitsCardBody } from "./ServerCard.tsx";
import { TimelineCardBody } from "./TimelineCard.tsx";

export interface CardView {
  readonly title: () => string;
  /** 머리를 누르면 갈 화면. null이면 머리는 글자만 */
  readonly to: RouteTarget | null;
  readonly Body: ComponentType<CardBodyProps>;
}

export const CARD_VIEWS = {
  inbox: { title: m.card_inbox, to: { route: "inbox" }, Body: InboxCardBody },
  cyborg: { title: m.card_cyborg, to: { route: "cyborg" }, Body: CyborgCardBody },
  units: { title: m.card_units, to: { route: "units" }, Body: UnitsCardBody },
  assets: { title: m.card_assets, to: { route: "economy" }, Body: AssetsCardBody },
  faction: { title: m.card_faction, to: { route: "faction" }, Body: FactionCardBody },
  timeline: { title: m.card_timeline, to: null, Body: TimelineCardBody },
  briefing: { title: m.card_briefing, to: null, Body: BriefingCardBody },
  maps: { title: m.card_maps, to: null, Body: MapsCardBody },
  diagnostics: { title: m.card_diagnostics, to: null, Body: DiagnosticsCardBody },
} satisfies Record<CardId, CardView>;

/** 카드 이름(편집 시트·알림 문구) */
export function cardTitle(id: CardId): string {
  return CARD_VIEWS[id].title();
}

/** 카드 한 장 */
export function HomeCard({ card, ...view }: { card: ShownCard } & HomeViewProps) {
  const { title, to, Body } = CARD_VIEWS[card.id];
  return (
    <CardFrame
      id={card.id}
      title={title()}
      to={to}
      aside={card.id === "inbox" ? <PendingCount data={view.data} /> : null}
    >
      <Body {...view} size={card.size} />
    </CardFrame>
  );
}
