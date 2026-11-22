// 사는 곳 집세·미리 내는 숙박비 — 사용자 결정 D-591 2(질문 2536 다: 둘 다 — 고른 숙소의 숙박비를 기간마다 미리 내고, 남의 주거 건물은 주인이 정한 집세를 세 든
// 유닛이 기간마다 미리 낸다. 집세는 그 건물 사업장 금고로. 일찍 바꾸면 남은 몫은 돌려받지 않는다 — 2486 가). docs/adr/2026-11-15-business-ledger.md
// "바뀜 (residence-3, D-591)".
// - 주인 집세: 표 residence_rents(건물마다 한 줄 — 한 기간 집세). 정할 때의 주인이 지금 건물 주인일 때만 쓴다(주인이 바뀌면 세를 놓지 않은 것으로 본다).
// - 한 기간 = 설정 칸 residence_rent_period_ms([임시] 하루 — 질문 2672). 값: rent = 주인이 정한 집세, lodging = 그 기간에 드는 밤 수 × 하룻밤 숙박비(일꾼 쉼터와
//   같은 셈 — labor/workerRest.ts periodFee), own = 0. 화폐 = 숙박비와 같은 서버 시험 화폐 [임시](질문 2673).
// - 내는 쪽: 그 유닛의 지갑(사유재산 — @terra/shared/businessBooks unitPurseLocation, D-097·D-555 1507). 받는 쪽: 그 건물 사업장 금고(BusinessCore.receive — 들어올 때
//   소득세, 거래 종류 residence_rent·lodging_prepay → 장부 "수입" 칸).
// - 고를 때(서비스) 첫 기간을 바로 낸다(모자라면 insufficient_funds). 그 뒤는 1분 훑기(renewResidenceRents — attach.ts가 쉼 훑기 바로 전에 부른다)가 낸 기간이 끝난
//   고른 것마다 다음 기간을 걷는다. 모자라면 걷지 않고 그 고른 것은 쉰다(옛 길 숙소 배정 + 처리할 일 residence_paused). 돈이 생기면 다음 훑기에 다시 걷어 이어 산다.
// - 미리 낸 숙소 몫이 덮는 동안 일꾼 쉼터는 그 숙소 숙박비를 밤마다 다시 걷지 않는다(labor/workerRest.ts — book.prepaidAt).
// - 바뀜(npc-rent, 질문 2674 — D-555 1509 "똑같이"): NPC 휴먼도 세를 놓은 남의 집을 골라 같은 길(미리 냄·금고·정원·못 내면 쉼, 빚 없음)로 세 든다. 고르기·값
//   셈(그 도시 나라 화폐)은 npcRent.ts. NPC 숙소 숙박비(하루 끝 npc/npcWages.ts)는 그대로다.
import type { QueryPool } from "../world/persist/load.ts";
import type { ResidenceBook, ResidenceChoice, ResidencePay } from "./book.ts";

/** 설정 칸이 없을 때(옛 팩) 한 기간(ms) — [임시] 기술 기본값 */
export const DEFAULT_RESIDENCE_RENT_PERIOD_MS = 86_400_000;

/** 주인이 내놓은 집세 한 줄(표 residence_rents) */
export interface ResidenceRent {
  readonly buildingId: number;
  readonly ownerId: number;
  readonly rent: bigint;
  readonly setAtMs: number;
}

export async function loadResidenceRents(pool: QueryPool): Promise<ResidenceRent[]> {
  const { rows } = await pool.query(
    "select building_id, owner_id, rent, set_at_ms from residence_rents order by building_id",
  );
  return rows.map((row) => ({
    buildingId: Number(row.building_id),
    ownerId: Number(row.owner_id),
    rent: BigInt(String(row.rent)),
    setAtMs: Number(row.set_at_ms),
  }));
}

export async function saveResidenceRent(pool: QueryPool, rent: ResidenceRent): Promise<void> {
  await pool.query(
    `insert into residence_rents (building_id, owner_id, rent, set_at_ms) values ($1, $2, $3, $4)
     on conflict (building_id) do update set owner_id = excluded.owner_id, rent = excluded.rent, set_at_ms = excluded.set_at_ms`,
    [rent.buildingId, rent.ownerId, rent.rent.toString(), rent.setAtMs],
  );
}

export async function deleteResidenceRent(pool: QueryPool, buildingId: number): Promise<void> {
  await pool.query("delete from residence_rents where building_id = $1", [buildingId]);
}

/** 미리 낸 기간 끝을 적는다(다음 기간을 걷은 뒤) */
export async function markResidencePaid(pool: QueryPool, unitId: number, paidUntilMs: number): Promise<void> {
  await pool.query("update unit_residences set paid_until_ms = $2 where unit_id = $1", [unitId, paidUntilMs]);
}

/** 주인 집세 장부(메모리 — 표를 부팅 때 읽는다) */
export interface RentTable {
  load(rows: readonly ResidenceRent[]): void;
  /** 지금 주인이 내놓은 집세(정할 때의 주인이 아니면 null) */
  rentOf(buildingId: number, currentOwner: number | null): bigint | null;
  /** 그 건물 줄(주인 확인 전 — 화면이 쓴다) */
  rowOf(buildingId: number): ResidenceRent | undefined;
  /** 모든 줄(건물 ID 차례 — NPC 세 들기 훑기가 세를 놓은 집을 모은다, npcRent.ts) */
  all(): ResidenceRent[];
  put(row: ResidenceRent): void;
  remove(buildingId: number): void;
}

