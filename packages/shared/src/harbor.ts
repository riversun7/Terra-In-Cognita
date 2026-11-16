// 배 시설(조선소·정박장·교역 부두)과 배 종류의 공용 이름·범위 — 기획 D-545·D-547(배 체계 개편, 1481~1500)·D-548(사업장 수입은 사업장 장부),
// docs/adr/2026-11-15-shipyard-harbor.md. 팩 스키마(@terra/content)·서버(apps/server/src/boats)·화면이 같은 값을 쓴다.
// - 조선소(shipyard): 배를 만들고 고친다(1481·1494). 물가 어디나(1482). 도크 기본 1, 레벨 2부터 레벨마다 모듈 하나 더(도크 늘림·건조 특화·수리 특화,
//   1483·D-559 1521, 같은 모듈 여러 개는 효과가 모두 겹친다 — D-564 1681). 다 만들거나 고친 배는 꺼낼(출고) 때까지 도크에 있고 그 도크를 쓴다.
//   남의 배는 장기 보관료를 내야 꺼낸다(D-559 1523) — 밀리면 압류하고, 밀린 돈이 배값을 넘으면 조선소 주인 것이 된다(D-564 1686).
//   남의 조선소도 받기 범위 안이면 고치고 배 짓기 주문(외주)도 받는다(D-559 1522·D-564 1682 — 요금은 그 조선소 금고). 요금은 그 항구가 선 나라 화폐(D-559 1524).
// - 정박장(berth): 배가 사는 곳(유닛 주거처럼). 레벨마다 정박 자리가 는다(1487). 남의 배는 주인이 고른 범위만 받고 정박료는 정박장 장부로(1490·1491·1498).
// - 교역 부두(trade_dock): 시간을 사서 상하차·보급을 하고 떠나는 곳(1488·1489). 산 시간을 넘기면 초과 시간마다 높은 요금.
// 배 내구도는 백만분율(ppm) 정수다(건물 상태 값과 같은 단위 — @terra/shared/facilityRuntime CONDITION_FULL).
import type { FairPriceView } from "./fairPrice.ts";

/** 배 시설 역할(팩 facilities.json harbor 칸) */
export const HARBOR_ROLES = ["shipyard", "berth", "trade_dock"] as const;
export type HarborRole = (typeof HARBOR_ROLES)[number];

/**
 * 남의 배 받기 범위(1490 가·1498 가): owner = 내 배만, nation = 같은 나라(봉신 가문 포함, 처음 값), peace = 전쟁 중인 세력 빼고 모두.
 * NPC 정박장은 nation이 처음 값이다(같은 나라 + 1498 "평화 세력"은 peace로 고른다 — 아래 NPC_HARBOR_ACCESS)
 */
export const HARBOR_ACCESS = ["owner", "nation", "peace"] as const;
export type HarborAccess = (typeof HARBOR_ACCESS)[number];
export const DEFAULT_HARBOR_ACCESS: HarborAccess = "nation";
/** NPC 정박장·교역 부두의 받기 범위(1498 가 "같은 나라·평화 세력 배 받음") */
export const NPC_HARBOR_ACCESS: HarborAccess = "peace";

/** 조선소 모듈(1483): 도크 늘림·건조 특화·수리 특화. 없음(null)이면 도크 기본 수만 */
export const SHIPYARD_MODULES = ["docks", "build", "repair"] as const;
export type ShipyardModule = (typeof SHIPYARD_MODULES)[number];
/** 모듈을 붙일 수 있는 조선소 레벨 */
export const SHIPYARD_MODULE_LEVEL = 2;
/**
 * 조선소 모듈 자리 수(D-559 1521 "조선소는 일단 레벨마다 하나씩 추가로"): 레벨 2부터 한 레벨마다 하나(레벨 3 = 둘).
 * 같은 모듈 여러 개는 효과가 모두 겹친다(D-564 1681 "모두 겹침" — 도크 늘림 둘 = 도크 +2, 건조 특화 둘 = 시간 × 특화 × 특화)
 */
export const shipyardModuleSlots = (level: number): number =>
  Math.max(0, Math.floor(level) - SHIPYARD_MODULE_LEVEL + 1);
/** 모듈 묶음이 맞나(자리 수 안 — 같은 모듈을 겹쳐 붙여도 된다, D-564 1681) */
export const modulesValid = (modules: readonly ShipyardModule[], level: number): boolean =>
  modules.length <= shipyardModuleSlots(level);
