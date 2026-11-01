// 사이보그 2D 그림(SVG 하나) — 외형 = 부위 ID 넷 + 색 둘(D-6040, @terra/shared/cyborg). docs/adr/2026-11-01-first-login-cyborg.md 1절.
// [임시] 3D 모델이 생기기 전까지 쓰는 그림이다(질문 172 → D-445). 3~4등신 장난감 톤(D-064·D-065, ADR 2026-10-28-design-system):
// 둥글고 부드럽지만 다듬은 모양 — 껍데기 명암, 어두운 얼굴 화면 위의 빛나는 눈·바이저, 관절·리벳, 바닥 그림자(ADR 2026-11-01-ui-visibility).
// - 칠 색은 세계의 색이라 테마와 상관없다(목록 값, 명암은 같은 색을 섞어 만든다). 바깥 테두리만 화면 글자 색(currentColor)이라 테마 대비를 따른다.
// - 모르는 ID(더 새 서버)는 그 칸의 첫 부위로 그린다. 그림은 꾸밈이라 aria-hidden이 기본이고, 이름은 부르는 쪽이 붙인다.
// - variant "face"는 머리만(프리셋·강하 캡슐·작은 자리), "full"은 몸까지(만들기 화면·사이보그 화면).
// - 그라데이션·빛 필터 ID는 그림마다 다르다(useId). 같은 화면에 그림이 여럿이어도 섞이지 않는다.
// 첫 화면 묶음에 넣지 않는다(지연 조각 /start·/cyborg만 가져온다, ADR 37 11절).
import { CYBORG_COLORS, type CyborgAppearance } from "@terra/shared/cyborg";
import { useId } from "react";

interface CyborgAvatarProps {
  readonly look: CyborgAppearance;
  readonly variant?: "face" | "full";
  /** 뒤에 포인트 색 빛 고리(사이보그 화면 머리 판). 빛 색은 세계 색이라 그림 안에서 칠한다 */
  readonly halo?: boolean;
  readonly className?: string;
  /** 읽는 이름. 없으면 꾸밈(aria-hidden) */
  readonly label?: string;
}

/** 얼굴 화면·관절의 짙은 색, 명암을 섞는 색(세계 그림의 값이라 테마 값이 아니다) */
const INK = "#1d2a40";
const SCREEN_TOP = "#2c3c5c";
const SCREEN_BOTTOM = "#121b2e";
const WHITE = "#ffffff";
const BLUSH = "#ff9a9a";
const OUTLINE = 2.5;

function color(id: string): string {
  const found = Object.entries(CYBORG_COLORS).find(([key]) => key === id);
  return found ? found[1] : CYBORG_COLORS.mint;
}

/** #rrggbb의 한 채널(0 빨강·1 초록·2 파랑) */
const channel = (hex: string, index: number): number =>
  Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);

/** #rrggbb 두 색을 t(0~1)만큼 섞는다(꾸밈 색 계산 — 판정이 아니다) */
export function mixHex(from: string, to: string, t: number): string {
  const out = [0, 1, 2].map((index) => {
    const value = Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * t);
    return Math.min(255, Math.max(0, value)).toString(16).padStart(2, "0");
  });
  return `#${out.join("")}`;
}

interface Paint {
  /** 껍데기 그라데이션 url(…) */
  readonly shell: string;
  readonly fill: string;
  readonly light: string;
  readonly shade: string;
  readonly deep: string;
  readonly accent: string;
  /** 빛나는 부분의 가운데(포인트 색을 밝게) */
  readonly core: string;
  /** 짙은 얼굴 화면 그라데이션 url(…) */
  readonly screen: string;
  /** 빛 필터 url(…) */
  readonly glow: string;
}

