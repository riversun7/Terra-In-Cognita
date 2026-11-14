// 서버 카드(내 사이보그·보유 유닛·세력) — dashboard.cards의 상태를 그린다(ADR 2026-10-29-app-shell 6절). 자산 카드는 경제 원장 잔고로 그린다
// (AssetsCard.tsx, docs/adr/2026-11-14-inventory-screen.md).
// 지금은 그 시스템이 없어 늘 not_ready("준비 중")다. 숫자는 그리지 않는다(가짜 숫자 없음, 시안 자료에서도 준비 중 — 사용자 결정 2).
// 빈 문구는 "무엇이 언제 보일지"만 말한다. 세력 카드는 잠그지 않는다(머리 링크로 세력 화면에 간다).
// ready 자료 모양은 그 시스템이 정한다(지금 ServerCardData는 모두 never). 그때 이 파일에 그 카드의 몸을 더한다.
import type { CardState, ServerCardId } from "@terra/shared/dashboard";
import { m } from "../../paraglide/messages.js";
import type { HomeData } from "../homeData.ts";
import type { CardBodyProps } from "../homeTypes.ts";
import { HomeLoading } from "../InboxBody.tsx";

/** 카드마다 "무엇이 언제 보일지". 서버 카드가 늘면 여기서 타입 오류가 난다 */
const HINT = {
  cyborg: m.card_cyborg_empty,
  units: m.card_units_empty,
  assets: m.card_assets_empty,
  faction: m.card_faction_empty,
} satisfies Record<ServerCardId, () => string>;

function stateOf(data: HomeData, id: ServerCardId): CardState | undefined {
  return data.cards.value?.cards.find((card) => card.id === id);
}

function ServerCardBody({ id, data }: { id: ServerCardId; data: HomeData }) {
  const state = stateOf(data, id);
  if (state === undefined) {
    // 받는 중이면 한 줄, 받지 못했으면 화면 위 알림이 알린다(상태를 모르므로 "준비 중"이라고 하지 않는다)
    return data.cards.status === "loading" ? <HomeLoading /> : <p className="home-card-hint">{HINT[id]()}</p>;
  }
  return (
    <>
      {state.status === "not_ready" ? (
        <span className="home-card-status">{m.home_card_not_ready()}</span>
      ) : null}
      <p className="home-card-hint">{HINT[id]()}</p>
    </>
  );
}

export function CyborgCardBody({ data }: CardBodyProps) {
  return <ServerCardBody id="cyborg" data={data} />;
}

export function UnitsCardBody({ data }: CardBodyProps) {
  return <ServerCardBody id="units" data={data} />;
}

export function FactionCardBody({ data }: CardBodyProps) {
  return <ServerCardBody id="faction" data={data} />;
}
