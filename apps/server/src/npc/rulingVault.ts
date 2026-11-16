// NPC 지배 가문 금고 — 기획 대조 2223 고침(2026-11-16): D-338 "도시 세금의 남은 이익은 지배 가문 금고로"·D-555 1509 "NPC만으로도 똑같이"·
// D-574(지배 가문 = 수도에서 처음 세운 가문). fixes-1116l은 NPC 나라의 남은 이익 국고 몫을 국고에 남겼다(쓰는 규칙이 없어 돈이 멈추므로) — 이를
// 대신한다. docs/adr/2026-11-11-faction-identity.md "바뀜 (house-8, D-574)".
// - 독재 NPC 나라: 남은 이익의 국고 몫 → 그 나라 지배 가문(npc/cityHouses.ts rulingHouseOf — NPC 가문 ID)의 금고(원장 시스템 계정
//   vault:house:npc:<NPC 가문 ID>:<자산> — 플레이어 가문 금고와 같은 앞머리라 불변 조건 검사 "금고 0 아래"가 함께 본다). 지배 가문이 없으면(수도에
//   가문이 아직 없음) 옛 동작대로 국고에 남긴다.
// - 금고를 쓰는 규칙(D-554 "세력 성향마다 다양한 변수", 설정 칸): 배당 차례가 끝나면 금고 잔고의 몫(‰ — 상업 성향이 낮을수록 많이,
//   @terra/sim npcRulingVaultReturnPm, 설정 칸 house_npc_vault_return_min_pm·max_pm)을 국고로 돌려보낸다(국고 지원 — 국고가 마르지 않는 길).
//   나머지는 가문 금고에 쌓인다. 도시 건설·가문원 배당에 쓰는 길은 아직 없다(질문 2255).
// - 플레이어 가문 나라는 그대로(factionIdentity/houseVault.ts rulingVaultOf — 그 가문 금고).
import { type SimFaction, type SimHooks, type SocietyCoefficients, npcRulingVaultReturnPm } from "@terra/sim";
import type { Ledger } from "../economy/ledger.ts";
import { HOUSE_VAULT_PREFIX } from "../factionIdentity/houseVault.ts";
import type { NpcCityHouses } from "./cityHouses.ts";

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

/** 경제 고리에 NPC 지배 가문 금고를 얹는다(플레이어 가문 나라·다른 고리는 그대로) */
export function withNpcRulingVault(
  base: SimHooks,
  o: {
    readonly ledger: Pick<Ledger, "systemAccount" | "balance" | "ownerAccount" | "post">;
    /** 그 나라(소유 주체 ID)의 지배 가문 NPC 가문 ID. 없으면 undefined */
    readonly rulingHouseOf: (owner: number) => number | undefined;
    readonly rule: () => NpcVaultRule;
  },
): SimHooks {
  const npcVault = (faction: SimFaction, asset: string): number | undefined => {
    if (faction.player) return undefined;
    const house = o.rulingHouseOf(faction.id);
    return house === undefined ? undefined : o.ledger.systemAccount(npcHouseVaultCode(house, asset), asset);
  };
  return {
    ...base,
    rulingVaultOf: (faction, asset) => base.rulingVaultOf?.(faction, asset) ?? npcVault(faction, asset),
    rulingVaultPaid(faction, asset, nowMs) {
      base.rulingVaultPaid?.(faction, asset, nowMs);
      const account = npcVault(faction, asset);
      if (account === undefined) return;
      const balance = o.ledger.balance(account);
      const rule = o.rule();
      const pm = npcRulingVaultReturnPm(faction.traits.commerce, rule, rule);
      const back = balance > 0n ? (balance * BigInt(pm)) / 1000n : 0n;
      if (back <= 0n) return;
      o.ledger.post({
        kind: "npc_house_vault_return",
        atMs: nowMs,
        entries: [
          { account, amount: -back },
          { account: o.ledger.ownerAccount(faction.id, asset), amount: back },
        ],
      });
    },
  };
}

/** 런타임이 부르는 꼴(경제 고리 + 원장 + NPC 도시 가문 + 설정 칸) */
export const npcRulingHooks = (
  base: SimHooks,
  o: {
    readonly ledger: Pick<Ledger, "systemAccount" | "balance" | "ownerAccount" | "post">;
    readonly cityHouses: Pick<NpcCityHouses, "rulingHouseOf">;
    readonly rules: () => SocietyCoefficients;
  },
): SimHooks =>
  withNpcRulingVault(base, {
    ledger: o.ledger,
    rulingHouseOf: (owner) => o.cityHouses.rulingHouseOf(owner)?.id,
    rule: () => npcVaultRuleOf(o.rules()),
  });
