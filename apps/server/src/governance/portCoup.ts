// 의결 포트 둘째 묶음(줄기 governance-3 — port.ts 줄 수 때문에 따로 둔다): 쿠데타(질문 2433 답·D-583 나 가)·지배 쪽 지분 따라가기(2432 나)·빈자리 도시 독립
// (2434 (가) 답 D-583)·국고 지분 팔기(2438 답 D-583)가 세계에서 읽고 바꾸는 것. 읽기는 거울 세계 메모리, 쓰기는 원장·거울 세계(다음 NPC 틱이 저장한다 —
// 도시 독립은 바로 틱을 민다).
// - 가문 유닛: NPC 가문 = 가문원 + 가문장(지배 가문은 국가 지도자 유닛 — 거울 세계 유닛 표에 없으면 빠진다), 플레이어 가문 = 그 가문 소유 주체의 유닛(플레이어 가문
//   나라의 지배 가문이면 그 나라 소유 주체 — 바뀜 gov-fix-2, 질문 2545).
// - 정부군(D-583 2433 나 가): 지배 가문원 + 수도 경비대(그 나라 경비대 유닛 가운데 수도에 있는 것).
//   바뀜(줄기 gov-coup — D-588 2492 가): 쿠데타 도시의 경비대(cityGuards — 도시를 모르면 수도). 도시 이름(cityName — 의결 칸 쿠데타 도시 고르기).
// - 힘(질문 2433 가 기술 기본값 — 랭킹 전투력 D-576과 같은 몸): 유닛마다 전투력 몸(battleBodies basePower — 버프 없는 기본 수치) 합. 몸을 모르면 유닛마다 1.
// - 쿠데타 전투(D-583 2433 나 가 — 반란 전투 틀 D-256): @terra/sim runCoupBattle(반란과 같은 도시 안 공성 — 혁명군이 시청을 무너뜨리거나 정부군을 모두
//   쓰러뜨리면 이김). 거울 세계 유닛의 부상만 남는다(세계 유닛 생명 수치는 건드리지 않는다 [임시]).
import type { HouseKey } from "@terra/shared/governance";
import {
  type CombatCatalog,
  type CombatCoefficients,
  type SimUnit,
  TEST_COMBAT_CATALOG,
  TEST_COMBAT_COEFFICIENTS,
  holdingsOf,
  houseHoldingsOf,
  houseShareCode,
  runCoupBattle,
  shareAsset,
} from "@terra/sim";
import { houseVaultCode } from "../factionIdentity/houseVault.ts";
import { npcHouseVaultCode } from "../npc/rulingVault.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import type { World } from "../world/world.ts";
import { confiscateSharesToHouse, houseTailOf } from "./houseShares.ts";
import type { GovernanceNation } from "./port.ts";

/** 쿠데타 전투 맵·편마다 유닛 수(설정 칸 gov_coup_battle_units) */
export interface CoupBattleSize {
  readonly unitsPerSide: number;
}

