// 카드 틀 — 머리(아이콘 + 제목, 갈 화면이 있으면 머리 전체가 링크) + 몸. 카드는 <section>이고 제목이 이름이다.
// 머리 링크는 누르는 곳이 44px 이상이다(--tap-size). 바로 처리 단추가 있는 몸은 링크 밖이다(링크 안에 단추를 넣지 않는다).
import type { RouteTarget } from "@terra/shared";
import type { CardId } from "@terra/shared/dashboard";
import { type ReactNode, useId } from "react";
import { HomeLink } from "../shellParts.tsx";
import { CARD_ICONS, ChevronRightIcon } from "./icons.tsx";

interface CardFrameProps {
  readonly id: CardId;
  readonly title: string;
  /** 머리를 누르면 갈 화면. 없으면 머리는 글자만 */
  readonly to: RouteTarget | null;
  /** 제목 바로 뒤(개수 등). 제목과 함께 머리의 이름이 된다("처리할 일 7") */
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}

export function CardFrame({ id, title, to, aside, children }: CardFrameProps) {
  const titleId = useId();
  const Icon = CARD_ICONS[id];
  const head = (
    <>
      <span className="home-card-icon" data-card-icon={id}>
        <Icon />
      </span>
      <span className="home-card-name">{title}</span>
      {aside}
    </>
  );
  return (
    <section className="home-card" data-card={id} aria-labelledby={titleId}>
      <div className="home-card-head">
        <h2 id={titleId} className="home-card-title">
          {to === null ? (
            <span className="home-card-heading">{head}</span>
          ) : (
            <HomeLink to={to} className="home-card-heading home-card-link">
              {head}
              <ChevronRightIcon />
            </HomeLink>
          )}
        </h2>
      </div>
      <div className="home-card-body">{children}</div>
    </section>
  );
}