/** 묶음에 그 모듈이 몇 개인가(자리 수를 넘는 것은 세지 않는다) */
export const moduleCount = (
  modules: readonly ShipyardModule[],
  level: number,
  module: ShipyardModule,
): number => modules.slice(0, shipyardModuleSlots(level)).filter((entry) => entry === module).length;
/** 한 조선소에 붙는 모듈 상한(메시지 모양 검사 — 조선소 최고 레벨보다 넉넉히) */
export const SHIPYARD_MODULES_MAX = 8;

/** 배 내구도 가득(ppm) */
export const HULL_FULL = 1_000_000;

/** 배 종류 칸 범위(팩 스키마·서버 시험이 같은 값을 본다) */
export const BOAT_TYPE_LIMITS = {
  /** 조선소 하나가 만드는 배 종류 수 */
  types: 8,
  /** 재료 줄 수 */
  materials: 8,
  qty: { min: 1, max: 100_000 },
  /** 기준 만드는 시간(ms) — 설정 칸 boat_build_time_pm을 곱한다 */
  buildMs: { min: 0, max: 7 * 86_400_000 },
  /** 빠르기(설정 칸 boat_speed에 대한 ‰) */
  speedPm: { min: 100, max: 5000 },
  /** 타는 유닛 수 */
  capacity: { min: 1, max: 32 },
} as const;

/** 교역 부두에서 한 번에 사는 시간(시간 단위) 범위 — 위 끝은 설정 칸 trade_dock_max_hours가 더 좁힌다 */
export const TRADE_DOCK_HOURS = { min: 1, max: 72 } as const;
/** 정박료·교역 부두 요금 칸 상한(화폐 최소 단위) */
export const HARBOR_FEE_MAX = 1_000_000_000;

/** 배 시설 판(건물 판 gather.building의 harbor 칸 — 서버가 채운다) */
export interface HarborBoatView {
  readonly boatId: number;
  /** 내 배인가(남의 배는 주인을 싣지 않는다) */
  readonly own: boolean;
  readonly typeId: string;
  /** 내구도(‰, 내림) */
  readonly hullPm: number;
  /** 집 정박장(없으면 null) */
  readonly homeId: number | null;
  /** 배 창고 무게·상한(g, D-568 — 내 배만, 옛 서버면 없음) */
  readonly holdGrams?: number | undefined;
  readonly holdCapGrams?: number | undefined;
  /** 함포 칸(칸 차례 — 규격·단 장비 아이템, D-570 1821). 함포가 없는 배·옛 서버면 없음 */
  readonly slots?: readonly { readonly caliber: string; readonly gear: string | null }[] | undefined;
  /** 이 배 종류가 달 수 있는 포획 장비(아이템·최대 티어·이름). 없으면 달 수 없다 */
  readonly gearOptions?: readonly HarborItemView[] | undefined;
  /** 이 항구에서 실을 수 있는 내 물건(항구 옆 거래소 건물 창고 + 그 도시 내 창고, 묶음 수 — D-570 1823). 옛 서버면 없음 */
  readonly loadable?: readonly HarborItemView[] | undefined;
}

/** 배 판의 아이템 한 줄(포획 장비면 maxTier, 실을 물건이면 lots) */
export interface HarborItemView {
  readonly item: string;
  readonly name?: { readonly ko: string; readonly en: string } | undefined;
  readonly maxTier?: number | undefined;
  readonly lots?: number | undefined;
}

export interface HarborJobView {
  readonly kind: "build" | "repair";
  readonly typeId: string;
  /** 수리하는 배(만들기는 없음) */
  readonly boatId: number | null;
  readonly startedAt: number;
  readonly readyAt: number;
  /** 내 작업인가 */
  readonly own: boolean;
}

export interface HarborBoatTypeView {
  readonly id: string;
  readonly name: { readonly ko: string; readonly en: string };
  /** 실제 재료(설정 칸 boat_cost_pm을 곱한 묶음 수, 이름은 아이템 이름 — 모르면 없음) */
  readonly materials: readonly {
    readonly item: string;
    readonly qty: number;
    readonly name?: { readonly ko: string; readonly en: string } | undefined;
  }[];
  /** 실제 만드는 시간(ms, 건조 특화 반영) */
  readonly buildMs: number;
  readonly speedPm: number;
  readonly capacity: number;
  /** 배 한 척 적정가(재료비·조선소 인건비·수수료·세금 — 기획 D-570 1822, 요금을 정하는 주인에게 보인다). 옛 서버면 없음 */
  readonly fair?: FairPriceView | undefined;
  /**
   * 지금 배 한 척 판매가(화폐 최소 단위 글자 — 주인이 정한 값, 없으면 적정가. "0" = 그 종류는 만들지 않음, 기획 대조 2057·2072). 주문자·주인 모두 이 값을
   * 조선소 금고에 낸다. 주인 없는 조선소·옛 서버면 없음
   */
  readonly price?: string | undefined;
  /** 주인이 판매가를 정했나(아니면 적정가로 판다) */
  readonly priceSet?: boolean | undefined;
}