export interface GovernancePortCoup {
  /** 그 가문의 유닛 ID(위 머리 주석) */
  houseUnits(nation: GovernanceNation, key: HouseKey): readonly number[];
  /** 그 도시 경비대 유닛 ID(도시를 모르면 수도 — 쿠데타 전투 도시, D-588 2492 가) */
  cityGuards(nation: GovernanceNation, cityId: number | undefined): readonly number[];
  /** 도시 이름(번역 안 함 — 모르면 undefined) */
  cityName(cityId: number): string | undefined;
  /** 그 사용자 소유 주체의 거울 세계 유닛 ID(없으면 빈 목록) */
  userUnits(userId: string): readonly number[];
  /** 유닛 힘 합(전투력 몸, 모르면 1) */
  powerOf(unitIds: readonly number[], nowMs: number): number;
  /** 쿠데타 전투(혁명군이 이기면 true). 한 유닛이 두 편에 있으면 혁명군 쪽에서 뺀다 */
  coupBattle(
    nation: GovernanceNation,
    rebels: readonly number[],
    loyal: readonly number[],
    nowMs: number,
    size: CoupBattleSize,
  ): boolean;
  /** 그 나라 모든 도시의 다른 주주 지분 → 그 가문 계정(쿠데타 성공, D-582) */
  confiscateToHouse(nation: GovernanceNation, key: HouseKey, nowMs: number): bigint;
  /** 그 나라 도시에서 from 가문 계정 지분 → to 가문 계정(지배 가문이 바뀜 — 질문 2432 나). 옮긴 주 수 */
  moveHouseShares(nation: GovernanceNation, from: HouseKey, to: HouseKey, nowMs: number): bigint;
  /** 유닛 만족도를 점만큼 내린다(0 아래로 안 감) */
  dropSatisfaction(unitIds: readonly number[], points: number): void;
  /** 그 나라 도시의 유닛 ID */
  nationUnits(nation: GovernanceNation): readonly number[];
  /** 쿠데타 실패 비용: 그 가문 금고(나라 국고 화폐) → 나라 국고, 있는 만큼(낸 양) */
  payCoupCost(nation: GovernanceNation, key: HouseKey, amount: bigint, nowMs: number): bigint;
  /** 나라 명성(공훈 — D-583 2433 나 가 보상, D-326 명성) */
  addRenown(userId: string, nationRow: number, amount: number, nowMs: number): void;
  /** 시작 도시인가(D-341 — 독립 투표에서 뺀다) */
  isStartCity(cityId: number): boolean;
  /**
   * 도시 독립(D-583 2434 (가) 가 — 새 도시국가, 체제는 옛 나라 체제). coup = 쿠데타 성공(시작 도시도 그 도시만 — 2542 gov-fix-2, 시작 도시 표시를 지운다 —
   * 2572 나 gov-fix-3). 새 세력 행 ID(못 했으면 undefined)
   */
  cityIndependence(
    nation: GovernanceNation,
    cityId: number,
    nowMs: number,
    coup?: boolean,
  ): Promise<number | undefined>;
  /** 그 도시 국고 지분(국고 지분 팔기 — 2438) */
  treasuryShares(nation: GovernanceNation, cityId: number): bigint;
}

type CoupWorld = Pick<World, "status" | "npc" | "persistence">;

