// 생명·전투 자원 막대의 절대값 눈금(10 / 50 / 100 단위 3단계 구분) — 홈 사이보그 카드·유닛 상세·전투 화면 공용.
// 막대 채움 길이는 항상 현재 ÷ 최대(%) 비율로 그리고, 막대 위 눈금으로 절대 규모를 한눈에 구분한다.
// 최대치가 커져 눈금이 너무 촘촘해지면 10/50/100 → 50/100/500 → 100/500/1000 … 순으로 자동 상향한다.

export interface VitalTickScale {
  /** 소눈금 간격(기본 10) */
  readonly minor: number;
  /** 중눈금 간격(기본 50) */
  readonly mid: number;
  /** 대눈금 간격(기본 100) */
  readonly major: number;
}

export interface VitalTickCssVars {
  readonly "--vt-minor": string;
  readonly "--vt-mid": string;
  readonly "--vt-major": string;
}

/** 한 막대에 소눈금이 이 개수를 넘기면 다음 축척 단계로 올린다(일반 막대 25칸, 전투 머리 위 좁은 막대 12칸) */
const MAX_MINOR_NORMAL = 25;
const MAX_MINOR_COMPACT = 12;

/** 비활성 눈금 층(100% 밖으로 밀어 그리지 않는다) */
const INACTIVE_STEP = "200%";

/** 최대치에 맞는 3단계 눈금 간격(기본 10 / 50 / 100). 내부 눈금이 하나도 생기지 않으면 null */
export function vitalTickScale(max: number, compact = false): VitalTickScale | null {
  if (!Number.isFinite(max) || max <= 0) return null;
  const limit = compact ? MAX_MINOR_COMPACT : MAX_MINOR_NORMAL;
  let minor = 10;
  let mid = 50;
  let major = 100;
  while (max / minor > limit) {
    const nextMinor = mid;
    const nextMid = major;
    const nextMajor = mid * 10;
    minor = nextMinor;
    mid = nextMid;
    major = nextMajor;
  }
  if (max <= minor) return null;
  return { minor, mid, major };
}

/** 눈금 한 단계의 CSS 백분율 폭(최대치 이하에서만 내부 눈금이 생기므로 max <= step이면 비활성) */
function stepPct(step: number, max: number): string {
  if (max <= step) return INACTIVE_STEP;
  return `${((step / max) * 100).toFixed(4)}%`;
}

/** CSS `.vital-ticks` 층에 바로 꽂는 사용자 정의 속성. 눈금이 필요 없으면 null */
export function vitalTickVars(max: number, compact = false): VitalTickCssVars | null {
  const scale = vitalTickScale(max, compact);
  if (scale === null) return null;
  return {
    "--vt-minor": stepPct(scale.minor, max),
    "--vt-mid": stepPct(scale.mid, max),
    "--vt-major": stepPct(scale.major, max),
  };
}

/** DOM 요소(전투 3D 덧층 등 React 밖)에 눈금 속성을 한 번에 적용한다 */
export function applyVitalTicks(element: HTMLElement, max: number, compact = false): void {
  const vars = vitalTickVars(max, compact);
  if (vars === null) {
    element.hidden = true;
    return;
  }
  element.hidden = false;
  if (compact) element.dataset.compact = "true";
  else delete element.dataset.compact;
  element.style.setProperty("--vt-minor", vars["--vt-minor"]);
  element.style.setProperty("--vt-mid", vars["--vt-mid"]);
  element.style.setProperty("--vt-major", vars["--vt-major"]);
}
