// 신앙도·신앙 포인트 — 기획 D-451(D-444 165 대체), D-441, REL-1(`docs/GDD/World/Consolidated_World.md` §2.1 범위 0~100).
// docs/adr/2026-10-31-faction-society-core.md "바뀜 (2026-11-01, D-450~D-453)".
// - 신앙도 = 쌓이는 점수(문턱). 환생에 필요하고 쓰지 않는다. 환생하면 0으로 돌아간다(cyborgRebirth.ts, 휴먼 환생도 같은 규칙 — D-451 해석).
// - 신앙 포인트 = 따로 쓰는 재화(그 종교의 특수 시스템·버프·아이템 등). 사용처는 신앙 콘텐츠 데이터(아직 없다).
// - 개종하면 옛 종교의 신앙도·신앙 포인트가 모두 사라진다. 그 종교에서 받은 특수 스킬도 사라진다(D-455 187).
// - 얻는 길(기도·헌금·의식·종교 의뢰, D-444 165)은 둘을 함께 쌓는다(D-451 해석). 활동·양은 신앙 콘텐츠 데이터이고 아직 없다.
// 유닛(사이보그·휴먼)이 같은 칸을 가진다(D-451 기술 전달). 정수만 쓴다.

/** 신앙도 범위 상한(REL-1 0~100, 구조 값 — 서버 DB 검사 `cyborgs_faith`와 같다) */
export const FAITH_MAX = 100;
/** 신앙 포인트 잔고 상한(서버 DB integer 칸에 들어가는 값, 기술 보호) */
export const FAITH_POINTS_MAX = 2_147_483_647;

/**
 * 유닛의 신앙 칸(D-451 기술 전달): 종교 코드(신앙 콘텐츠 ID, 없으면 null), 신앙도(누적), 신앙 포인트(잔고), 그 종교에서 받은 특수
 * 스킬(고유 스킬로 스킬 칸 하나씩 쓴다. 환생해도 남고 개종하면 사라진다 — D-455 187)
 */
export interface UnitFaith {
  readonly religion: string | null;
  readonly faith: number;
  readonly faithPoints: number;
  readonly religionSkills: readonly string[];
}

function amount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError("faith amount must be a non-negative integer");
  return value;
}

/** 종교 활동 한 번: 신앙도·신앙 포인트를 함께 쌓는다. 신앙도는 FAITH_MAX에서 멈춘다. 종교가 없으면 그대로 */
export function gainFaith<T extends UnitFaith>(unit: T, faith: number, points: number): T {
  const f = amount(faith);
  const p = amount(points);
  if (unit.religion === null) return unit;
  return {
    ...unit,
    faith: Math.min(FAITH_MAX, unit.faith + f),
    faithPoints: Math.min(FAITH_POINTS_MAX, unit.faithPoints + p),
  };
}

/** 신앙 포인트를 쓴다(신앙도는 그대로). 모자라면 null */
export function spendFaithPoints<T extends UnitFaith>(unit: T, points: number): T | null {
  const p = amount(points);
  if (unit.faithPoints < p) return null;
  return { ...unit, faithPoints: unit.faithPoints - p };
}

/** 환생: 신앙도만 0(문턱은 부르는 쪽이 먼저 본다). 신앙 포인트·종교·종교 특수 스킬은 남는다 */
export function resetFaithForRebirth<T extends UnitFaith>(unit: T): T {
  return { ...unit, faith: 0 };
}

/** 개종(종교 없음 포함): 옛 종교의 신앙도·신앙 포인트·종교 특수 스킬이 모두 사라진다(D-451·D-455 187). 같은 종교면 그대로 */
export function convertReligion<T extends UnitFaith>(unit: T, religion: string | null): T {
  if (unit.religion === religion) return unit;
  return { ...unit, religion, faith: 0, faithPoints: 0, religionSkills: [] };
}
