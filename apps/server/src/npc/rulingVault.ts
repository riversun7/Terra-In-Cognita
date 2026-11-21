// NPC 지배 가문 금고 — 기획 대조 2223 고침(2026-11-16): D-338 "도시 세금의 남은 이익은 지배 가문 금고로"·D-555 1509 "NPC만으로도 똑같이"·
// D-574(지배 가문 = 수도에서 처음 세운 가문). fixes-1116l은 NPC 나라의 남은 이익 국고 몫을 국고에 남겼다(쓰는 규칙이 없어 돈이 멈추므로) — 이를
// 대신한다. docs/adr/2026-11-11-faction-identity.md "바뀜 (house-8, D-574)".
// - 독재 NPC 나라: 남은 이익의 국고 몫 → 그 나라 지배 가문(npc/cityHouses.ts rulingHouseOf — NPC 가문 ID)의 금고(원장 시스템 계정
//   vault:house:npc:<NPC 가문 ID>:<자산> — 플레이어 가문 금고와 같은 앞머리라 불변 조건 검사 "금고 0 아래"가 함께 본다). 지배 가문이 없으면(수도에
//   가문이 아직 없음) 옛 동작대로 국고에 남긴다.
// - 금고를 쓰는 규칙(D-554 "세력 성향마다 다양한 변수", 설정 칸): 배당 차례가 끝나면 금고 잔고의 몫(‰ — 상업 성향이 낮을수록 많이,
//   @terra/sim npcRulingVaultReturnPm, 설정 칸 house_npc_vault_return_min_pm·max_pm)을 국고로 돌려보낸다(국고 지원 — 국고가 마르지 않는 길).
//   나머지는 가문 금고에 쌓인다.
// - 바뀜(house-9, 질문 2255 다안 — 기획 D-576 "가문장이 개인 지갑으로 꺼낼 수 있다"를 NPC에도, D-555 1509·D-212, 쓰는 몫은 D-554 성향): 돌려보낸
//   뒤 남은 금고 × 꺼내기 몫을 가문장(지배 가문 = 국가 지도자 유닛)이 자기 유닛 지갑(@terra/shared/businessBooks unitPurseLocation — NPC 휴먼 지갑과
//   같은 계정 꼴)으로 꺼내고(npc_house_vault_take), 꺼낸 돈에서 가문원 배당(신앙 성향 — 지배 가문원 휴먼 지갑에 똑같이, npc_house_dividend)·도시
//   건설 투자(상업 성향 — 나라 국고에 건설 자금으로, NPC 증축은 국고로 짓는다, npc_house_invest)를 낸다. 나머지는 가문장 지갑에 남는다(사치·저축).
//   규칙식은 rulingSpend.ts. 가문장이 없으면 꺼내지 않는다(옛 동작).
// - 바뀜(house-10, 기획 대조 2312 나 — D-555 1510): 도시 건설 투자는 그 지배 가문 도시(수도)의 그 나라 사업장 금고로(국고를 거쳐 business invest — 적자가
//   있으면 먼저 갚는다). 나누기는 금고가 가장 모자란 곳부터 고르게(rulingSpend.ts splitInvest). NPC 사업장 장부(business_npc_books)가 꺼져 있거나 그 도시에
//   사업장이 없으면 국고에 남는다(옛 길).
// - 플레이어 가문 나라는 그대로(factionIdentity/houseVault.ts rulingVaultOf — 그 가문 금고).
// - 바뀜(governance-2, 질문 2406): 지배 가문은 의결이 정한 값(cityHouses.ts setRuling)을 따른다. NPC 나라의 지배 가문이 선출로 플레이어 가문이 되면 남은 이익의
//   국고 몫은 그 플레이어 가문 금고(vault:house:<가문 행>:<자산>)로 가고, 돌려보내기·가문장 꺼내기(NPC 행동)는 하지 않는다(가문장이 house_vault_take로 꺼낸다).
import { unitPurseLocation } from "@terra/shared/businessBooks";
import {
  type SimFaction,
  type SimHooks,
  type SimUnit,
  type SocietyCoefficients,
  npcRulingVaultReturnPm,
} from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { HOUSE_VAULT_PREFIX, houseVaultCode } from "../factionIdentity/houseVault.ts";
import type { NpcCityHouses } from "./cityHouses.ts";
import type { CityFacility } from "./economy.ts";
import type { NpcBusiness } from "./npcDelivery.ts";
import {
  type ResidentEconomy,
  type ResidentWorld,
  residentSourceOf,
  withResidentProperty,
} from "./residentProperty.ts";
import { withNationTaxes } from "../government/nationTax.ts";
import {
  type InvestVault,
  type RulingSpendRule,
  rulingSpendShares,
  rulingTakeOf,
  splitDividend,
  splitInvest,
} from "./rulingSpend.ts";

