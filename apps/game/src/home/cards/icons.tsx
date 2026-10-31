// 홈 아이콘 — 인라인 SVG(아이콘 꾸러미 없음, ADR 2026-10-29-app-shell 11절). 꾸밈이라 읽기 프로그램에는 숨긴다(이름은 옆 글자가 알린다).
// 글자와 같은 색(currentColor)이고 크기는 home.css의 .home-icon(--icon-md)이다. 좌표는 소수 한 자리까지만 쓴다.
// 처리할 일 분류 아이콘(CategoryIcon)은 화면 틀 아이콘(ui/icons.tsx, 분류 ID와 같은 이름, 모르는 분류는 bell)을 쓴다:
// 처리함 화면(inbox/InboxList.tsx)과 같은 그림이다.
import type { CardId } from "@terra/shared/dashboard";
import type { ReactNode } from "react";
import { isKnownCategory } from "../inboxParts.ts";
import { Icon as ShellIcon } from "../../ui/icons.tsx";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="home-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** 처리할 일(받침 위 할 일 목록) */
export function InboxIcon() {
  return (
    <Icon>
      <rect x="5" y="4" width="14" height="17" rx="3" />
      <path d="M9 4.5h6M8.5 12.5l2.3 2.3 4.7-5" />
    </Icon>
  );
}

/** 사이보그(얼굴) — 위 띠의 얼굴과 같은 뜻 */
export function CyborgIcon() {
  return (
    <Icon>
      <rect x="5" y="7" width="14" height="12" rx="4" />
      <path d="M12 3.5V7M9.5 16h5" />
      <path d="M9.5 12.5h.01M14.5 12.5h.01" strokeWidth={2.6} />
    </Icon>
  );
}

export function UnitsIcon() {
  return (
    <Icon>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M16 14.3c2.4-.2 4.1 1.4 4.6 4.2" />
    </Icon>
  );
}

export function AssetsIcon() {
  return (
    <Icon>
      <ellipse cx="12" cy="6.8" rx="6.5" ry="2.8" />
      <path d="M5.5 6.8v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-5" />
      <path d="M5.5 11.8v5c0 1.5 2.9 2.8 6.5 2.8s6.5-1.3 6.5-2.8v-5" />
    </Icon>
  );
}

export function FactionIcon() {
  return (
    <Icon>
      <path d="M6 21V4M6 5h11l-2.5 4 2.5 4H6" />
    </Icon>
  );
}

export function TimelineIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function BriefingIcon() {
  return (
    <Icon>
      <path d="M4.5 6.8A2.8 2.8 0 0 1 7.3 4h9.4a2.8 2.8 0 0 1 2.8 2.8v6.4a2.8 2.8 0 0 1-2.8 2.8H11l-4.5 3.5V16a2.8 2.8 0 0 1-2-2.7z" />
      <path d="M8.5 9h7M8.5 12.5H13" />
    </Icon>
  );
}

export function MapsIcon() {
  return (
    <Icon>
      <path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </Icon>
  );
}

export function DiagnosticsIcon() {
  return (
    <Icon>
      <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
    </Icon>
  );
}

/** 카드 머리 아이콘. 카드가 늘면 여기서 타입 오류가 난다 */
export const CARD_ICONS = {
  inbox: InboxIcon,
  cyborg: CyborgIcon,
  units: UnitsIcon,
  assets: AssetsIcon,
  faction: FactionIcon,
  timeline: TimelineIcon,
  briefing: BriefingIcon,
  maps: MapsIcon,
  diagnostics: DiagnosticsIcon,
} satisfies Record<CardId, () => ReactNode>;

export function PencilIcon() {
  return (
    <Icon>
      <path d="M4.5 19.5 5.5 15 15.5 5a2.1 2.1 0 0 1 3 3l-10 10z" />
      <path d="M13.5 7l3 3" />
    </Icon>
  );
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </Icon>
  );
}

export function ChevronRightIcon() {
  return (
    <Icon>
      <path d="M9.5 6l6 6-6 6" />
    </Icon>
  );
}

export function ChevronDownIcon() {
  return (
    <Icon>
      <path d="M6 9.5l6 6 6-6" />
    </Icon>
  );
}

export function ArrowUpIcon() {
  return (
    <Icon>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Icon>
  );
}

export function ArrowDownIcon() {
  return (
    <Icon>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </Icon>
  );
}

export function ToTopIcon() {
  return (
    <Icon>
      <path d="M5 4.5h14M12 20V9M6.5 14.5 12 9l5.5 5.5" />
    </Icon>
  );
}

export function RemoveIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 12h8" />
    </Icon>
  );
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

/** 끌어 옮기기 손잡이(점 여섯) */
export function GripIcon() {
  return (
    <Icon>
      <path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" strokeWidth={3} />
    </Icon>
  );
}

/** 부관(이름 없는 기본 모습) */
export function AideIcon() {
  return (
    <Icon>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6" />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <Icon>
      <path d="M5.5 12.5l4 4 9-9" />
    </Icon>
  );
}

/**
 * 처리할 일 분류 아이콘. 분류는 늘 아이콘 + 이름과 함께 보인다(색만으로 알리지 않는다).
 * 받은 값은 글자로 받는다: 분류는 닫힌 목록이지만 더 새 서버가 모르는 분류를 보낼 수 있다 → 종(그 밖의 알림 묶음도 같다)
 */
export function CategoryIcon({ category }: { category: string }) {
  return <ShellIcon name={isKnownCategory(category) ? category : "bell"} className="home-icon" />;
}
