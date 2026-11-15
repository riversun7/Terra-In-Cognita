// 사업장 장부 — 기획 D-548(사업장 수입은 사업장에 기록된다)·D-555(질문 1501~1514 답), docs/adr/2026-11-15-business-ledger.md.
// 서버(apps/server/src/business/)와 장부 화면이 같은 규칙을 쓴다.
// - 사업장 = 주인이 있는 시설·건물. 사업장 ID = 건물 ID. 사업장 금고 = (건물 주인, 화폐, 건물 위치), 사업장 창고 = 같은 위치의 물건 계정.
//   원장 위치는 @terra/shared/goodsPlaces buildingLocation 그대로다(새 위치 종류를 만들지 않는다).
// - 장부 칸: 원장 거래 종류(ledger_transactions.kind) → 칸. 새 수입 종류를 만들면 여기에 더한다(모르는 종류는 "그 밖").
// - 적자(D-555 1504): 사업장 금고가 모자라면 시스템 계정 debt:business:<건물>:<화폐>가 금고에 미리 넣고(잔고가 음수 = 갚을 돈) 다음 정산
//   주기에 금고에서 먼저 갚는다. 한 주기 안에 갚지 못하면 사업장이 멈춘다(서버).
// - 정산(D-555 1501): 금고 돈을 지분 수대로 나눠 주주 지갑으로.
// - 바뀜 (2026-11-15, 건물 화면 개편 — docs/adr/2026-11-15-building-screen.md): 지분은 원장 자산 share:biz_<건물>이다(D-130 기술 전달
//   "주식·지분은 원장의 자산 종류"). 처음 사고팔 때 주인에게 설정 칸 business_share_count만큼 발행하고(시스템 계정 issue:share:biz_<건물>),
//   발행 전에는 주인이 모두 가진 것으로 본다. 주주 = 그 자산 잔고(+ 동시호가에 걸어 둔 팔 주문)를 가진 주체다.
import { buildingLocation, cargoLocation } from "./goodsPlaces.ts";
import type { LocalizedName } from "./roster.ts";

/** 사업장 지분 자산 코드(원장 자산 코드 꼴 앞머리:ID — ledger_accounts_asset_format에 맞는다) */
export function businessShareAsset(buildingId: number): string {
  return `share:biz_${buildingId}`;
}

/** 자산 코드가 사업장 지분이면 건물 ID, 아니면 undefined */
export function parseBusinessShareAsset(asset: string): number | undefined {
  const match = /^share:biz_(\d+)$/.exec(asset);
  return match ? Number(match[1]) : undefined;
}

/** 지분 자산인가(지갑·물건 목록에서 뺀다 — 화폐도 물건도 아니다) */
export function isShareAsset(asset: string): boolean {
  return asset.startsWith("share:");
}

/** 사업장 지분 발행 시스템 계정 코드(잔고 음수 = 발행 수) */
export function businessShareIssueCode(buildingId: number): string {
  return `issue:share:biz_${buildingId}`;
}

/** 지분 동시호가 에스크로·거래 종류 앞머리(@terra/sim createFxMarket prefix — 환전 fx와 겹치지 않게) */
export const SHARE_MARKET_PREFIX = "share";

/** 지분 몫(‰, 내림). 전체가 0 이하면 0 */
export function sharePm(shares: bigint, total: bigint): number {
  if (total <= 0n || shares <= 0n) return 0;
  return Number((shares * 1000n) / total);
}

/** 사업장 금고·창고의 원장 위치(= 건물 위치, 읽는 사람을 위한 다른 이름) */
export const businessLocation = buildingLocation;

/**
 * 유닛 사유재산(D-097 "경제활동시 화폐는 휴먼의 사유재산") 지갑 위치 = 그 유닛 화물 위치. 계정 = (유닛 주인, 화폐, 이 위치) — 유닛이 지니는 돈.
 * 숙박비를 여기서 내고(D-555 1508), 주인은 선물(unit_gift)로 넣을 수 있다. 주인 명령으로 꺼내는 길은 없다
 */
export const unitPurseLocation = cargoLocation;

/** 사업장 적자 시스템 계정 코드(잔고 음수 = 갚을 돈) */
export function businessDebtCode(buildingId: number, asset: string): string {
  return `debt:business:${buildingId}:${asset}`;
}

/** 시스템 계정 코드가 사업장 적자면 건물 ID·화폐, 아니면 undefined */
export function parseBusinessDebtCode(code: string): { buildingId: number; asset: string } | undefined {
  const match = /^debt:business:(\d+):(.+)$/.exec(code);
  if (!match) return undefined;
  return { buildingId: Number(match[1]), asset: match[2] ?? "" };
}