/** 머리 뒤쪽(귀·안테나·볏) — 머리통보다 먼저 그린다 */
function HeadBack({ id, p }: { id: string; p: Paint }) {
  const ears = (
    <>
      <rect x="30" y="50" width="12" height="28" rx="6" fill={p.shade} />
      <rect x="118" y="50" width="12" height="28" rx="6" fill={p.shade} />
      <circle cx="36" cy="64" r="3" fill={p.accent} filter={p.glow} stroke="none" />
      <circle cx="124" cy="64" r="3" fill={p.accent} filter={p.glow} stroke="none" />
    </>
  );
  switch (id) {
    case "antenna":
      return (
        <>
          {ears}
          <line x1="80" y1="22" x2="80" y2="7" strokeWidth={OUTLINE} />
          <ellipse cx="80" cy="22" rx="8" ry="3.5" fill={p.deep} />
          <circle cx="80" cy="7" r="5.5" fill={p.accent} filter={p.glow} />
          <circle cx="78.5" cy="5.5" r="1.6" fill={WHITE} stroke="none" />
        </>
      );
    case "crest":
      return (
        <>
          {ears}
          <path d="M64 30 C66 10 74 2 80 1 C86 2 94 10 96 30 Z" fill={p.accent} />
          <path d="M76 26 C77 14 79 8 80 6" fill="none" stroke={p.core} strokeWidth="2.5" />
        </>
      );
    case "helm":
      return (
        <>
          <rect x="26" y="48" width="14" height="32" rx="6" fill={p.shade} />
          <rect x="120" y="48" width="14" height="32" rx="6" fill={p.shade} />
          <line x1="30" y1="58" x2="36" y2="58" stroke={p.deep} strokeWidth="1.6" />
          <line x1="30" y1="64" x2="36" y2="64" stroke={p.deep} strokeWidth="1.6" />
          <line x1="30" y1="70" x2="36" y2="70" stroke={p.deep} strokeWidth="1.6" />
          <line x1="124" y1="58" x2="130" y2="58" stroke={p.deep} strokeWidth="1.6" />
          <line x1="124" y1="64" x2="130" y2="64" stroke={p.deep} strokeWidth="1.6" />
          <line x1="124" y1="70" x2="130" y2="70" stroke={p.deep} strokeWidth="1.6" />
        </>
      );
    default:
      return ears;
  }
}

/** 머리통(껍데기 + 광택 + 부위 장식) */
function Skull({ id, p }: { id: string; p: Paint }) {
  const helm = id === "helm";
  return (
    <>
      {helm ? (
        <rect x="36" y="22" width="88" height="82" rx="28" fill={p.shell} strokeWidth={OUTLINE} />
      ) : (
        <circle cx="80" cy="62" r="43" fill={p.shell} strokeWidth={OUTLINE} />
      )}
      {id === "dome" ? (
        <>
          <path d="M41 50 Q80 14 119 50" fill="none" stroke={p.deep} strokeWidth="5" strokeLinecap="round" />
          <circle cx="58" cy="32" r="2.2" fill={p.deep} stroke="none" />
          <circle cx="102" cy="32" r="2.2" fill={p.deep} stroke="none" />
        </>
      ) : null}
      {helm ? <path d="M48 30 Q80 20 112 30" fill="none" stroke={p.light} strokeWidth="3" /> : null}
      <ellipse
        cx={helm ? 58 : 62}
        cy={helm ? 34 : 36}
        rx="13"
        ry="7"
        transform={`rotate(-24 ${helm ? 58 : 62} ${helm ? 34 : 36})`}
        fill={WHITE}
        fillOpacity="0.55"
        stroke="none"
      />
      {helm ? null : (
        <>
          <ellipse cx="54" cy="92" rx="6" ry="3.5" fill={BLUSH} fillOpacity="0.45" stroke="none" />
          <ellipse cx="106" cy="92" rx="6" ry="3.5" fill={BLUSH} fillOpacity="0.45" stroke="none" />
        </>
      )}
    </>
  );
}

