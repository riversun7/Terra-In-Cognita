// 생산 편집기 탭 아이콘 — 인라인 SVG(아이콘 꾸러미 없음), editor/devIcons.tsx와 같은 둥근 선. 글자와 같은 색, 크기는 CSS(.pd-icon).
// 꾸밈이라 읽기 프로그램에 숨긴다(탭 이름이 글자로 있다).
import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className="pd-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const TreeIcon = () => (
  <Icon>
    <path d="M12 3 6 11h3l-4 6h14l-4-6h3z" />
    <path d="M12 17v4" />
  </Icon>
);
const PickIcon = () => (
  <Icon>
    <path d="M4 8c5-4 11-4 16 0" />
    <path d="M12 6 6 20" />
  </Icon>
);
const LeafIcon = () => (
  <Icon>
    <path d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14z" />
    <path d="M5 19 14 10" />
  </Icon>
);
const WheatIcon = () => (
  <Icon>
    <path d="M12 21V8" />
    <path d="M12 8c-2-1-3-3-3-5 2 1 3 3 3 5zm0 0c2-1 3-3 3-5-2 1-3 3-3 5z" />
    <path d="M12 13c-2 0-4-1-5-3 2 0 4 1 5 3zm0 0c2 0 4-1 5-3-2 0-4 1-5 3z" />
    <path d="M12 18c-2 0-4-1-5-3 2 0 4 1 5 3zm0 0c2 0 4-1 5-3-2 0-4 1-5 3z" />
  </Icon>
);
const BarnIcon = () => (
  <Icon>
    <path d="M4 20V10l8-6 8 6v10z" />
    <path d="M9 20v-6h6v6" />
    <path d="m9 14 6 6m0-6-6 6" />
  </Icon>
);
const FishIcon = () => (
  <Icon>
    <path d="M3 12c3-5 9-6 14-2l4-3v10l-4-3c-5 4-11 3-14-2z" />
    <path d="M8 11v.01" />
  </Icon>
);
const AnvilIcon = () => (
  <Icon>
    <path d="M4 8h12c0 3 2 4 5 4-2 2-5 2-7 2v3h3v3H7v-3h3v-3c-3 0-6-2-6-6z" />
  </Icon>
);
const ChartIcon = () => (
  <Icon>
    <path d="M4 20V4" />
    <path d="M4 20h16" />
    <path d="M8 16v-5m4 5V8m4 8v-3" />
  </Icon>
);
const LinkIcon = () => (
  <Icon>
    <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1" />
    <path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1" />
  </Icon>
);
const SwordIcon = () => (
  <Icon>
    <path d="M14 4h6v6L9 21l-3-3z" />
    <path d="m5 14 5 5" />
    <path d="m4 20 3-3" />
  </Icon>
);
const TableIcon = () => (
  <Icon>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 10h18M3 15h18M9 5v14" />
  </Icon>
);

/** 시설 ID → 아이콘(모르는 시설은 묶음 아이콘) */
export function facilityIcon(id: string, kind: "type" | "process"): ReactNode {
  switch (id) {
    case "lumber_camp":
      return <TreeIcon />;
    case "mine":
      return <PickIcon />;
    case "herb_field":
      return <LeafIcon />;
    case "farm":
      return <WheatIcon />;
    case "ranch":
      return <BarnIcon />;
    case "fishing_spot":
      return <FishIcon />;
    default:
      return kind === "process" ? <AnvilIcon /> : <LeafIcon />;
  }
}

export const COMMON_ICON = {
  tiers: <ChartIcon />,
  mapping: <LinkIcon />,
  classes: <SwordIcon />,
  overview: <TableIcon />,
} as const;
