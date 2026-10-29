// 위 띠(D-6010, ADR 2026-10-29-app-shell 3절) — 본문 위에 붙는다(중간·넓음에서는 사이드 메뉴 오른쪽).
// 왼쪽: [☰](좁음 + 배치 C는 서랍 열기, 중간은 레일 펴기·접기, 넓음·좁음 + 배치 A에는 없다 — CSS), 사이보그 얼굴(→ /cyborg).
// 오른쪽: 알림 종(배지, → /inbox), 우편(→ /mail). 사이보그가 없어서 얼굴은 기본 실루엣이다. 아이디는 사이드 메뉴 머리에만 보인다.
// 아이콘만 있는 단추라 이름은 aria-label로 준다(배지는 숫자만 두지 않는다: "알림 3개").
import { m } from "../paraglide/messages.js";
import { Icon } from "../ui/icons.tsx";
import { AppLink } from "./AppLink.tsx";
import { CountBadge } from "./CountBadge.tsx";

/**
 * 종 배지 수(완료를 뺀 처리할 일 줄 수, 묶음은 1줄 — ADR 37 7절). 0이면 배지를 그리지 않는다.
 * 꽂는 줄(W3): 이 줄을 처리할 일 저장소의 훅(inbox/store.ts)으로 바꾼다. 그 전에는 처리할 일이 없다
 */
const useAlertCount = (): number => 0;

interface TopBarProps {
  /** ☰를 눌렀을 때(서랍 열기 또는 레일 펴기·접기는 Shell이 폭 단계로 정한다) */
  onMenu: () => void;
  /** 중간 폭 레일이 펼쳐졌는지(☰의 aria-expanded). 좁은 폭(서랍)이면 null */
  railExpanded: boolean | null;
  /** 지금 화면 주소 ID(위 띠 단추의 aria-current) */
  current: string | null;
}

export function TopBar({ onMenu, railExpanded, current }: TopBarProps) {
  const alerts = useAlertCount();
  const menuLabel =
    railExpanded === null
      ? m.shell_menu_open()
      : railExpanded
        ? m.shell_rail_collapse()
        : m.shell_rail_expand();
  return (
    <div className="topbar">
      <button
        type="button"
        className="topbar-button topbar-menu"
        onClick={onMenu}
        aria-label={menuLabel}
        aria-expanded={railExpanded ?? undefined}
        aria-haspopup={railExpanded === null ? "dialog" : undefined}
      >
        <Icon name="menu" />
      </button>
      <AppLink
        to={{ route: "cyborg" }}
        className="topbar-face"
        aria-label={m.shell_cyborg_face()}
        aria-current={current === "cyborg" ? "page" : undefined}
      >
        <span className="topbar-face-ring">
          <Icon name="cyborg" />
        </span>
      </AppLink>
      <span className="topbar-spacer" />
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
    </div>
  );
}