export function worldGovernancePortCoup(
  world: () => CoupWorld | undefined,
  combat?: () => { readonly catalog: CombatCatalog; readonly rules: CombatCoefficients } | undefined,
): GovernancePortCoup {
  const live = () => {
    const w = world();
    return w?.status().state === "ready" && w.npc && w.persistence
      ? { npc: w.npc, persistence: w.persistence }
      : undefined;
  };
  const unitsOf = (ownerId: number): number[] => {
    const l = live();
    const faction = l?.npc.world.factions.get(ownerId);
    return faction ? [...faction.units].toSorted((a, b) => a - b) : [];
  };
  return {
    houseUnits(nation, key) {
      const l = live();
      if (!l) return [];
      const id = Number(key.slice(2));
      if (key.startsWith("n:")) {
        const members = [...l.npc.cityHouses.membersOf(id)];
        const head = l.npc.cityHouses.headOf(id);
        if (head !== undefined && !members.includes(head)) members.push(head);
        return members.filter((unit) => l.npc.world.units.has(unit)).toSorted((a, b) => a - b);
      }
      // 플레이어 가문 나라의 지배 가문 = 그 나라 소유 주체(2545 — gov-fix-2)
      const owner = l.npc.houses.ownerOfRow(id);
      return owner === undefined ? [] : unitsOf(owner);
    },
    cityGuards(nation, cityId) {
      const l = live();
      const city = cityId ?? l?.npc.capitalOf(nation.ownerId);
      if (!l || city === undefined) return [];
      return unitsOf(nation.ownerId).filter((id) => {
        const unit = l.npc.world.units.get(id);
        return unit?.guard === true && unit.city === city;
      });
    },
    cityName: (cityId) => live()?.npc.places.get(cityId)?.name,
    userUnits(userId) {
      const l = live();
      if (!l) return [];
      const out: number[] = [];
      for (const [ownerId, row] of l.persistence.owners)
        if (row.userId === userId && row.factionId === null) out.push(...unitsOf(ownerId));
      return out.toSorted((a, b) => a - b);
    },
    powerOf(unitIds, at) {
      const l = live();
      let sum = 0;
      for (const id of unitIds) {
        const power = l?.persistence.bodies.basePower(id, at) ?? 0;
        sum += power > 0 ? Math.trunc(power) : 1;
      }
      return sum;
    },
    coupBattle(nation, rebels, loyal, nowMs, size) {
      const l = live();
      const government = l?.npc.world.factions.get(nation.ownerId);
      if (!l || !government) return false;
      const loyalSet = new Set(loyal);
      const pick = (ids: readonly number[]): SimUnit[] =>
        ids.flatMap((id) => {
          const unit = l.npc.world.units.get(id);
          return unit ? [unit] : [];
        });
      const kit = combat?.() ?? { catalog: TEST_COMBAT_CATALOG, rules: TEST_COMBAT_COEFFICIENTS };
      return runCoupBattle({
        world: l.npc.world,
        government,
        rebels: pick(rebels.filter((id) => !loyalSet.has(id))),
        loyal: pick(loyal),
        nowMs,
        unitsPerSide: size.unitsPerSide,
        catalog: kit.catalog,
        combat: kit.rules,
      });
    },
    confiscateToHouse(nation, key, nowMs) {
      const l = live();
      return l ? confiscateSharesToHouse(l.npc.world.book, nation.cities, key, nowMs) : 0n;
    },
    moveHouseShares(nation, from, to, nowMs) {
      const l = live();
      if (!l || from === to) return 0n;
      const book = l.npc.world.book;
      const fromTail = houseTailOf(from);
      const toTail = houseTailOf(to);
      let total = 0n;
      for (const cityId of nation.cities) {
        const row = houseHoldingsOf(book, cityId).find((entry) => entry.house === fromTail);
        if (!row || row.amount <= 0n) continue;
        const asset = shareAsset(cityId);
        book.post({
          kind: "share_follow_ruler",
          atMs: nowMs,
          entries: [
            { account: row.account, amount: -row.amount },
            { account: book.systemAccount(houseShareCode(toTail, cityId), asset), amount: row.amount },
          ],
        });
        total += row.amount;
      }
      return total;
    },
    dropSatisfaction(unitIds, points) {
      const l = live();
      const drop = Math.max(0, Math.trunc(points)) * 1000;
      if (!l || drop === 0) return;
      for (const id of unitIds) {
        const unit = l.npc.world.units.get(id);
        if (unit) unit.satisfactionMilli = Math.max(0, unit.satisfactionMilli - drop);
      }
    },
    nationUnits(nation) {
      const l = live();
      if (!l) return [];
      const cities = new Set(nation.cities);
      const out: number[] = [];
      for (const unit of l.npc.world.units.values()) if (cities.has(unit.city)) out.push(unit.id);
      return out.toSorted((a, b) => a - b);
    },
    payCoupCost(nation, key, amount, nowMs) {
      const l = live();
      if (!l || amount <= 0n) return 0n;
      const asset = l.npc.economy?.economy.currencyOf.get(nation.ownerId) ?? ASSET_CREDIT;
      const ledger = l.persistence.ledger;
      const id = Number(key.slice(2));
      const code = key.startsWith("n:") ? npcHouseVaultCode(id, asset) : houseVaultCode(id, asset);
      const vault = ledger.systemAccount(code, asset);
      const have = ledger.balance(vault);
      const paid = have < amount ? have : amount;
      if (paid <= 0n) return 0n;
      ledger.post({
        kind: "coup_fail_cost",
        atMs: nowMs,
        entries: [
          { account: vault, amount: -paid },
          { account: ledger.ownerAccount(nation.ownerId, asset), amount: paid },
        ],
      });
      return paid;
    },
    addRenown(userId, nationRow, amount, nowMs) {
      if (amount > 0) live()?.persistence.cyborgs.addRenown(userId, nationRow, amount, nowMs);
    },
    isStartCity: (cityId) => live()?.npc.world.cities.get(cityId)?.start === true,
    async cityIndependence(nation, cityId, nowMs, coup) {
      const l = live();
      if (!l) return undefined;
      const child = l.npc.society.cityIndependence(cityId, nowMs, coup === true);
      if (child === undefined) return undefined;
      // 쿠데타로 떨어져 나간 도시는 시작 도시 표시를 잃는다(질문 2572 나 — 새 나라는 기본 NPC 국가도 시작 세력도 아니다, D-341·D-528).
      // 다음 틱이 도시 줄과 함께 저장한다(npc/persist.ts citySig)
      const city = coup === true ? l.npc.world.cities.get(cityId) : undefined;
      if (city) city.start = false;
      await l.npc.tick(true);
      return l.persistence.owners.get(child)?.factionId ?? undefined;
    },
    treasuryShares(nation, cityId) {
      const l = live();
      if (!l) return 0n;
      return holdingsOf(l.npc.world.book, cityId).find((row) => row.owner === nation.ownerId)?.amount ?? 0n;
    },
  };
}
