// 위 띠(40px 컴팩트 규격) — 왼쪽: 브랜드 이름표(태블릿 중간 폭은 앞에 ☰ 레일 토글).
// 오른쪽: 사이보그 초상(→ 유닛 창의 본체 줄 /units?unit=self), 알림 종(→ /inbox), 우편(→ /mail), 모바일 좁은 폭은 맨 오른쪽에 ☰ 드롭다운 단추.
import type { CharacterLook } from "@terra/shared/characterLook";
import { Suspense, lazy } from "react";
import { useInboxBellCount } from "../inbox/store.ts";
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { SignatureIcon } from "../ui/SignatureIcon.tsx";
import { AppLink } from "./AppLink.tsx";
import { CountBadge } from "./CountBadge.tsx";
import { type DevTheme, setDevTheme } from "./devSurface.ts";
import { SIDE_NAV_ID } from "./SideMenu.tsx";

const TopBarFace = lazy(() => import("./TopBarFace.tsx"));

interface TopBarProps {
  /** ☰를 눌렀을 때(서랍 열기 또는 레일 펴기·접기는 Shell이 폭 단계로 정한다) */
  onMenu: () => void;
  /** 중간 폭 레일이 펼쳐졌는지(☰의 aria-expanded). 좁은 폭(서랍)이면 null */
  railExpanded: boolean | null;
  /** 지금 화면 주소 ID(위 띠 단추의 aria-current) */
  current: string | null;
  /** 개발 화면 층의 테마(개발·관리자 화면일 때만). null이면 테마 단추를 그리지 않는다 */
  devTheme?: DevTheme | null;
  /** 내 사이보그의 3D 외형(얼굴 초상). 없으면 기본 실루엣 */
  look?: CharacterLook | null;
}

export function TopBar({ onMenu, railExpanded, current, devTheme = null, look = null }: TopBarProps) {
  const alerts = useInboxBellCount();
  const rail = railExpanded !== null;
  const menuButton = (
    <button
      type="button"
      className="topbar-button topbar-menu"
      onClick={onMenu}
      aria-label={rail ? m.shell_menu() : m.shell_menu_open()}
      aria-expanded={railExpanded ?? undefined}
      aria-controls={rail ? SIDE_NAV_ID : undefined}
      aria-haspopup={rail ? undefined : "dialog"}
    >
      <Icon name="menu" />
    </button>
  );

  return (
    <div className="topbar">
      {rail ? menuButton : null}
      <AppLink to={{ route: "home" }} className="topbar-brand" tabIndex={-1}>
        <img className="topbar-brand-mark" src="/favicon.svg" alt="" width="64" height="64" />
        <span className="topbar-brand-title" translate="no">
          TERRA IN-COGNITA
        </span>
      </AppLink>
      <span className="topbar-spacer" />
      {devTheme === null ? null : (
        <button
          type="button"
          className="button-small topbar-dev-theme"
          aria-pressed={devTheme === "light"}
          title={m.dev_surface_theme_hint()}
          onClick={() => setDevTheme(devTheme === "light" ? "neon" : "light")}
        >
          {m.dev_surface_theme_light()}
        </button>
      )}
      <AppLink
        to={{ route: "units", search: { unit: "self" } }}
        className="topbar-face"
        aria-label={m.shell_cyborg_face()}
      >
        <span className="topbar-face-ring">
          {look === null ? (
            <SignatureIcon name="cyborg" className="topbar-face-fallback" />
          ) : (
            <Suspense fallback={<SignatureIcon name="cyborg" className="topbar-face-fallback" />}>
              <TopBarFace look={look} />
            </Suspense>
          )}
        </span>
      </AppLink>
      <AppLink
        to={{ route: "inbox" }}
        className="topbar-button"
        aria-label={alerts > 0 ? m.shell_alerts_count({ count: alerts }) : m.shell_alerts()}
        aria-current={current === "inbox" ? "page" : undefined}
      >
        <Icon name="bell" />
        <CountBadge count={alerts} />
      </AppLink>
      <AppLink
        to={{ route: "mail" }}
        className="topbar-button"
        aria-label={m.shell_mail()}
        aria-current={current === "mail" ? "page" : undefined}
      >
        <Icon name="mail" />
      </AppLink>
      {rail ? null : menuButton}
    </div>
  );
}