/** 장부 칸 */
export const BOOK_COLUMNS = [
  "income",
  "sales",
  "tax",
  "wages",
  "upkeep",
  "lodging",
  "debt",
  "settlement",
  "invest",
  "goods",
  "other",
] as const;
export type BookColumn = (typeof BOOK_COLUMNS)[number];

/** 고정 종류 → 칸 */
const COLUMN_OF: Readonly<Record<string, BookColumn>> = {
  // 수입(요금·임대료) — 남이 낸 돈과 주인이 제 시설에 낸 돈(D-555 1514) 모두
  lodging_fee: "income",
  labor_rent: "income",
  temple_offering: "income",
  hospital_treat: "income",
  gene_incubate: "income",
  gene_convert: "income",
  berth_fee: "income",
  berth_visit_fee: "income",
  dock_time_fee: "income",
  dock_overstay_fee: "income",
  tuition: "income",
  // 판매(사업장 창고에서 판 것 — 주인이 꺼낼 때도 값을 낸다, D-555 1507)
  business_sale: "sales",
  // 소득세(들어올 때, D-555 1503)
  business_tax: "tax",
  // 임금 보증금·채우기·돌려받기(D-555 1504)
  labor_deposit: "wages",
  labor_refund: "wages",
  // 유지 재료(D-555 1505 — 사업장 창고 먼저)
  facility_repair: "upkeep",
  facility_upgrade: "upkeep",
  // 면적 모듈 붙이기(건물 채집소, D-567)
  facility_plot: "upkeep",
  equipment_repair: "upkeep",
  // 적자 미리 넣기·갚기(D-555 1504)
  business_debt: "debt",
  business_repay: "debt",
  // 정산(주주에게, D-555 1501)·주인 넣기
  business_settle: "settlement",
  // 사업장 창고 물건이 산 사람에게 넘어감(돈은 business_sale)
  business_sale_goods: "goods",
  business_invest: "invest",
  // 물건 들고 남(돈이 아닌 자산은 아래 isMoney가 "goods"로 고른다)
  storage_move: "goods",
  station_haul: "goods",
  station_haul_load: "goods",
  gather_deposit: "goods",
  job_output: "goods",
  labor_leftovers: "goods",
};

/** 신전 의식 종류(temple_<의식>)도 수입 */
export function bookColumnOf(kind: string, money: boolean): BookColumn {
  if (!money) return "goods";
  const fixed = COLUMN_OF[kind];
  if (fixed !== undefined) return fixed;
  if (kind.startsWith("temple_")) return "income";
  return "other";
}

/** 이익에 드는 칸인가(정산·넣기·적자·물건은 자본·자리 이동이라 빼고 본다) */
export function countsForProfit(column: BookColumn): boolean {
  return (
    column === "income" ||
    column === "sales" ||
    column === "tax" ||
    column === "wages" ||
    column === "upkeep" ||
    column === "lodging" ||
    column === "other"
  );
}

/** 소득세 = 받은 돈 × 만분율(내림). 음수·0은 0 */
export function incomeTaxOf(gross: bigint, taxBp: number): bigint {
  if (gross <= 0n || taxBp <= 0) return 0n;
  return (gross * BigInt(Math.trunc(taxBp))) / 10_000n;
}

/** 주주 한 명 */
export interface ShareHolder {
  readonly ownerId: number;
  readonly shares: bigint;
}

/**
 * 돈을 지분 수대로 나눈다(D-555 1501). 몫 = ⌊돈 × 지분 ÷ 전체 지분⌋, 남은 최소 단위는 나머지가 큰 주주부터(같으면 작은 ID) 하나씩.
 * 지분이 없거나 돈이 0 이하면 빈 표. 합은 늘 돈과 같다
 */
export function splitByShares(amount: bigint, holders: readonly ShareHolder[]): Map<number, bigint> {
  const out = new Map<number, bigint>();
  const live = holders.filter((holder) => holder.shares > 0n).toSorted((a, b) => a.ownerId - b.ownerId);
  const total = live.reduce((sum, holder) => sum + holder.shares, 0n);
  if (amount <= 0n || total <= 0n) return out;
  let given = 0n;
  const rest: { ownerId: number; remainder: bigint }[] = [];
  for (const holder of live) {
    const raw = amount * holder.shares;
    const part = raw / total;
    out.set(holder.ownerId, (out.get(holder.ownerId) ?? 0n) + part);
    given += part;
    rest.push({ ownerId: holder.ownerId, remainder: raw % total });
  }
  rest.sort((a, b) =>
    a.remainder === b.remainder ? a.ownerId - b.ownerId : a.remainder > b.remainder ? -1 : 1,
  );
  let left = amount - given;
  for (const entry of rest) {
    if (left <= 0n) break;
    out.set(entry.ownerId, (out.get(entry.ownerId) ?? 0n) + 1n);
    left -= 1n;
  }
  return out;
}

