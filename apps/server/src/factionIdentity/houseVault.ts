// 가문 금고 — 기획 D-338(사용자 선택: 독재의 지배 가문 지분은 "지배 가문의 사유 자산", 남은 이익은 "지배 가문 금고"로 — "국고" 대안은 기각)·
// D-213(도시가 없어도 세력/가문은 창설 가능 → 도시 없는 가문에도 금고가 있다)·D-573(가문 이동 가입비는 가문장 또는 가문 금고가 한꺼번에, 지원금도
// 가문이 받는다). 질문 2150 → 고침(fixes-1116l): 가문 금고는 국고(가문 소유 주체 계정)와 따로다.
// - 금고 = 원장 시스템 계정 vault:house:<가문 세력 행 ID>:<자산>(사업장 적자 debt:business:…·노동 보증금 escrow:labor:…와 같은 꼴 — 원장 표·코어를
//   바꾸지 않는다). 소유 주체(world_owners)를 새로 만들지 않는다: 가문 소유 주체는 "도시를 얻어 거울 세계에 들인 가문"의 국고라는 뜻으로 이미 쓰이고
//   (houseCity.ts·npc/houseRuntime.ts), 도시 없는 가문에는 주체가 없다.
// - 시스템 계정은 장부가 0 아래를 막지 않는다 → 금고에서 꺼내는 쪽(vaultTake)이 잔고까지만 꺼낸다. 불변 조건 검사가 음수 금고를 본다(world/invariants.ts).
// - 계정은 처음 넣을 때 만든다. 읽기는 만들지 않는다(없으면 0 — 가문마다 빈 계정 줄이 생기지 않게).
// - 채우는 길: 가문 이동 지원금(houseEntry.ts), 독재 가문 나라의 남은 이익 국고 몫(D-338, rulingVaultOf → @terra/sim payCityProfit). 바뀜(house-8,
//   D-574 2150 나·기획 대조 2222 확정): 가문원 기부(housePolicy.ts)와 가문세(houseTax.ts — 임금·사업장 배당). 금고에서 꺼내는 길·해산 때 금고 돈은
//   사용자에게 묻는 중이라 없다.
import type { Ledger } from "../economy/ledger.ts";

/** 가문 금고 시스템 계정 앞머리 */
export const HOUSE_VAULT_PREFIX = "vault:house:";

/** 가문 금고 시스템 계정 코드(자산마다 계정 하나 — 시스템 코드가 계정 하나를 가리킨다) */
export const houseVaultCode = (houseId: number, asset: string): string =>
  `${HOUSE_VAULT_PREFIX}${houseId}:${asset}`;

/** 시스템 코드가 가문 금고면 가문 세력 행 ID·자산 */
export function parseHouseVaultCode(code: string): { houseId: number; asset: string } | undefined {
  const match = /^vault:house:(\d+):(.+)$/.exec(code);
  if (!match) return undefined;
  return { houseId: Number(match[1]), asset: match[2] ?? "" };
}

/** 금고 읽기·넣기·꺼내기가 쓰는 원장 몫 */
export type VaultLedger = Pick<Ledger, "systemAccount" | "balance" | "accounts">;

/** 찾은 시스템 계정 ID(코드 → ID, 원장마다). 계정 ID는 바뀌지 않는다 */
const found = new WeakMap<object, Map<string, number>>();

/** 그 코드의 시스템 계정(없으면 undefined — 만들지 않는다) */
function findSystemAccount(ledger: VaultLedger, code: string): number | undefined {
  let known = found.get(ledger);
  if (!known) {
    known = new Map();
    found.set(ledger, known);
  }
  const hit = known.get(code);
  if (hit !== undefined) return hit;
  for (const account of ledger.accounts())
    if (account.systemCode === code) {
      known.set(code, account.id);
      return account.id;
    }
  return undefined;
}

/** 가문 금고 잔고(계정이 없으면 0) */
export function vaultBalance(ledger: VaultLedger, houseId: number, asset: string): bigint {
  const account = findSystemAccount(ledger, houseVaultCode(houseId, asset));
  if (account === undefined) return 0n;
  const balance = ledger.balance(account);
  return balance > 0n ? balance : 0n;
}

/** 가문 금고 계정 ID(없으면 만든다 — 넣을 때만 부른다) */
export function vaultAccount(ledger: VaultLedger, houseId: number, asset: string): number {
  const code = houseVaultCode(houseId, asset);
  const id = ledger.systemAccount(code, asset);
  found.get(ledger)?.set(code, id);
  return id;
}

/** 꺼낼 수 있는 양(잔고까지만 — 시스템 계정이라 장부가 막지 않는다) */
export const vaultTake = (ledger: VaultLedger, houseId: number, asset: string, asked: bigint): bigint => {
  const balance = vaultBalance(ledger, houseId, asset);
  return asked < balance ? (asked > 0n ? asked : 0n) : balance;
};

/**
 * 독재 나라의 남은 이익 국고 몫을 받을 지배 가문 금고 계정(D-338 — @terra/sim SimHooks.rulingVaultOf). 플레이어 가문 나라(도시를 가진 가문 — 지배
 * 가문 = 그 가문 자신, 질문 2012 답)는 그 가문 금고. faction.id = 소유 주체 ID(서버 거울 세계), owners = 소유 주체 → 세력 행.
 * NPC 나라는 여기서 undefined — 바뀜(house-8, 기획 대조 2223 고침): NPC 지배 가문 금고는 npc/rulingVault.ts가 이 고리 뒤에 얹는다(vault:house:npc:…,
 * 성향 몫은 국고로 돌려보냄)
 */
export function rulingVaultOf(
  ledger: VaultLedger,
  owners: ReadonlyMap<number, { readonly factionId: number | null }>,
  faction: { readonly id: number; readonly player?: true | undefined },
  asset: string,
): number | undefined {
  if (!faction.player) return undefined;
  const rowId = owners.get(faction.id)?.factionId ?? null;
  return rowId === null ? undefined : vaultAccount(ledger, rowId, asset);
}
