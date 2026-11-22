// 외교 서비스가 세계에서 읽고 바꾸는 것(포트) — 거울 세계(NPC 사회 런타임)와 원장을 이 모양 하나로 감싼다. 나라 목록·전쟁 여부·강화·NPC 강화 규칙식은 의결 포트
// (governance/port.ts)를 그대로 쓴다. docs/adr/2026-11-21-diplomacy-treaties.md
// - 불가침: 세력의 truces(상대 → 끝 시각 — 세력·사회 규칙 society/wars.ts, NPC 판단이 거른다 — D-292·D-329 86). 저장은 NPC 런타임 틱(faction_wars truce 줄).
// - 참전(D-291 전쟁 참가자 등록): 세력·사회 declareWar 규칙(wars.ts — 둘 다 전쟁, 교전 시각 = 지금)을 무명분 비용 없이 부른다(요청·수락으로 들어간 전쟁 — D-291 "악명 없이").
// - 공물: 보호받는 나라 국고(그 나라 화폐) → 보호하는 나라 국고(같은 화폐 계정) 원장 이체(kind treaty_tribute — 봉신 공물과 같은 모양).
import { declareWar, factionView } from "@terra/sim";
import { type AffinityBook, type AffinityRules, attachAffinityBook } from "./affinity.ts";
import { type BreachBook, type BreachRules, attachBreachBook } from "./breaches.ts";
import { tributeAmount } from "./clauses.ts";
import type { GovernanceNation, GovernancePort } from "../governance/port.ts";
import { ASSET_CREDIT } from "../world/settlement.ts";
import type { World } from "../world/world.ts";

export interface DiplomacyPort
  extends Pick<GovernancePort, "ready" | "nations" | "nation" | "atWar" | "makePeace" | "npcAcceptsPeace"> {
  /** 그 나라와 전쟁 중인 나라(세력 행 차례) */
  enemiesOf(nation: GovernanceNation): readonly number[];
  /** 두 나라 불가침 끝(없으면 undefined) */
  truceUntil(nation: GovernanceNation, other: GovernanceNation): number | undefined;
  /** 두 나라 불가침을 untilMs까지(이미 더 길면 그대로, 전쟁 중이면 하지 않는다). 바꿨으면 true */
  setTruce(nation: GovernanceNation, other: GovernanceNation, untilMs: number): Promise<boolean>;
  /** 참가할 나라를 그 적과 전쟁 참가자로(무명분 비용 없음). 들어갔으면 true */
  joinWar(joiner: GovernanceNation, enemy: GovernanceNation, nowMs: number): Promise<boolean>;
  /** 공물: from 국고의 ‰를 to 국고로. 옮긴 양 */
  payTribute(from: GovernanceNation, to: GovernanceNation, tributePm: number, nowMs: number): bigint;
  /** 그 나라 국고(그 나라 화폐 최소 단위) */
  treasuryOf(nation: GovernanceNation): bigint;
  /** NPC 판단의 힘(휴먼 수 — 봉신 묶음 포함). 모르면 0 */
  strengthOf(nation: GovernanceNation, nowMs: number): number;
  /** 조약 위반 장부(원장에 붙는다 — breaches.ts). 세계가 준비되지 않았으면 undefined */
  breaches(): BreachBook | undefined;
  /** 세력 쌍 호감 장부(원장에 붙는다 — affinity.ts, 줄기 gov-fix-4). 세계가 준비되지 않았으면 undefined */
  affinity(): AffinityBook | undefined;
}

type DiplomacyWorld = Pick<World, "status" | "npc" | "persistence">;

export function worldDiplomacyPort(
  world: () => DiplomacyWorld | undefined,
  governance: GovernancePort,
  rules: () => BreachRules & AffinityRules,
): DiplomacyPort {
  const live = () => {
    const w = world();
    return w?.status().state === "ready" && w.npc && w.persistence
      ? { npc: w.npc, persistence: w.persistence }
      : undefined;
  };
  const faction = (nation: GovernanceNation) => live()?.npc.world.factions.get(nation.ownerId);
  const assetOf = (nation: GovernanceNation): string =>
    live()?.npc.economy?.economy.currencyOf.get(nation.ownerId) ?? ASSET_CREDIT;
  return {
    ready: () => governance.ready(),
    nations: () => governance.nations(),
    nation: (rowId) => governance.nation(rowId),
    atWar: (nation, target) => governance.atWar(nation, target),
    makePeace: (nation, target, nowMs) => governance.makePeace(nation, target, nowMs),
    npcAcceptsPeace: (proposer, target, nowMs) => governance.npcAcceptsPeace(proposer, target, nowMs),
    enemiesOf(nation) {
      const self = faction(nation);
      if (!self) return [];
      return governance
        .nations()
        .filter((other) => other.rowId !== nation.rowId && self.wars.has(other.ownerId))
        .map((other) => other.rowId)
        .toSorted((a, b) => a - b);
    },
    truceUntil(nation, other) {
      return faction(nation)?.truces.get(other.ownerId);
    },
    async setTruce(nation, other, untilMs) {
      const l = live();
      const a = faction(nation);
      const b = faction(other);
      if (!l || !a || !b || a.wars.has(b.id)) return false;
      const now = Math.min(a.truces.get(b.id) ?? 0, b.truces.get(a.id) ?? 0);
      if (now >= untilMs) return false;
      a.truces.set(b.id, Math.max(untilMs, a.truces.get(b.id) ?? 0));
      b.truces.set(a.id, Math.max(untilMs, b.truces.get(a.id) ?? 0));
      await l.npc.tick(true);
      return true;
    },
    async joinWar(joiner, enemy, nowMs) {
      const l = live();
      const a = faction(joiner);
      const b = faction(enemy);
      if (!l || !a || !b || !a.alive || !b.alive || a.wars.has(b.id)) return false;
      declareWar(a, a.id, b, b.id, nowMs);
      // 참전도 선포다 — 그 적과 맺은 조약이 있으면 참가한 나라가 어긴 것이다(breaches.ts)
      attachBreachBook(l.persistence.ledger, rules).declared(a.id, b.id, nowMs);
      await l.npc.tick(true);
      return a.wars.has(b.id);
    },
    payTribute(from, to, tributePm, nowMs) {
      const l = live();
      if (!l || tributePm <= 0) return 0n;
      const asset = assetOf(from);
      const ledger = l.persistence.ledger;
      const amount = tributeAmount(ledger.balanceOf(from.ownerId, asset), tributePm);
      if (amount <= 0n) return 0n;
      ledger.post({
        kind: "treaty_tribute",
        atMs: nowMs,
        entries: [
          { account: ledger.ownerAccount(from.ownerId, asset), amount: -amount },
          { account: ledger.ownerAccount(to.ownerId, asset), amount },
        ],
      });
      return amount;
    },
    treasuryOf(nation) {
      const l = live();
      return l ? l.persistence.ledger.balanceOf(nation.ownerId, assetOf(nation)) : 0n;
    },
    strengthOf(nation, nowMs) {
      const l = live();
      const ctx = l?.npc.houseRecruit.context();
      const self = faction(nation);
      return ctx && self ? factionView(ctx, self, nowMs).strength : 0;
    },
    breaches() {
      const l = live();
      return l ? attachBreachBook(l.persistence.ledger, rules) : undefined;
    },
    affinity() {
      const l = live();
      if (!l) return undefined;
      return attachAffinityBook(l.persistence.ledger, {
        rules,
        nations: () => governance.nations().map((nation) => nation.rowId),
        rowOfOwner: (owner) => governance.nations().find((nation) => nation.ownerId === owner)?.rowId,
      });
    },
  };
}
