// 함선 운용 이름·범위(배 보직·함포 규격·포탄 종류·함급) — 기획 D-559 1533·1536·1537("네이비필드, 월드오브워쉽을 참고하라. 유닛 배치시 캡틴함장, 화포수,
// 엔진실, 갑판병 기본수리 등등. 함포 및 포탄 규격화 AP, HE 탄 등. 조선소 설계시 함급등으로 내구도나 장착가능한 모듈 총한도 등등 설계 가능. 항공모함은 아직
// 미구현이나 조종사 등, 전투기 격납고도 추가가능."), docs/adr/2026-11-15-sea-combat-routes.md "바뀜 (2026-11-15) D-559".
// 팩 스키마(@terra/content 배 종류 naval 칸)·서버(apps/server/src/boats)·화면이 같은 값을 쓴다. 해상 전투 판정은 아직 없다 — 함포·포탄 값은 전투 고리가 읽는다.

/**
 * 배 보직(D-559 1533). 승객을 보직에 둔다.
 * - captain(함장): 배에 하나. 표류한 배를 빼앗는 사람은 자기 함장을 앉힌다(D-559 1534).
 * - gunner(화포수): 함포 하나에 한 명(해상 전투 고리).
 * - engine(엔진실): 오버히트 내구도 닳음을 줄인다.
 * - deck(갑판병): 바다에서 기본 수리(상한까지).
 * - pilot(조종사): 항공모함 격납고 틀(아직 쓰지 않는다 — 함급 hangar가 0이면 둘 수 없다).
 * - fisher(낚시 선원, 기획 D-570 1821 "함포처럼 채집사이클 및 포획장비마다 유닛배치. 어선은 함장1명 및 낚시선원 3명"): 함포 칸에 단 포획 장비 하나에
 *   한 명(화포수와 같은 틀). 포획 장비가 붙은 낚시 선원만 배 채집 일꾼이다(gather/boatCrew.ts).
 */
export const CREW_POSTS = ["captain", "gunner", "engine", "deck", "pilot", "fisher"] as const;
export type CrewPost = (typeof CREW_POSTS)[number];

/** 함포 규격(D-559 1533 "함포 및 포탄 규격화") — 소·중·대구경 */
export const GUN_CALIBERS = ["light", "medium", "heavy"] as const;
export type GunCaliber = (typeof GUN_CALIBERS)[number];

/** 포탄 종류(D-559 1536 "포탄 종류마다 다름") — AP = 선체만, HE = 선체와 갑판 승객 */
export const SHELL_KINDS = ["ap", "he"] as const;
export type ShellKind = (typeof SHELL_KINDS)[number];

/** 배 종류 naval 칸 범위(팩 스키마·서버 시험이 같은 값을 본다) */
export const NAVAL_LIMITS = {
  /** 전투 HP(선체) */
  hullPoints: { min: 1, max: 1_000_000 },
  armor: { min: 0, max: 10_000 },
  /** 장착 가능한 모듈 총한도(D-559 "모듈 총한도") */
  modulePoints: { min: 0, max: 100 },
  /** 함포 자리 수 */
  guns: 16,
  /** 보직 하나에 둘 수 있는 수 */
  crewPerPost: 32,
  /** 전투기 격납고(항공모함 틀 — 지금은 0만 쓴다) */
  hangar: { min: 0, max: 64 },
  /** 연료 통·한 시간 연료(단위) */
  fuelCapacity: { min: 1, max: 1_000_000 },
  fuelPerHour: { min: 0, max: 100_000 },
  /** 배 창고(kg, D-568 — 배에서 캔 것이 든다) */
  holdKg: { min: 1, max: 1_000_000 },
  /** 태우는 연료 아이템 줄 수·한 개가 채우는 연료(단위, D-564 1687 — 연료는 아이템만) */
  fuelItems: 8,
  fuelUnits: { min: 1, max: 1_000_000 },
  /** 달 수 있는 포획 장비 줄 수(D-570 1821) */
  catchGear: 8,
} as const;

/**
 * 포획 장비 한 줄(기획 D-570 1821 "어선의 함포칸에 장비하는 포획장비에 따라 채집가능한 최대티어가 정해지고 유닛들마다 채집티어확률로 적용됨").
 * 배 종류가 달 수 있는 아이템과 그 장비로 잡을 수 있는 가장 높은 티어. 장비는 함포 칸 하나에 하나 달고(그 칸의 함포는 쉰다), 낚시 선원 한 명이 맡는다
 */
export interface CatchGear {
  readonly item: string;
  readonly maxTier: number;
}

/**
 * 함포 칸에 단 장비(배마다 칸 차례 — 칸 수 = 배 종류 함포 자리 수). null = 함포 그대로. 서버 boat_states.gear와 화면이 같은 모양을 쓴다.
 * 칸 수보다 긴 줄·모르는 칸은 읽을 때 자른다
 */
export type GunSlotGear = readonly (string | null)[];

/** 함포 칸 차례에서 장비가 달린 칸만 → 포획 장비(배 종류가 모르는 아이템은 버린다, 칸 차례) */
export function mountedCatchGear(
  gear: GunSlotGear,
  slots: number,
  options: readonly CatchGear[] | undefined,
): { readonly slot: number; readonly gear: CatchGear }[] {
  const out: { slot: number; gear: CatchGear }[] = [];
  for (let slot = 0; slot < Math.min(slots, gear.length); slot += 1) {
    const item = gear[slot];
    const found = item === null || item === undefined ? undefined : options?.find((row) => row.item === item);
    if (found) out.push({ slot, gear: found });
  }
  return out;
}

/** 연료 아이템 한 줄(그 아이템 1개 = 연료 units 단위) */
export interface FuelItem {
  readonly item: string;
  readonly units: number;
}

/** 배 종류의 함선 칸(서버·화면 공용 모양) */
export interface NavalSpec {
  /** 함급 ID(조선소 설계의 묶음 — 콘텐츠 ID 모양) */
  readonly shipClass: string;
  readonly hullPoints: number;
  readonly armor: number;
  readonly modulePoints: number;
  readonly guns: readonly { readonly caliber: GunCaliber; readonly shells: readonly ShellKind[] }[];
  /** 보직마다 자리 수(없는 보직은 0) */
  readonly crew: Partial<Readonly<Record<CrewPost, number>>>;
  readonly hangar: number;
}

/**
 * 보직 자리 수(함장은 늘 1 — 함급에 0이어도 함장 자리는 있다, 조종사는 격납고가 있을 때만). 낚시 선원은 함급 자리 수(D-570 1821 — 어선 3)이고,
 * 일하는 수는 단 포획 장비 수까지다(gather — 장비 없는 선원은 쉰다)
 */
export function postSeats(spec: Pick<NavalSpec, "crew" | "hangar"> | undefined, post: CrewPost): number {
  if (post === "captain") return 1;
  if (post === "pilot" && (spec?.hangar ?? 0) <= 0) return 0;
  return Math.max(0, spec?.crew[post] ?? (post === "deck" ? 1 : 0));
}