/** 얼굴: 짙은 화면 위에 빛나는 바이저·눈 */
function Face({ id, p }: { id: string; p: Paint }) {
  const screen = (
    <rect x="49" y="48" width="62" height="38" rx="18" fill={p.screen} stroke={p.deep} strokeWidth="1.6" />
  );
  switch (id) {
    case "eyes":
      return (
        <>
          {screen}
          <circle cx="67" cy="67" r="7" fill={p.accent} filter={p.glow} stroke="none" />
          <circle cx="93" cy="67" r="7" fill={p.accent} filter={p.glow} stroke="none" />
          <circle cx="69.5" cy="64.5" r="2.2" fill={WHITE} stroke="none" />
          <circle cx="95.5" cy="64.5" r="2.2" fill={WHITE} stroke="none" />
        </>
      );
    case "mono":
      return (
        <>
          {screen}
          <circle cx="80" cy="67" r="12" fill={p.accent} filter={p.glow} stroke="none" />
          <circle cx="80" cy="67" r="6.5" fill={p.core} stroke="none" />
          <circle cx="80" cy="67" r="2.8" fill={SCREEN_BOTTOM} stroke="none" />
          <circle cx="84" cy="62.5" r="2" fill={WHITE} stroke="none" />
        </>
      );
    case "grill":
      return (
        <>
          {screen}
          <circle cx="67" cy="61" r="4.5" fill={p.accent} filter={p.glow} stroke="none" />
          <circle cx="93" cy="61" r="4.5" fill={p.accent} filter={p.glow} stroke="none" />
          <rect x="65" y="70" width="30" height="9" rx="4.5" fill="none" stroke={p.accent} strokeWidth="2" />
          <line x1="75" y1="71" x2="75" y2="78" stroke={p.accent} strokeWidth="1.8" />
          <line x1="85" y1="71" x2="85" y2="78" stroke={p.accent} strokeWidth="1.8" />
        </>
      );
    default:
      // visor: 가로로 빛나는 띠
      return (
        <>
          {screen}
          <rect x="56" y="60" width="48" height="14" rx="7" fill={p.accent} filter={p.glow} stroke="none" />
          <rect x="61" y="63.5" width="38" height="3.5" rx="1.75" fill={p.core} stroke="none" />
        </>
      );
  }
}

/** 몸통 */
function Torso({ id, p }: { id: string; p: Paint }) {
  switch (id) {
    case "plate":
      return (
        <>
          <rect x="52" y="104" width="56" height="48" rx="14" fill={p.shell} strokeWidth={OUTLINE} />
          <rect
            x="62"
            y="112"
            width="36"
            height="20"
            rx="6"
            fill={p.light}
            stroke={p.deep}
            strokeWidth="1.4"
          />
          {[
            [57, 109],
            [103, 109],
            [57, 147],
            [103, 147],
          ].map(([x, y]) => (
            <circle key={`${String(x)}-${String(y)}`} cx={x} cy={y} r="1.8" fill={p.deep} stroke="none" />
          ))}
          <rect x="68" y="139" width="24" height="5" rx="2.5" fill={p.accent} filter={p.glow} stroke="none" />
        </>
      );
    case "slim":
      return (
        <>
          <rect x="61" y="104" width="38" height="50" rx="17" fill={p.shell} strokeWidth={OUTLINE} />
          <rect x="76" y="110" width="8" height="38" rx="4" fill={p.accent} filter={p.glow} stroke="none" />
          <circle cx="80" cy="114" r="2" fill={p.core} stroke="none" />
        </>
      );
    case "core":
      return (
        <>
          <rect x="53" y="104" width="54" height="48" rx="21" fill={p.shell} strokeWidth={OUTLINE} />
          <circle cx="80" cy="127" r="13" fill={p.screen} stroke={p.deep} strokeWidth="1.6" />
          <circle cx="80" cy="127" r="7.5" fill={p.accent} filter={p.glow} stroke="none" />
          <circle cx="80" cy="127" r="3.2" fill={p.core} stroke="none" />
        </>
      );
    default:
      // round: 둥근 배 + 배 판 + 단추
      return (
        <>
          <ellipse cx="80" cy="129" rx="31" ry="25" fill={p.shell} strokeWidth={OUTLINE} />
          <ellipse cx="80" cy="134" rx="17" ry="13" fill={p.light} stroke="none" />
          <circle cx="80" cy="119" r="3.2" fill={p.accent} filter={p.glow} stroke="none" />
        </>
      );
  }
}