/** 가장 많은 지분을 가진 주주들(대주주 — 정산할 수 있는 사람, D-555 1502). 같으면 모두 */
export function majorHolders(holders: readonly ShareHolder[]): number[] {
  let top = 0n;
  for (const holder of holders) if (holder.shares > top) top = holder.shares;
  if (top <= 0n) return [];
  return holders
    .filter((holder) => holder.shares === top)
    .map((holder) => holder.ownerId)
    .toSorted((a, b) => a - b);
}

/** 지금 시각이 든 정산 주기의 시작(UTC 0시 기준 같은 간격, NPC 하루 끝과 맞는다). 주기가 0 이하면 undefined */
export function settleBoundary(nowMs: number, periodMs: number): number | undefined {
  if (!(periodMs > 0)) return undefined;
  return Math.floor(nowMs / periodMs) * periodMs;
}

// ---------- 장부 조회 응답(tRPC facilities.books) ----------

/** 화폐 잔고 한 줄 */
export interface BookBalance {
  readonly asset: string;
  readonly amount: string;
}

/** 칸마다 합(화폐 최소 단위 글자, 부호 = 금고 쪽에서 본 들고 남) */
export interface BookTotals {
  readonly asset: string;
  readonly columns: Readonly<Partial<Record<BookColumn, string>>>;
  /** 이익 = 이익 칸 합 */
  readonly profit: string;
}

/** 날 하나의 막대(수입 = 양수 칸 합, 지출 = 음수 칸 합의 절댓값, 이익 칸만) */
export interface BookDay {
  readonly dayMs: number;
  readonly asset: string;
  readonly income: string;
  readonly spend: string;
}

/** 최근 거래 한 줄 */
export interface BookEntry {
  readonly txId: number;
  readonly atMs: number;
  readonly kind: string;
  readonly column: BookColumn;
  readonly asset: string;
  /** 부호 있는 양(금고·창고 쪽) */
  readonly amount: string;
}

/** 창고 물건 한 줄 */
export interface BookGoods {
  readonly asset: string;
  readonly qty: string;
  /** 사업장 판매 값(최소 단위, 1개). 팔지 않으면 null */
  readonly price: string | null;
  /** 이름(팩 아이템 이름, 모르면 null) */
  readonly name: { readonly ko: string; readonly en: string } | null;
}

export type BookOwnerKind = "me" | "player" | "npc";

/** 주주 한 줄(보는 사람 기준 종류·이름·지분) */
export interface BookHolder {
  readonly kind: BookOwnerKind;
  readonly shares: string;
  /** 이름(유저 = 사이보그 이름, NPC 세력 = 나라 이름). 모르면 null — 이름 칸이 없는 옛 응답에는 없다 */
  readonly name?: LocalizedName | null | undefined;
  /** 지분 몫(‰) */
  readonly pm?: number | undefined;
}

/** 지분 동시호가 회차 하나 */
export interface ShareRoundView {
  readonly atMs: number;
  /** 체결가(1주 값, 화폐 최소 단위). 체결이 없었으면 null */
  readonly price: string | null;
  readonly shares: string;
}

/** 내 걸린 지분 주문 */
export interface ShareOrderView {
  readonly id: number;
  readonly side: "buy" | "sell";
  /** 1주 값(살 쪽 상한·팔 쪽 하한) */
  readonly price: string;
  readonly shares: string;
}

/**
 * 사업장 지분 시장(생산시설 지분 동시호가 — 기획 44 §6·D-125·D-130, docs/adr/2026-11-15-building-screen.md). 지금은 사업장마다 서버의 지분 시장
 * 모음이 돌리고, 증권 거래소 건물(D-561)이 생기면 그 건물이 이 시장을 맡는다
 */
