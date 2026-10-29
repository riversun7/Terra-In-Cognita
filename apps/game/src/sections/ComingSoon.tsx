// 준비 중 화면 — 유닛·경제·세력·사이보그·우편과(그 화면을 만들 때까지) 처리함·개발자 영역(ADR 2026-10-29-app-shell 1절 "지금",
// ADR 2026-10-29-planet-editor-stage1 1절). 잠그지 않고 무엇이 올지만 말한다(빈 카드 문구와 같은 원칙, 내부 단계 이름은 쓰지 않는다).
// 지연 로딩 조각 하나다(routeViews.tsx). 틀을 숨기는 주소(행성 편집기)면 화면 전체 쪽으로 그린다.
import { ROUTES, type RouteId, type RouteMatch } from "@terra/shared";
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
type ComingSoonRoute = Exclude<RouteId, "home" | "map" | "map_planet" | "settings" | "admin">;

const SECTIONS = {
  units: { title: m.nav_units, desc: m.nav_units_desc, icon: "units" },
  economy: { title: m.nav_economy, desc: m.nav_economy_desc, icon: "economy" },
  faction: { title: m.nav_faction, desc: m.nav_faction_desc, icon: "faction" },
  cyborg: { title: m.nav_cyborg, desc: m.nav_cyborg_desc, icon: "cyborg" },
  inbox: { title: m.shell_route_inbox, icon: "bell" },
  mail: { title: m.shell_mail, icon: "mail" },
  dev: { title: m.shell_dev, icon: "dev" },
  dev_planet_editor: { title: m.shell_route_dev_planet_editor, icon: "globe" },
  dev_gpu_bench: { title: m.shell_route_dev_gpu_bench, icon: "dev" },
} satisfies Record<ComingSoonRoute, Section>;

function isComingSoonRoute(id: RouteId): id is ComingSoonRoute {
  return Object.hasOwn(SECTIONS, id);
}

export default function ComingSoon({ match }: { match: RouteMatch }) {
  if (!isComingSoonRoute(match.id)) return null;
  const section: Section = SECTIONS[match.id];
  const titleId = `coming-soon-${match.id}`;
  // 틀을 숨기는 주소(행성 편집기): 위 띠·탭이 없으니 화면 가장자리 여백을 이 화면이 둔다
  const bare = ROUTES[match.id].frame === "hidden";
  return (
    <section className={bare ? "screen page" : "screen"} aria-labelledby={titleId}>
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
