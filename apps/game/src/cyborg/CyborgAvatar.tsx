// 사이보그 2D 얼굴·몸 그림 — 외형 = 부위 ID 넷 + 색 둘(D-6040, @terra/shared/cyborg). docs/adr/2026-11-01-first-login-cyborg.md 1절.
// [임시] 3D 모델이 생기기 전까지 쓰는 그림이다(질문 172 → D-445). 3~4등신 파스텔(D-064·D-065) 느낌으로 머리를 크게 그린다.
// - 칠 색은 세계의 색이라 테마와 상관없다(목록 값). 테두리만 화면 글자 색(currentColor)이라 테마 대비를 따른다.
// - 모르는 ID(더 새 서버)는 그 칸의 첫 부위로 그린다. 그림은 꾸밈이라 aria-hidden이 기본이고, 이름은 부르는 쪽이 붙인다.
// - variant "face"는 머리만(위 띠·작은 자리), "full"은 몸까지(만들기 화면·사이보그 화면).
import { CYBORG_COLORS, type CyborgAppearance } from "@terra/shared/cyborg";

interface CyborgAvatarProps {
  readonly look: CyborgAppearance;
  readonly variant?: "face" | "full";
  readonly className?: string;
  /** 읽는 이름. 없으면 꾸밈(aria-hidden) */
  readonly label?: string;
}

const STROKE = 3;

function color(id: string): string {
  const found = Object.entries(CYBORG_COLORS).find(([key]) => key === id);
  return found ? found[1] : CYBORG_COLORS.mint;
}

/** 머리 윗부분(머리통은 공통 원, 부위가 위에 얹힌다) */
function Head({ id, fill, accent }: { id: string; fill: string; accent: string }) {
  switch (id) {
    case "antenna":
      return (
        <>
          <line x1="60" y1="14" x2="60" y2="2" strokeWidth={STROKE} />
          <circle cx="60" cy="4" r="5" fill={accent} />
          <circle cx="60" cy="42" r="30" fill={fill} />
        </>
      );
    case "crest":
      return (
        <>
          <path d="M44 18 L60 0 L76 18 Z" fill={accent} />
          <circle cx="60" cy="42" r="30" fill={fill} />
        </>
      );
    case "helm":
      return <rect x="28" y="12" width="64" height="58" rx="16" fill={fill} />;
    default:
      // dome: 둥근 투구에 띠 하나
      return (
        <>
          <circle cx="60" cy="42" r="30" fill={fill} />
          <path d="M31 36 Q60 14 89 36" fill="none" strokeWidth={STROKE} />
        </>
      );
  }
}

function Face({ id, accent }: { id: string; accent: string }) {
  switch (id) {
    case "eyes":
      return (
        <>
          <circle cx="49" cy="44" r="6" fill={accent} />
          <circle cx="71" cy="44" r="6" fill={accent} />
        </>
      );
    case "mono":
      return <circle cx="60" cy="44" r="10" fill={accent} />;
    case "grill":
      return (
        <>
          <circle cx="50" cy="38" r="4" fill={accent} />
          <circle cx="70" cy="38" r="4" fill={accent} />
          <rect x="46" y="48" width="28" height="10" rx="3" fill="none" strokeWidth={STROKE - 1} />
          <line x1="55" y1="48" x2="55" y2="58" strokeWidth={STROKE - 1} />
          <line x1="65" y1="48" x2="65" y2="58" strokeWidth={STROKE - 1} />
        </>
      );
    default:
      // visor: 가로 띠 눈가리개
      return <rect x="38" y="36" width="44" height="14" rx="7" fill={accent} />;
  }
}

function Body({ id, fill, accent }: { id: string; fill: string; accent: string }) {
  switch (id) {
    case "plate":
      return <rect x="36" y="74" width="48" height="38" rx="10" fill={fill} />;
    case "slim":
      return <rect x="44" y="74" width="32" height="40" rx="14" fill={fill} />;
    case "core":
      return (
        <>
          <rect x="38" y="74" width="44" height="38" rx="14" fill={fill} />
          <circle cx="60" cy="92" r="7" fill={accent} />
        </>
      );
    default:
      // round
      return <ellipse cx="60" cy="94" rx="25" ry="21" fill={fill} />;
  }
}

function Limbs({ id, fill, accent }: { id: string; fill: string; accent: string }) {
  switch (id) {
    case "piston":
      return (
        <>
          <line x1="36" y1="84" x2="22" y2="104" strokeWidth={STROKE + 2} />
          <line x1="84" y1="84" x2="98" y2="104" strokeWidth={STROKE + 2} />
          <line x1="50" y1="112" x2="48" y2="134" strokeWidth={STROKE + 2} />
          <line x1="70" y1="112" x2="72" y2="134" strokeWidth={STROKE + 2} />
          <circle cx="48" cy="134" r="4" fill={accent} />
          <circle cx="72" cy="134" r="4" fill={accent} />
        </>
      );
    case "claw":
      return (
        <>
          <rect x="18" y="80" width="16" height="24" rx="8" fill={fill} />
          <rect x="86" y="80" width="16" height="24" rx="8" fill={fill} />
          <path d="M18 104 L14 114 M26 106 L26 116 M34 104 L38 114" fill="none" strokeWidth={STROKE} />
          <path d="M86 104 L82 114 M94 106 L94 116 M102 104 L106 114" fill="none" strokeWidth={STROKE} />
          <rect x="44" y="110" width="12" height="22" rx="6" fill={fill} />
          <rect x="64" y="110" width="12" height="22" rx="6" fill={fill} />
        </>
      );
    case "wheel":
      return (
        <>
          <rect x="22" y="80" width="14" height="22" rx="7" fill={fill} />
          <rect x="84" y="80" width="14" height="22" rx="7" fill={fill} />
          <circle cx="60" cy="124" r="13" fill={fill} />
          <circle cx="60" cy="124" r="5" fill={accent} />
        </>
      );
    default:
      // stub: 짧고 둥근 팔다리
      return (
        <>
          <ellipse cx="30" cy="92" rx="8" ry="12" fill={fill} />
          <ellipse cx="90" cy="92" rx="8" ry="12" fill={fill} />
          <ellipse cx="49" cy="122" rx="9" ry="11" fill={fill} />
          <ellipse cx="71" cy="122" rx="9" ry="11" fill={fill} />
        </>
      );
  }
}

export function CyborgAvatar({ look, variant = "full", className, label }: CyborgAvatarProps) {
  const fill = color(look.primary);
  const accent = color(look.accent);
  const face = variant === "face";
  return (
    <svg
      className={className}
      viewBox={face ? "20 -4 80 80" : "0 -4 120 144"}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinejoin="round"
      strokeLinecap="round"
      data-look={`${look.head}.${look.face}.${look.body}.${look.limbs}.${look.primary}.${look.accent}`}
    >
      {face ? null : (
        <>
          <Limbs id={look.limbs} fill={fill} accent={accent} />
          <Body id={look.body} fill={fill} accent={accent} />
        </>
      )}
      <Head id={look.head} fill={fill} accent={accent} />
      <Face id={look.face} accent={accent} />
    </svg>
  );
}
