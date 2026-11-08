// 준비 중 화면 — 유닛·세력·사이보그·우편(경제는 화면이 붙었다, economy/EconomyScreen.tsx)(그 화면을 만들 때까지, ADR 2026-10-29-app-shell 1절 "지금").
// 행성 편집기는 화면이 붙었다(ADR 2026-10-29-planet-editor-stage1 WP-D). 잠그지 않고 무엇이 올지만 말한다(빈 카드 문구와
// 같은 원칙, 내부 단계 이름은 쓰지 않는다). 지연 로딩 조각 하나다(routeViews.tsx). 준비 중 주소는 모두 틀 안 화면이다.
import type { RouteId, RouteMatch } from "@terra/shared";
import { m } from "../paraglide/messages.js";
import { BackButton } from "../shell/BackButton.tsx";
import { Icon, type IconName } from "../ui/icons.tsx";
import "./sections.css";

interface Section {
  readonly title: () => string;
  /** 한 줄 설명(메뉴 항목의 설명과 같다). 없으면 그리지 않는다 */
  readonly desc?: () => string;
  readonly icon: IconName;
}

/** 준비 중으로 여는 화면(routeViews.tsx가 이 조각으로 보내는 주소) */
type ComingSoonRoute = Exclude<
  RouteId,
  | "home"
  | "map"
  | "map_planet"
  | "settings"
  | "admin"
  | "ops"
  | "dev_ops_grants"
  | "inbox"
  | "start"
  | "dev"
  | "dev_gpu_bench"
  | "dev_planet_editor"
  | "dev_star_system"
  | "dev_second_map"
  | "dev_tuning"
  | "dev_balance"
  | "dev_skills"
  | "dev_items"
  | "dev_buildings"
  | "dev_creatures"
  | "dev_territory"
  | "dev_recruit"
  | "dev_battle_replay"
  | "economy"
  | "economy_warehouse"
  | "economy_production"
  | "economy_market"
  | "economy_market_item"
  | "economy_market_city"
  | "economy_orders"
  | "economy_exchange"
  | "cyborg_ranking"
  | "faction_ranking"
>;

const SECTIONS = {
  units: { title: m.nav_units, desc: m.nav_units_desc, icon: "units" },
  faction: { title: m.nav_faction, desc: m.nav_faction_desc, icon: "faction" },
  cyborg: { title: m.nav_cyborg, desc: m.nav_cyborg_desc, icon: "cyborg" },
  mail: { title: m.shell_mail, icon: "mail" },
} satisfies Record<ComingSoonRoute, Section>;

function isComingSoonRoute(id: RouteId): id is ComingSoonRoute {
  return Object.hasOwn(SECTIONS, id);
}

export default function ComingSoon({ match }: { match: RouteMatch }) {
  if (!isComingSoonRoute(match.id)) return null;
  const section: Section = SECTIONS[match.id];
  const titleId = `coming-soon-${match.id}`;
  return (
    <section className="screen" aria-labelledby={titleId}>
      <div className="screen-header">
        <h1 id={titleId} className="screen-title" tabIndex={-1}>
          {section.title()}
        </h1>
        <BackButton />
      </div>
      <div className="panel coming-soon">
        <span className="coming-soon-mark" aria-hidden="true">
          <Icon name={section.icon} />
        </span>
        <p className="coming-soon-title">{m.shell_coming_soon()}</p>
        {section.desc ? <p className="coming-soon-desc">{section.desc()}</p> : null}
        <p className="lead">{m.shell_coming_soon_body()}</p>
      </div>
    </section>
  );
}
