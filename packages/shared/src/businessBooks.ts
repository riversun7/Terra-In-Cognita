// 사업장 장부 — 기획 D-548(사업장 수입은 사업장에 기록된다)·D-555(질문 1501~1514 답), docs/adr/2026-11-15-business-ledger.md.
// 서버(apps/server/src/business/)와 장부 화면이 같은 규칙을 쓴다.
// - 사업장 = 주인이 있는 시설·건물. 사업장 ID = 건물 ID. 사업장 금고 = (건물 주인, 화폐, 건물 위치), 사업장 창고 = 같은 위치의 물건 계정.
//   원장 위치는 @terra/shared/goodsPlaces buildingLocation 그대로다(새 위치 종류를 만들지 않는다).
// - 장부 칸: 원장 거래 종류(ledger_transactions.kind) → 칸. 새 수입 종류를 만들면 여기에 더한다(모르는 종류는 "그 밖").
// - 적자(D-555 1504): 사업장 금고가 모자라면 시스템 계정 debt:business:<건물>:<화폐>가 금고에 미리 넣고(잔고가 음수 = 갚을 돈) 다음 정산
//   주기에 금고에서 먼저 갚는다. 한 주기 안에 갚지 못하면 사업장이 멈춘다(서버).
// - 정산(D-555 1501): 금고 돈을 지분 수대로 나눠 주주 지갑으로. 지금은 사업장 지분이 주인 하나 = 1주다 [임시](질문 1621).
import { buildingLocation, cargoLocation } from "./goodsPlaces.ts";

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
  equipment_repair: "upkeep",
  // 적자 미리 넣기·갚기(D-555 1504)
  business_debt: "debt",
  business_repay: "debt",
  // 정산(주주에게, D-555 1501)·주인 넣기
  business_settle: "settlement",
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
      /** 지분(주주 — 지금은 주인 하나 1주 [임시]) */
      readonly holders: readonly { readonly kind: BookOwnerKind; readonly shares: string }[];
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
