// 카드 격자 — 저장한 순서 = 보이는 순서 = 초점 순서(DOM 순서). grid-auto-flow: dense를 쓰지 않는다(빈칸이 생겨도, ADR 2026-10-29-app-shell 6절).
// 열 수는 폭에 따라 늘어난다(D-6003 "넓으면 카드 열을 늘린다"). 320px 폭에서도 2열이다(--card-min, home.css).
// strip: 처리함 템플릿의 "아래 요약 카드 한 줄" — 가로로 넘기는 한 줄(화면 전체는 가로로 넘치지 않는다).
import { m } from "../paraglide/messages.js";
import { HomeCard } from "./cards/registry.tsx";
import type { TemplateProps } from "./homeTypes.ts";

interface CardGridProps extends TemplateProps {
  readonly variant?: "grid" | "strip";
}

export function CardGrid({ cards, variant = "grid", ...view }: CardGridProps) {
  if (cards.length === 0) return null;
  const list = (
    <ul className={variant === "strip" ? "home-strip" : "home-grid"}>
      {cards.map((card) => (
        <li key={card.id} className="home-cell" data-size={card.size}>
          <HomeCard card={card} {...view} />
        </li>
      ))}
    </ul>
  );
  // 가로로 넘기는 줄: 카드 머리 링크로 초점이 옮겨 가면 브라우저가 그 카드까지 넘겨 보인다
  return variant === "strip" ? (
    <section className="home-strip-region" aria-label={m.home_strip_label()}>
      {list}
    </section>
  ) : (
    list
  );
}