/** 팔다리(몸통보다 먼저 그려 어깨·엉덩이가 몸통 밑으로 들어간다) */
function Limbs({ id, p }: { id: string; p: Paint }) {
  switch (id) {
    case "piston":
      return (
        <>
          <path d="M54 114 L40 134 L44 154" fill="none" stroke={p.deep} strokeWidth="7" />
          <path d="M106 114 L120 134 L116 154" fill="none" stroke={p.deep} strokeWidth="7" />
          <circle cx="40" cy="134" r="4.5" fill={p.accent} filter={p.glow} stroke="none" />
          <circle cx="120" cy="134" r="4.5" fill={p.accent} filter={p.glow} stroke="none" />
          <circle cx="44" cy="156" r="7" fill={p.shell} strokeWidth={OUTLINE} />
          <circle cx="116" cy="156" r="7" fill={p.shell} strokeWidth={OUTLINE} />
          <line x1="70" y1="148" x2="68" y2="172" stroke={p.deep} strokeWidth="7" />
          <line x1="90" y1="148" x2="92" y2="172" stroke={p.deep} strokeWidth="7" />
          <rect x="55" y="170" width="24" height="13" rx="6.5" fill={p.shell} strokeWidth={OUTLINE} />
          <rect x="81" y="170" width="24" height="13" rx="6.5" fill={p.shell} strokeWidth={OUTLINE} />
        </>
      );
    case "claw":
      return (
        <>
          <rect
            x="34"
            y="110"
            width="16"
            height="34"
            rx="8"
            transform="rotate(16 42 127)"
            fill={p.shell}
            strokeWidth={OUTLINE}
          />
          <rect
            x="110"
            y="110"
            width="16"
            height="34"
            rx="8"
            transform="rotate(-16 118 127)"
            fill={p.shell}
            strokeWidth={OUTLINE}
          />
          {/* 집게: 손목 관절 아래 둥근 날 둘 */}
          <rect x="29" y="142" width="7" height="16" rx="3.5" transform="rotate(24 32 142)" fill={p.deep} />
          <rect x="38" y="142" width="7" height="16" rx="3.5" transform="rotate(-12 41 142)" fill={p.deep} />
          <rect x="115" y="142" width="7" height="16" rx="3.5" transform="rotate(12 119 142)" fill={p.deep} />
          <rect
            x="124"
            y="142"
            width="7"
            height="16"
            rx="3.5"
            transform="rotate(-24 128 142)"
            fill={p.deep}
          />
          <circle cx="37" cy="143" r="5.5" fill={p.shade} strokeWidth={OUTLINE} />
          <circle cx="123" cy="143" r="5.5" fill={p.shade} strokeWidth={OUTLINE} />
          <circle cx="37" cy="143" r="2" fill={p.accent} filter={p.glow} stroke="none" />
          <circle cx="123" cy="143" r="2" fill={p.accent} filter={p.glow} stroke="none" />
          <rect x="61" y="146" width="15" height="24" rx="7.5" fill={p.shade} strokeWidth={OUTLINE} />
          <rect x="84" y="146" width="15" height="24" rx="7.5" fill={p.shade} strokeWidth={OUTLINE} />
          <ellipse cx="68" cy="175" rx="12" ry="7" fill={p.shell} strokeWidth={OUTLINE} />
          <ellipse cx="92" cy="175" rx="12" ry="7" fill={p.shell} strokeWidth={OUTLINE} />
        </>
      );
    case "wheel":
      return (
        <>
          <ellipse
            cx="46"
            cy="124"
            rx="8"
            ry="13"
            transform="rotate(22 46 124)"
            fill={p.shell}
            strokeWidth={OUTLINE}
          />
          <ellipse
            cx="114"
            cy="124"
            rx="8"
            ry="13"
            transform="rotate(-22 114 124)"
            fill={p.shell}
            strokeWidth={OUTLINE}
          />
          <rect x="72" y="146" width="16" height="14" rx="4" fill={p.deep} />
          <circle cx="80" cy="170" r="18" fill={INK} strokeWidth={OUTLINE} />
          <circle cx="80" cy="170" r="12" fill={p.shade} stroke="none" />
          <circle cx="80" cy="170" r="5" fill={p.accent} filter={p.glow} stroke="none" />
        </>
      );
    default:
      // stub: 짧고 둥근 팔다리
      return (
        <>
          <ellipse
            cx="45"
            cy="124"
            rx="9.5"
            ry="15"
            transform="rotate(22 45 124)"
            fill={p.shell}
            strokeWidth={OUTLINE}
          />
          <ellipse
            cx="115"
            cy="124"
            rx="9.5"
            ry="15"
            transform="rotate(-22 115 124)"
            fill={p.shell}
            strokeWidth={OUTLINE}
          />
          <rect x="60" y="146" width="17" height="24" rx="8.5" fill={p.shade} strokeWidth={OUTLINE} />
          <rect x="83" y="146" width="17" height="24" rx="8.5" fill={p.shade} strokeWidth={OUTLINE} />
          <ellipse cx="68" cy="175" rx="13" ry="7.5" fill={p.shell} strokeWidth={OUTLINE} />
          <ellipse cx="92" cy="175" rx="13" ry="7.5" fill={p.shell} strokeWidth={OUTLINE} />
        </>
      );
  }
}