export function createRentTable(): RentTable {
  const rows = new Map<number, ResidenceRent>();
  return {
    load(list) {
      rows.clear();
      for (const row of list) rows.set(row.buildingId, row);
    },
    rentOf(buildingId, currentOwner) {
      const row = rows.get(buildingId);
      return row && currentOwner !== null && row.ownerId === currentOwner ? row.rent : null;
    },
    rowOf: (buildingId) => rows.get(buildingId),
    all: () => [...rows.values()].toSorted((a, b) => a.buildingId - b.buildingId),
    put(row) {
      rows.set(row.buildingId, row);
    },
    remove(buildingId) {
      rows.delete(buildingId);
    },
  };
}

/** 집세를 걷는 데 쓰는 세계 몫(attach.ts가 원장·사업장 장부·일꾼 쉼터로 만든다) */
export interface RentPayer {
  /** 한 기간(ms) */
  periodMs(): number;
  /** 그 유닛이 이 집에서 한 기간 낼 값(own = 0n). 셀 수 없으면 undefined(걷지 않는다) */
  priceOf(unitId: number, buildingId: number, kind: ResidencePay): bigint | undefined;
  /** 유닛 지갑 잔고 */
  purseBalance(ownerId: number, unitId: number): bigint;
  /** 유닛 지갑 → 그 건물 금고(소득세 포함). 걷었으면 true */
  pay(input: {
    readonly ownerId: number;
    readonly unitId: number;
    readonly buildingId: number;
    readonly amount: bigint;
    readonly kind: ResidencePay;
    readonly atMs: number;
  }): boolean;
}

/** 원장 거래 종류(장부 "수입" 칸 — @terra/shared/businessBooks) */
export const RENT_TX_KIND: Readonly<Record<Exclude<ResidencePay, "own">, string>> = {
  rent: "residence_rent",
  lodging: "lodging_prepay",
};

export type ChargeOutcome =
  | { readonly ok: true; readonly paidUntilMs: number | null; readonly amount: bigint }
  | { readonly ok: false; readonly code: "insufficient_funds" | "not_eligible" };

/**
 * 한 기간 값을 걷는다(고를 때·다시 걷을 때). own이면 걷지 않고 paidUntilMs null. 값을 셀 수 없으면 not_eligible, 지갑이 모자라면 insufficient_funds(아무것도
 * 바꾸지 않는다). 0이면 걷지 않고 기간만 연다
 */
export function chargeResidence(
  payer: RentPayer,
  input: {
    readonly ownerId: number;
    readonly unitId: number;
    readonly buildingId: number;
    readonly kind: ResidencePay;
    readonly atMs: number;
  },
): ChargeOutcome {
  if (input.kind === "own") return { ok: true, paidUntilMs: null, amount: 0n };
  const amount = payer.priceOf(input.unitId, input.buildingId, input.kind);
  if (amount === undefined || amount < 0n) return { ok: false, code: "not_eligible" };
  const paidUntilMs = input.atMs + Math.max(1, Math.trunc(payer.periodMs()));
  if (amount === 0n) return { ok: true, paidUntilMs, amount };
  if (payer.purseBalance(input.ownerId, input.unitId) < amount)
    return { ok: false, code: "insufficient_funds" };
  if (!payer.pay({ ...input, amount })) return { ok: false, code: "not_eligible" };
  return { ok: true, paidUntilMs, amount };
}

/**
 * 낸 기간이 끝난 고른 것마다 다음 기간을 걷는다(1분 훑기 — 머리 주석). 다른 조건이 깨졌거나(renewable) 내 집이면 걷지 않는다. 걷은 유닛 수
 */
export async function renewResidenceRents(
  book: ResidenceBook,
  payer: RentPayer,
  pool: QueryPool | undefined,
  nowMs: number,
): Promise<number> {
  let renewed = 0;
  for (const choice of book.all()) {
    if (book.prepaidAt(choice.unitId, choice.buildingId, nowMs)) continue;
    if (!book.renewable(choice.unitId)) continue;
    const kind = book.payKindOf(choice.unitId, choice.ownerId, choice.buildingId);
    if (kind === null || kind === "own") continue;
    const outcome = chargeResidence(payer, {
      ownerId: choice.ownerId,
      unitId: choice.unitId,
      buildingId: choice.buildingId,
      kind,
      atMs: nowMs,
    });
    if (!outcome.ok || outcome.paidUntilMs === null) continue;
    await keepPaid(book, pool, choice, outcome.paidUntilMs);
    renewed += 1;
  }
  return renewed;
}

async function keepPaid(
  book: ResidenceBook,
  pool: QueryPool | undefined,
  choice: ResidenceChoice,
  paidUntilMs: number,
): Promise<void> {
  // 돈은 이미 옮겼다 — 메모리를 먼저 적어 표 쓰기가 실패해도 다음 훑기가 다시 걷지 않게 한다(다시 켜면 표 값으로)
  book.put({ ...choice, paidUntilMs });
  if (pool) await markResidencePaid(pool, choice.unitId, paidUntilMs);
}
