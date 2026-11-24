// 사이드 메뉴 & 모바일 우측 ☰ 드롭다운(컴팩트 216px 규격, 컬러 시그니처 아이콘 적용).
// - 머리: 브랜드 마크 + 로그인 아이디(모바일 드롭다운은 오른쪽에 닫기 단추).
// - 주 메뉴 항목 7개(유저 설정 순서 그대로) + 지도 밑 1차 행성지도 링크.
// - 시스템 묶음: 처리함 · 우편함 · 메뉴 편집 · 설정 · 개발자(dev·admin) · 관리자(admin) · 운영(ops) · 로그아웃.
import type { AccountView, NavItemId, NavigationSettings, RouteId, RouteTarget } from "@terra/shared";
import { canOpenRoute, navMenuItems } from "@terra/shared";
import { type ReactNode, useState } from "react";
import { signOut } from "../auth/session.ts";
import { useInboxBellCount } from "../inbox/store.ts";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { LiveMessage, useLiveLines } from "../ui/LiveMessage.tsx";
import { SignatureIcon, type SignatureIconName } from "../ui/SignatureIcon.tsx";
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
  icon: SignatureIconName;
  name: string;
  current: boolean;
  badge?: number;
  /** 접은 레일에서는 숨기는 줄(작은 링크) */
  sub?: boolean;
}

function SideLink({ to, icon, name, current, badge = 0, sub = false }: SideLinkProps) {
  return (
    <AppLink
      to={to}
      className={sub ? "side-item side-sub" : "side-item"}
      aria-current={current ? "page" : undefined}
      aria-label={badge > 0 ? m.shell_item_alerts({ name, count: badge }) : undefined}
    >
      <span className="side-icon">
        <SignatureIcon name={icon} />
      </span>
      <span className="side-text">
        <span className="side-name">{name}</span>
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
    if (!ok) {
      setPending(false);
      failure.show([m.account_sign_out_failed()]);
    }
  }

  return (
    <>
      <button
        type="button"
        className="side-item side-button side-logout"
        onClick={() => void handleSignOut()}
        aria-disabled={pending}
      >
        <span className="side-icon">
          <SignatureIcon name="logout" />
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
  const dev = canOpenRoute("dev", user.roles);
  const admin = canOpenRoute("admin", user.roles);
  const ops = canOpenRoute("ops", user.roles);
  const inboxAlerts = useInboxBellCount();

  const item = (id: NavItemId): ReactNode => {
    const entry = MENU_ITEMS[id];
    if (id === "map") {
      return (
        <li key={id} className="side-map-row">
          <div className="side-split">
            <AppLink
              to={entry.target}
              className="side-item side-split-item"
              aria-current={current === "map" ? "page" : undefined}
            >
              <span className="side-icon">
                <SignatureIcon name="map" />
              </span>
              <span className="side-text">
                <span className="side-name">{m.shell_map_to_local()}</span>
              </span>
            </AppLink>
            <AppLink
              to={{ route: "map_planet" }}
              className="side-item side-split-item side-split-planet"
              aria-current={current === "map_planet" ? "page" : undefined}
            >
              <span className="side-icon">
                <SignatureIcon name="globe" />
              </span>
              <span className="side-text">
                <span className="side-name">{m.shell_map_to_planet()}</span>
              </span>
            </AppLink>
          </div>
        </li>
      );
    }
    return (
      <li key={id}>
        <SideLink
          to={entry.target}
          icon={entry.icon}
          name={entry.name()}
          current={current === entry.target.route}
          badge={badges[id] ?? 0}
        />
      </li>
    );
  };

  return (
    <div className="side" data-variant={variant}>
      <div className="side-head">
        <span className="side-brand">
          <img className="side-brand-mark" src="/favicon.svg" alt="" width="64" height="64" />
          <span className="side-brand-title" translate="no">
            TERRA IN-COGNITA
          </span>
        </span>
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
        <SignatureIcon name="edit" className="side-edit-ico" />
        <span>{m.shell_menu_edit()}</span>
      </AppLink>
      <ul className="side-list side-system" aria-label={m.shell_system_group()}>
        <li>
          <SideLink
            to={{ route: "inbox" }}
            icon="inbox"
            name={m.shell_route_inbox()}
            current={current === "inbox"}
            badge={inboxAlerts}
          />
        </li>
        <li>
          <SideLink to={{ route: "mail" }} icon="mail" name={m.shell_mail()} current={current === "mail"} />
        </li>
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
              current={
                current === "dev" ||
                current === "dev_planet_editor" ||
                current === "dev_star_system" ||
                current === "dev_second_map" ||
                current === "dev_terrain_objects" ||
                current === "dev_gpu_bench"
              }
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
        {ops ? (
          <li>
            <SideLink to={{ route: "ops" }} icon="ops" name={m.ops_title()} current={current === "ops"} />
          </li>
        ) : null}
        <li>
          <SignOutButton />
        </li>
      </ul>
    </div>
  );
}