/** NPC 지배 가문 금고 시스템 계정 코드 */
export const npcHouseVaultCode = (npcHouseId: number, asset: string): string =>
  `${HOUSE_VAULT_PREFIX}npc:${npcHouseId}:${asset}`;

/** NPC 지배 가문 금고 규칙 입력 */
export interface NpcVaultRule {
  readonly traitMin: number;
  readonly traitMax: number;
  readonly minPm: number;
  readonly maxPm: number;
}

/** 세력·사회 계수표 → 규칙 입력(설정 칸 — 부를 때마다 읽는다) */
export const npcVaultRuleOf = (c: SocietyCoefficients): NpcVaultRule => ({
  traitMin: c.npc.traitMin,
  traitMax: c.npc.traitMax,
  minPm: c.house.npcVaultReturnMinPm,
  maxPm: c.house.npcVaultReturnMaxPm,
});

/** 세력·사회 계수표 → 가문장 꺼내기·쓰기 규칙(설정 칸) */
export const npcSpendRuleOf = (c: SocietyCoefficients): RulingSpendRule => ({
  traitMin: c.npc.traitMin,
  traitMax: c.npc.traitMax,
  takePm: c.house.npcVaultTakePm,
  dividendPm: c.house.npcSpendDividendPm,
  investPm: c.house.npcSpendInvestPm,
});

/** 지배 가문장과 가문원(유닛 ID·그 유닛 주인 — 지갑 계정 주인) */
export interface RulingHead {
  readonly leader: { readonly unit: number; readonly owner: number };
  readonly members: readonly { readonly unit: number; readonly owner: number }[];
}

type VaultLedger = Pick<Ledger, "systemAccount" | "balance" | "ownerAccount" | "post">;

/** 투자 받을 사업장 금고(house-10, 2312 나): 그 나라·화폐의 금고 목록과 넣기(국고 → 금고). 없으면 국고에 남긴다 */
export interface InvestTargets {
  vaults(nation: number, asset: string): readonly InvestVault[];
  /** 국고 → 그 사업장 금고(business invest). 넣었으면 true */
  put(building: number, nation: number, asset: string, amount: bigint, atMs: number): boolean;
}

/** 가문장 꺼내기·쓰기(위 머리 주석 바뀜 house-9). 금고 계정·화폐·나라를 받는다 */
function headSpend(
  ledger: VaultLedger,
  faction: SimFaction,
  asset: string,
  account: number,
  head: RulingHead,
  rule: RulingSpendRule,
  nowMs: number,
  targets?: InvestTargets,
): void {
  const take = rulingTakeOf(ledger.balance(account), rule);
  if (take <= 0n) return;
  const purse = ledger.ownerAccount(head.leader.owner, asset, unitPurseLocation(head.leader.unit));
  ledger.post({
    kind: "npc_house_vault_take",
    atMs: nowMs,
    entries: [
      { account, amount: -take },
      { account: purse, amount: take },
    ],
  });
  const shares = rulingSpendShares(faction.traits, rule);
  const others = head.members.filter((member) => member.unit !== head.leader.unit);
  const split = splitDividend(
    (take * BigInt(shares.dividendPm)) / 1000n,
    others.map((m) => m.unit),
  );
  const owners = new Map(others.map((member) => [member.unit, member.owner]));
  const paid = split.reduce((sum, entry) => sum + entry.amount, 0n);
  if (paid > 0n)
    ledger.post({
      kind: "npc_house_dividend",
      atMs: nowMs,
      entries: [
        { account: purse, amount: -paid },
        ...split.map((entry) => ({
          account: ledger.ownerAccount(
            owners.get(entry.unit) ?? faction.id,
            asset,
            unitPurseLocation(entry.unit),
          ),
          amount: entry.amount,
        })),
      ],
    });
  const invest = (take * BigInt(shares.investPm)) / 1000n;
  if (invest <= 0n) return;
  ledger.post({
    kind: "npc_house_invest",
    atMs: nowMs,
    entries: [
      { account: purse, amount: -invest },
      { account: ledger.ownerAccount(faction.id, asset), amount: invest },
    ],
  });
  // 국고에 든 투자를 그 도시 사업장 금고로(2312 나) — 넣지 못한 몫은 국고에 남는다
  if (!targets) return;
  for (const part of splitInvest(invest, targets.vaults(faction.id, asset)))
    targets.put(part.building, faction.id, asset, part.amount, nowMs);
}

