// 카드 틀 — 프로 터미널 스타일: 은은한 오른쪽 위 모서리 글로우 + 왼쪽 의미색 아이콘·제목 + 오른쪽 상단 바로가기(상세 ↗).
// 누르는 영역은 44px 이상(--tap-size)을 지키며, 바로 처리 단추가 있는 몸은 링크 밖이다.
import type { RouteTarget } from "@terra/shared";
import type { CardId } from "@terra/shared/dashboard";
import { type ReactNode, useId } from "react";
import { m } from "../../paraglide/messages.js";
import { HomeLink } from "../shellParts.tsx";
import { CARD_ICONS, ExternalArrowIcon } from "./icons.tsx";

interface CardFrameProps {
  readonly id: CardId;
  readonly title: string;
  /** 머리를 누르면 갈 화면. 없으면 오른쪽 상단 링크 없음 */
  readonly to: RouteTarget | null;
  /** 오른쪽 상단 바로가기 문구(기본: "상세") */
  readonly actionLabel?: string;
  /** 제목 바로 뒤(개수 등). 제목과 함께 머리의 이름이 된다("처리할 일 7") */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}

export function CardFrame({ id, title, to, actionLabel, aside, children }: CardFrameProps) {
  const titleId = useId();
  const Icon = CARD_ICONS[id];
  return (
    <section className="home-card" data-card={id} aria-labelledby={titleId}>
      <div className="home-card-head">
        <h2 id={titleId} className="home-card-title">
          <span className="home-card-heading">
            <span className="home-card-icon" data-card-icon={id}>
              <Icon />
            </span>
            <span className="home-card-name">{title}</span>
            {aside}
          </span>
        </h2>
        {to === null ? null : (
          <HomeLink
            to={to}
            className="home-card-action home-link-button"
            aria-label={`${title} ${actionLabel ?? m.home_card_detail()}`}
          >
            <span>{actionLabel ?? m.home_card_detail()}</span>
            <ExternalArrowIcon />
          </HomeLink>
        )}
      </div>
      <div className="home-card-body">{children}</div>
    </section>
  );
}
