// 가문세 — 기획 D-574 2150(사용자 답 "나 — 기부 + 가문원 수입의 일부를 가문세로", 세율은 가문장이 정한다 — 기획 해석, 수치는 설정값). 기획 대조
// 2222 확정(채우는 길 = 기부 + 가문세, 가입비는 금고 먼저·모자라면 가문장 지갑 그대로). docs/adr/2026-11-11-faction-identity.md "바뀜 (house-8, D-574)".
// - 세율: 표 house_policies.tax_pm(가문장이 house_tax로 정함, 줄이 없으면 0). 설정 칸 house_tax_max_pm보다 크면 읽을 때 상한으로 자른다.
// - 떼는 곳(기술 기본값 — 최소부터, 질문 2252): ① 사업장 배당(사업장 금고 정산 business_settle — 받는 주체가 가문원 사용자면 그 사람 가문 금고로)
//   ② 임금형 계약의 임금(labor_wage — 일한 유닛의 가문 D-569, 유닛 지갑 대신 그 몫을 가문 금고로). 기본 화폐(ASSET_CREDIT)만 뗀다(가문 금고 칸이
//   기본 화폐 잔고만 보인다 — 나라 화폐는 질문 2252). NPC 가문(npc_houses)은 세율이 없다(가문장이 정하는 규칙이 없다).
// - 세금 = 수입 × 세율 ÷ 1000(내림, 정수). 0이면 떼지 않는다. 떼는 쪽 원장 거래 하나에 줄을 더한다(새 거래 종류 없음 — 한 거래 안에서 0 합).
// - 표: 세계 저장 층의 원장(ledger)마다 하나(WeakMap). 배당·임금 코드는 원장만 들고 있어 원장으로 찾는다(houseTaxerOf). 가문 표가 붙기 전(서버를
//   켠 직후 첫 맞추기 전)에는 떼지 않는다.
import type { Ledger } from "../economy/ledger.ts";
import type { HouseTies } from "../world/houseTies.ts";
import type { OwnerRow, QueryPool } from "../world/persist/load.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import { vaultAccount } from "./houseVault.ts";

/** 떼는 몫: 가문 금고 계정과 세금 */
export interface HouseTaxCut {
  readonly account: number;
  readonly tax: bigint;
}

export interface HouseTaxer {
  /** 소유 주체(사용자)가 받는 수입의 가문세(가문원 사용자만). 없으면 undefined */
  ownerTax(ownerId: number, asset: string, amount: bigint): HouseTaxCut | undefined;
  /** 유닛 임금의 가문세(유닛의 가문 — 사이보그 본체는 주인의 가문, 고용 유닛은 고용할 때의 가문 D-569). 없으면 undefined */
  unitTax(unitId: number, ownerId: number, asset: string, amount: bigint): HouseTaxCut | undefined;
  /** 가문의 지금 세율(‰, 상한으로 자른 값) */
  rateOf(houseId: number): number;
  /** 세율을 바꾼다(명령이 DB에 쓴 뒤 — 메모리 표) */
  setRate(houseId: number, ratePm: number): void;
  /** DB에서 세율을 다시 읽는다 */
  reload(): Promise<void>;
}

/** 세금 = 수입 × 세율 ÷ 1000(내림). 0 이하·세율 0이면 0 */
export function houseTaxAmount(amount: bigint, ratePm: number): bigint {
  const rate = Math.min(1000, Math.max(0, Math.trunc(ratePm)));
  if (amount <= 0n || rate === 0) return 0n;
  return (amount * BigInt(rate)) / 1000n;
}

const taxers = new WeakMap<object, HouseTaxer>();

/** 그 원장의 가문세 표(가문 표가 붙기 전이면 undefined — 떼지 않는다) */
export function houseTaxerOf(ledger: object): HouseTaxer | undefined {
  return taxers.get(ledger);
}

/** 가문세 표를 만들어 원장에 붙인다(이미 있으면 그것). 처음 세율 읽기는 부르는 쪽이 reload로 */
export function attachHouseTax(o: {
  readonly pool: QueryPool;
  readonly ledger: Pick<Ledger, "systemAccount" | "balance" | "accounts">;
  readonly owners: ReadonlyMap<number, Pick<OwnerRow, "userId">>;
  readonly ties: () => Pick<HouseTies, "houseOfUser" | "unitHouseOf"> | undefined;
  /** 설정 칸 house_tax_max_pm(‰) — 부를 때마다 읽는다 */
  readonly maxPm: () => number;
}): HouseTaxer {
  const existing = taxers.get(o.ledger);
  if (existing) return existing;
  let rates = new Map<number, number>();
  const rateOf = (houseId: number): number =>
    Math.min(rates.get(houseId) ?? 0, Math.min(1000, Math.max(0, Math.trunc(o.maxPm()))));
  const cut = (houseId: number | undefined, asset: string, amount: bigint): HouseTaxCut | undefined => {
    if (houseId === undefined || asset !== ASSET_CREDIT) return undefined;
    const tax = houseTaxAmount(amount, rateOf(houseId));
    return tax > 0n ? { account: vaultAccount(o.ledger, houseId, asset), tax } : undefined;
  };
  const taxer: HouseTaxer = {
    ownerTax(ownerId, asset, amount) {
      const userId = o.owners.get(ownerId)?.userId ?? null;
      return userId === null ? undefined : cut(o.ties()?.houseOfUser(userId), asset, amount);
    },
    unitTax(unitId, ownerId, asset, amount) {
      const userId = o.owners.get(ownerId)?.userId ?? null;
      return userId === null ? undefined : cut(o.ties()?.unitHouseOf(unitId, userId), asset, amount);
    },
    rateOf,
    setRate(houseId, ratePm) {
      rates.set(houseId, Math.min(1000, Math.max(0, Math.trunc(ratePm))));
    },
    async reload() {
      const { rows } = await o.pool.query("select faction_id, tax_pm from house_policies where tax_pm > 0");
      rates = new Map(rows.map((row) => [Number(row.faction_id), Number(row.tax_pm)]));
    },
  };
  taxers.set(o.ledger, taxer);
  return taxer;
}