export interface ShareMarketView {
  /** 값을 매기는 화폐(원장 자산 — 사업장 금고 화폐와 같다) */
  readonly asset: string;
  /** 발행했나(발행 전에는 주인이 모두 가진 것으로 본다) */
  readonly issued: boolean;
  readonly total: string;
  readonly lastPrice: string | null;
  readonly roundMs: number;
  readonly nextRoundMs: number;
  /** 이번 회차에 걸린 살·팔 지분 합(누구 것인지는 보이지 않는다) */
  readonly bidShares: string;
  readonly askShares: string;
  /** 보는 사람의 지분·지갑(그 화폐)·걸린 주문 */
  readonly myShares: string;
  readonly myCash: string;
  readonly myOrders: readonly ShareOrderView[];
  /** 한 사람이 한 회차에 걸어 둘 수 있는 주문 수(모든 사업장 합) */
  readonly orderMax: number;
  /** 최근 회차(오래된 차례, 체결 없는 회차는 빼고 최근 24개) */
  readonly rounds: readonly ShareRoundView[];
}

export type BusinessBooksResponse =
  | { readonly status: "not_ready" | "not_business" }
  | {
      readonly status: "ok";
      readonly buildingId: number;
      readonly facilityId: string | null;
      readonly facilityName: { readonly ko: string; readonly en: string } | null;
      /** 주인 종류(me = 보는 사람, npc = NPC 세력, player = 다른 플레이어 — 장부는 모두에게 공개, D-555 1513) */
      readonly ownerKind: BookOwnerKind;
      /** 보는 사람이 주인(대주주)인가 — 정산·넣기·값 정하기 단추 */
      readonly mine: boolean;
      /** 지분(주주, 많은 차례 — 발행 전이면 주인 하나가 발행 수 전부) */
      readonly holders: readonly BookHolder[];
      /** 주인 이름(유저 = 사이보그 이름, NPC = 나라 이름). 모르면 null(옛 응답에는 없다) */
      readonly ownerName?: LocalizedName | null | undefined;
      /** 창고 물건 값 합(물건 × 판매 값, 팔지 않는 물건은 기준 값 — 금고 화폐). 옛 응답에는 없다 */
      readonly stockValue?: string | undefined;
      /** 지분 시장(옛 응답에는 없다) */
      readonly market?: ShareMarketView | undefined;
      readonly vault: readonly BookBalance[];
      /** 갚을 돈(적자, 화폐별 양수) */
      readonly debt: readonly BookBalance[];
      /** 적자가 생긴 시각(없으면 null)·멈춘 시각(멈추지 않았으면 null) */
      readonly debtSinceMs: number | null;
      readonly suspendedAtMs: number | null;
      readonly goods: readonly BookGoods[];
      /** 다음 자동 정산 시각(끔이면 null) */
      readonly nextSettleMs: number | null;
      /** 소득세 만분율(도시 나라 세율, 모르면 0) */
      readonly taxBp: number;
      /** 판매 최소 묶음(B2B, D-555 1507)·이 도시가 낱개 판매(소매)를 받나 */
      readonly minLot: number;
      readonly retail: boolean;
      readonly fromMs: number;
      readonly toMs: number;
      /** 이 사업장의 첫 장부 항목 시각(없으면 null — 배포 전 수입은 지갑에 남았다) */
      readonly firstMs: number | null;
      readonly totals: readonly BookTotals[];
      readonly days: readonly BookDay[];
      readonly entries: readonly BookEntry[];
    };

// ---------- 건물 주인 이름표(tRPC facilities.owner — 건물 판 머리) ----------

/**
 * 건물 판 머리의 주인 이름표(사용자 요청 2026-11-15 "남의 건물이 아니라 소유 유닛이름이나 대주주 이름"). 지분을 나눴으면 가장 많은 주주의 이름·몫을
 * 보인다. canManage = 보는 사람이 주인·대주주(운영자 모드는 기기가 따로 더한다 — 서버가 명령마다 다시 본다)
 */
export type BuildingOwnerResponse =
  | { readonly status: "not_ready" | "unknown_building" }
  | {
      readonly status: "ok";
      readonly buildingId: number;
      /** 주인 없음(폐허 등)이면 null */
      readonly ownerKind: BookOwnerKind | null;
      readonly ownerName: LocalizedName | null;
      readonly mine: boolean;
      /** 가장 많은 주주(주인과 다르거나 지분을 나눴을 때 보인다). 사업장이 아니거나 주인 하나가 모두 가지면 null */
      readonly top: {
        readonly kind: BookOwnerKind;
        readonly name: LocalizedName | null;
        readonly pm: number;
      } | null;
      /** 보는 사람의 지분 몫(‰, 없으면 0) */
      readonly myPm: number;
      readonly canManage: boolean;
      /** 사업장(시설 줄이 있는 건물)인가 — 장부·지분 칸 */
      readonly business: boolean;
    };
