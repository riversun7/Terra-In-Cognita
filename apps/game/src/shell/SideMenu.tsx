// 사이드 메뉴(D-6004·D-6010·D-265, ADR 2026-10-29-app-shell 3절, 시스템 묶음은 ADR 2026-10-29-planet-editor-stage1 1절).
// - 머리: 앱 이름표, 로그인한 아이디(아이디는 여기에만 보인다).
// - 메뉴 항목 6개: 메뉴 순서 그대로, 늘 모두(하단 탭에 있는 것도). 지도 밑에 작은 1차맵 [임시] 링크.
// - [메뉴 편집]: 설정의 "메뉴" 칸으로 간다.
// - 시스템 묶음: 설정 · 개발자(dev·admin) · 관리자(admin) · 로그아웃. 하단 탭과 메뉴 편집 목록에는 넣지 않는다.
//   화면에서 가리는 것은 편의다. 서버가 매 요청 권한을 본다.
// 같은 내용을 두 곳에 그린다: 좁은 폭의 서랍(Drawer, <dialog>)과 중간·넓음 폭의 레일·사이드 메뉴(Shell의 <nav>).
import type { AccountView, NavItemId, NavigationSettings, RouteId, RouteTarget } from "@terra/shared";
import { navMenuItems } from "@terra/shared";
import { type ReactNode, useState } from "react";
import { signOut } from "../auth/session.ts";
import { m } from "../paraglide/messages.js";
import { Brand } from "../ui/Brand.tsx";
import { Icon, type IconName } from "../ui/icons.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { AppLink } from "./AppLink.tsx";
import { CountBadge } from "./CountBadge.tsx";
import { MENU_ITEMS } from "./menuItems.ts";
import type { MenuBadges } from "./TabBar.tsx";

/** 설정 화면 "메뉴" 칸의 id — [메뉴 편집]이 옮긴 뒤 이 칸에 초점을 둔다(NavigationSettings.tsx) */
export const NAV_SETTINGS_ID = "nav-settings";

/** 레일·사이드 메뉴(Shell의 <nav>) id — 중간 폭 위 띠 ☰의 aria-controls(TopBar.tsx) */
export const SIDE_NAV_ID = "side-nav";

interface SideLinkProps {
  to: RouteTarget;
  icon: IconName;
  name: string;
  desc?: string | undefined;
  current: boolean;
  badge?: number;
  /** 접은 레일에서는 숨기는 줄(작은 링크) */
  sub?: boolean;
}

function SideLink({ to, icon, name, desc, current, badge = 0, sub = false }: SideLinkProps) {
  return (
    <AppLink
      to={to}
      className={sub ? "side-item side-sub" : "side-item"}
      aria-current={current ? "page" : undefined}
      aria-label={badge > 0 ? m.shell_item_alerts({ name, count: badge }) : undefined}
    >
      <span className="side-icon">
        <Icon name={icon} />
      </span>
      <span className="side-text">
        <span className="side-name">{name}</span>
        {desc === undefined ? null : <span className="side-desc">{desc}</span>}
      </span>
      <CountBadge count={badge} />
    </AppLink>
  );
}

function SignOutButton() {
  const [pending, setPending] = useState(false);
  const failure = useLiveLines();

  async function handleSignOut(): Promise<void> {
    if (pending) return;
    setPending(true);
    const ok = await signOut();
    // 성공하면 App이 홈 주소로 바꾸고 로그인 화면을 그리며 이 메뉴를 내린다
    if (!ok) {
      setPending(false);
      failure.show([m.account_sign_out_failed()]);
    }
  }

  return (
    <>
      <button
        type="button"
        className="side-item side-button"
        onClick={() => void handleSignOut()}
        aria-disabled={pending}
      >
        <span className="side-icon">
          <Icon name="logout" />
        </span>
        <span className="side-text">
          <span className="side-name">{m.account_sign_out()}</span>
        </span>
      </button>
      <LiveMessage tone="error" lines={failure.lines} version={failure.version} className="side-message" />
    </>
  );
}

interface SideMenuProps {
  variant: "drawer" | "side";
  user: AccountView;
  nav: NavigationSettings;
  current: RouteId | null;
  badges: MenuBadges;
  /** 서랍의 닫기 단추 */
  onClose?: () => void;
}

export function SideMenu({ variant, user, nav, current, badges, onClose }: SideMenuProps) {
  const dev = user.roles.includes("dev") || user.roles.includes("admin");
  const admin = user.roles.includes("admin");
  const item = (id: NavItemId): ReactNode => {
    const entry = MENU_ITEMS[id];
    return (
      <li key={id}>
        <SideLink
          to={entry.target}
          icon={entry.icon}
          name={entry.name()}
          desc={entry.desc()}
          current={current === entry.target.route}
          badge={badges[id] ?? 0}
        />
        {/* [임시] 1차맵 시험 화면 — 지도 안 전환(6-3)이 생기면 지운다(ADR 37 3절) */}
        {id === "map" ? (
          <SideLink
            to={{ route: "map_planet" }}
            icon="globe"
            name={m.planet_title()}
            current={current === "map_planet"}
            sub
          />
        ) : null}
      </li>
    );
  };
  return (
    <div className="side" data-variant={variant}>
      <div className="side-head">
        <Brand size="small" />
        {variant === "drawer" ? (
          <button type="button" className="side-close" onClick={onClose} aria-label={m.shell_menu_close()}>
            <Icon name="close" />
          </button>
        ) : null}
        <p className="side-account" translate="no">
          <span className="visually-hidden">{m.account_id_label()} </span>
          {user.loginId}
        </p>
      </div>
      <ul className="side-list">{navMenuItems(nav).map(item)}</ul>
      <AppLink to={{ route: "settings" }} focusId={NAV_SETTINGS_ID} className="side-edit">
        {m.shell_menu_edit()}
      </AppLink>
      <ul className="side-list side-system" aria-label={m.shell_system_group()}>
        <li>
          <SideLink
            to={{ route: "settings" }}
            icon="settings"
            name={m.account_settings()}
            current={current === "settings"}
          />
        </li>
        {dev ? (
          <li>
            <SideLink
              to={{ route: "dev" }}
              icon="dev"
              name={m.shell_dev()}
              current={current === "dev" || current === "dev_planet_editor" || current === "dev_gpu_bench"}
            />
          </li>
        ) : null}
        {admin ? (
          <li>
            <SideLink
              to={{ route: "admin" }}
              icon="admin"
              name={m.account_admin()}
              current={current === "admin"}
            />
          </li>
        ) : null}
        <li>
          <SignOutButton />
        </li>
      </ul>
    </div>
  );
}