export function CyborgAvatar({ look, variant = "full", halo = false, className, label }: CyborgAvatarProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fill = color(look.primary);
  const accent = color(look.accent);
  const face = variant === "face";
  const ids = { shell: `cy${uid}s`, screen: `cy${uid}f`, glow: `cy${uid}g`, halo: `cy${uid}h` };
  const p: Paint = {
    shell: `url(#${ids.shell})`,
    fill,
    light: mixHex(fill, WHITE, 0.5),
    shade: mixHex(fill, INK, 0.22),
    deep: mixHex(fill, INK, 0.55),
    accent,
    core: mixHex(accent, WHITE, 0.65),
    screen: `url(#${ids.screen})`,
    glow: `url(#${ids.glow})`,
  };
  return (
    <svg
      className={className}
      viewBox={face ? "22 -2 116 116" : "0 -2 160 200"}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      stroke="currentColor"
      strokeWidth={OUTLINE}
      strokeLinejoin="round"
      strokeLinecap="round"
      data-look={`${look.head}.${look.face}.${look.body}.${look.limbs}.${look.primary}.${look.accent}`}
    >
      <defs>
        <linearGradient id={ids.shell} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor={mixHex(fill, WHITE, 0.4)} />
          <stop offset="0.55" stopColor={fill} />
          <stop offset="1" stopColor={mixHex(fill, INK, 0.2)} />
        </linearGradient>
        <linearGradient id={ids.screen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={SCREEN_TOP} />
          <stop offset="1" stopColor={SCREEN_BOTTOM} />
        </linearGradient>
        <radialGradient id={ids.halo}>
          <stop offset="0" stopColor={accent} stopOpacity="0.5" />
          <stop offset="0.6" stopColor={accent} stopOpacity="0.16" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </radialGradient>
        <filter id={ids.glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {halo ? (
        <>
          <circle cx="80" cy="100" r="80" fill={`url(#${ids.halo})`} stroke="none" />
          <circle
            cx="80"
            cy="100"
            r="72"
            fill="none"
            stroke={accent}
            strokeOpacity="0.55"
            strokeWidth="1.5"
            strokeDasharray="3 6"
          />
        </>
      ) : null}
      {face ? null : (
        <>
          <ellipse cx="80" cy="190" rx="38" ry="5.5" fill="currentColor" fillOpacity="0.12" stroke="none" />
          <Limbs id={look.limbs} p={p} />
          <rect x="71" y="98" width="18" height="10" rx="4" fill={p.deep} stroke="none" />
          <Torso id={look.body} p={p} />
        </>
      )}
      <HeadBack id={look.head} p={p} />
      <Skull id={look.head} p={p} />
      <Face id={look.face} p={p} />
    </svg>
  );
}