/** 조선소 도크에 든 배(D-559 1523 — 다 만들거나 고친 배는 꺼낼 때까지 도크에 있다) */
export interface HarborDockedView {
  readonly boatId: number;
  readonly own: boolean;
  readonly typeId: string;
  readonly hullPm: number;
  /** 고치는 중이면 끝 시각, 다 됐으면 null(출고 기다림) */
  readonly repairUntil: number | null;
  /** 지금 꺼내면 낼 장기 보관료(남의 배만, 화폐 최소 단위 글자. 내 조선소의 내 배는 "0") */
  readonly storageDue: string;
  /** 압류 중(보관료가 밀림 — D-564 1686)과 배값(밀린 보관료가 넘으면 조선소 주인 것, 화폐 최소 단위 글자). 옛 서버면 없음 */
  readonly impounded?: boolean | undefined;
  readonly value?: string | undefined;
}

export interface HarborVisitView {
  readonly boatId: number;
  readonly own: boolean;
  readonly until: number;
}

/** 건물 판의 배 시설 칸 */
export interface HarborPanel {
  readonly role: HarborRole;
  /** 내구도가 기준 아래라 새 배·임시 정박을 받지 않는다(1500 가) */
  readonly closed: boolean;
  readonly access: HarborAccess;
  /** 정박장 = 하루 정박료, 교역 부두 = 한 시간 요금, 조선소 = 외주 요금(남의 배 수리 한 번 — 화폐 최소 단위) */
  readonly fee: number;
  /** 조선소: 첫 배 종류의 판매가(옛 판 기기용 — 종류마다 값은 types[].price, 기획 대조 2057). 옛 서버면 없음 */
  readonly orderFee?: string | undefined;
  /** 조선소 첫 모듈(없으면 null — 옛 판 기기용, 모듈 묶음은 modules) */
  readonly module: ShipyardModule | null;
  /** 조선소 모듈 묶음(자리 차례, D-559 1521) */
  readonly modules: readonly ShipyardModule[];
  /** 조선소 모듈 자리 수(레벨 2부터 레벨마다 하나) */
  readonly moduleSlots: number;
  /** 요금 화폐 코드(그 항구가 선 나라 화폐, D-559 1524) */
  readonly currency: string;
  /** 조선소: 남의 배 장기 보관료(하루), 보관료 없이 두는 시간(ms) */
  readonly storageFee: number;
  readonly storageFreeMs: number;
  /** 조선소: 도크 수 / 정박장: 정박 자리 / 교역 부두: 임시 자리 */
  readonly capacity: number;
  /** 쓰는 자리 수(조선소 = 만드는 작업 + 도크에 든 배, 정박장 = 집으로 둔 배 수, 교역 부두 = 머무는 배 수) */
  readonly used: number;
  /** 조선소: 도크에 든 배(고치는 중·출고 기다림) */
  readonly docked: readonly HarborDockedView[];
  readonly jobs: readonly HarborJobView[];
  readonly types: readonly HarborBoatTypeView[];
  /** 정박장: 이 정박장을 집으로 둔 배 */
  readonly boats: readonly HarborBoatView[];
  /** 교역 부두: 머무는 배 */
  readonly visits: readonly HarborVisitView[];
  /** 같은 2차맵의 내 배(정박·수리·시간 사기 단추). 남의 조선소도 받기 범위 안이면 [수리](D-559 1522) */
  readonly mine: readonly HarborBoatView[];
  /** 사업장 금고(주인에게만, 화폐 최소 단위 글자 — D-548). 남이 보면 null */
  readonly cash: string | null;
  /** 초과 시간 요금 배율(교역 부두, 설정 칸 trade_dock_overstay_mul) */
  readonly overstayMul: number;
  /** 한 번에 살 수 있는 시간 상한(설정 칸 trade_dock_max_hours) */
  readonly maxHours: number;
  /** 항구 옆 물자 거래소 건물(내리기·싣기가 그 창고를 쓴다 — D-570 1823). 없으면 null, 옛 서버면 없음 */
  readonly exchangeId?: number | null | undefined;
}

/** 조선소 배 판매가의 사업장 값 표 열쇠(business_prices item — 기획 대조 2057·2072, 프로토콜 51 business_price) */
export function boatPriceItem(typeId: string): string {
  return `boat:${typeId}`;
}

/** 값 표 열쇠가 배 판매가면 배 종류 ID, 아니면 undefined */
export function boatTypeOfPriceItem(item: string): string | undefined {
  return item.startsWith("boat:") ? item.slice(5) : undefined;
}