/** 경제 고리에 NPC 지배 가문 금고를 얹는다(플레이어 가문 나라·다른 고리는 그대로) */
export function withNpcRulingVault(
  base: SimHooks,
  o: {
    readonly ledger: VaultLedger;
    /** 그 나라(소유 주체 ID)의 지배 가문 NPC 가문 ID. 없으면 undefined */
    readonly rulingHouseOf: (owner: number) => number | undefined;
    /** 그 나라 지배 가문이 선출된 플레이어 가문이면 그 가문 세력 행(governance-2). 없으면 undefined */
    readonly rulingPlayerHouseOf?: ((owner: number) => number | undefined) | undefined;
    readonly rule: () => NpcVaultRule;
    /** 그 나라(nation) 지배 가문의 가문장·가문원(house-9). 없으면 가문장 꺼내기를 하지 않는다 */
    readonly headOf?: ((houseId: number, nation: number) => RulingHead | undefined) | undefined;
    readonly spendRule?: (() => RulingSpendRule) | undefined;
    /** 투자 받을 사업장 금고(house-10, 2312 나). 없으면 국고에 남긴다 */
    readonly invest?: InvestTargets | undefined;
  },
): SimHooks {
  const npcVault = (faction: SimFaction, asset: string): number | undefined => {
    if (faction.player) return undefined;
    const house = o.rulingHouseOf(faction.id);
    return house === undefined ? undefined : o.ledger.systemAccount(npcHouseVaultCode(house, asset), asset);
  };
  /** 선출된 플레이어 지배 가문의 금고(NPC 나라) */
  const playerVault = (faction: SimFaction, asset: string): number | undefined => {
    if (faction.player) return undefined;
    const row = o.rulingPlayerHouseOf?.(faction.id);
    return row === undefined ? undefined : o.ledger.systemAccount(houseVaultCode(row, asset), asset);
  };
  return {
    ...base,
    rulingVaultOf: (faction, asset) =>
      base.rulingVaultOf?.(faction, asset) ?? npcVault(faction, asset) ?? playerVault(faction, asset),
    rulingVaultPaid(faction, asset, nowMs) {
      base.rulingVaultPaid?.(faction, asset, nowMs);
      const account = npcVault(faction, asset);
      if (account === undefined) return;
      const balance = o.ledger.balance(account);
      const rule = o.rule();
      const pm = npcRulingVaultReturnPm(faction.traits.commerce, rule, rule);
      const back = balance > 0n ? (balance * BigInt(pm)) / 1000n : 0n;
      if (back > 0n)
        o.ledger.post({
          kind: "npc_house_vault_return",
          atMs: nowMs,
          entries: [
            { account, amount: -back },
            { account: o.ledger.ownerAccount(faction.id, asset), amount: back },
          ],
        });
      // 가문장 꺼내기·쓰기(house-9) — 돌려보낸 뒤 남은 금고에서
      const house = o.rulingHouseOf(faction.id);
      const head = house === undefined ? undefined : o.headOf?.(house, faction.id);
      if (head && o.spendRule)
        headSpend(o.ledger, faction, asset, account, head, o.spendRule(), nowMs, o.invest);
    },
  };
}

/** 런타임이 부르는 꼴(경제 고리 + 원장 + NPC 도시 가문 + 설정 칸) */
export const npcRulingHooks = (
  base: SimHooks,
  o: {
    readonly ledger: VaultLedger;
    readonly cityHouses: Pick<NpcCityHouses, "rulingHouseOf" | "headOf" | "membersOf"> &
      Partial<Pick<NpcCityHouses, "rulingPlayerHouseOf">>;
    readonly rules: () => SocietyCoefficients;
    /** 유닛 주인(지갑 계정 주인)을 읽는 시뮬 세계. 모르는 유닛 — 가문원은 배당에서 빠지고 가문장은 그 나라 것으로 본다 */
    readonly world?:
      | { readonly units: ReadonlyMap<number, Pick<SimUnit, "id" | "owner" | "city" | "guard">> }
      | undefined;
    /** 도시 시설·사업장 장부(house-10 — 투자를 사업장 금고로). 없으면 투자는 국고에 남는다 */
    readonly economy?:
      | {
          readonly business?: Pick<NpcBusiness, "vaultBalance" | "invest"> | undefined;
          facilitiesIn(cityId: number): readonly CityFacility[];
          /** 건물 서비스·2차맵(주민세 건물 값 — residentProperty.ts) */
          readonly build?: ResidentWorld | undefined;
        }
      | undefined;
    /** 도시 경제(주민세 건물 값의 재료 시세 — 읽기만, 일꾼 숙소 배정). 없으면 주민세 재산 값이 없다 */
    readonly econ?: ResidentEconomy | undefined;
  },
): SimHooks => {
  const ownerOf = (unitId: number): number | undefined => o.world?.units.get(unitId)?.owner;
  const business = o.economy?.business;
  const economy = o.economy;
  /** 그 나라 지배 가문 도시(수도)의 그 나라 사업장(다 지은 것) — NPC 사업장 장부가 켜졌을 때만 */
  const invest: InvestTargets | undefined =
    business && economy
      ? {
          vaults(nation, asset) {
            if (Math.trunc(o.rules().business.npcBooks) !== 1) return [];
            const cityId = o.cityHouses.rulingHouseOf(nation)?.cityId;
            if (cityId === undefined) return [];
            return economy
              .facilitiesIn(cityId)
              .filter((entry) => entry.ownerId === nation && entry.level >= 1)
              .map((entry) => ({
                building: entry.buildingId,
                balance: business.vaultBalance(entry.buildingId, nation, asset),
              }));
          },
          put: (building, nation, asset, amount, atMs) =>
            business.invest(building, nation, asset, amount, atMs),
        }
      : undefined;
  // 주민세 재산 값(D-579·2371 나, residentProperty.ts — 그 도시 건물 지은 값)과 나라 세금(2373 가, government/nationTax.ts — 나라 세율·주기·국세 몫)도
  // 여기서 얹는다(runtime.ts 1,000줄 상한)
  const taxed = withNationTaxes(
    withResidentProperty(
      base,
      residentSourceOf(o.economy?.build, o.econ, o.rules, { sim: o.world, ledger: o.ledger }),
    ),
    { ledger: o.ledger, rules: o.rules },
  );
  return withNpcRulingVault(taxed, {
    ledger: o.ledger,
    rulingHouseOf: (owner) => o.cityHouses.rulingHouseOf(owner)?.id,
    rulingPlayerHouseOf: (owner) => o.cityHouses.rulingPlayerHouseOf?.(owner),
    rule: () => npcVaultRuleOf(o.rules()),
    headOf: (houseId, nation) => {
      const unit = o.cityHouses.headOf(houseId);
      if (unit === undefined) return undefined;
      return {
        // 국가 지도자 유닛은 그 나라 것이다(leaders.ts — 시뮬 유닛 표에 없다)
        leader: { unit, owner: ownerOf(unit) ?? nation },
        members: o.cityHouses.membersOf(houseId).flatMap((member) => {
          const memberOwner = ownerOf(member);
          return memberOwner === undefined ? [] : [{ unit: member, owner: memberOwner }];
        }),
      };
    },
    spendRule: () => npcSpendRuleOf(o.rules()),
    invest,
  });
};
