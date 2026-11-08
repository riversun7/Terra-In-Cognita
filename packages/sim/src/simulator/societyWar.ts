// 시뮬 공성 결과 실행 — 기획 D-520·D-527, docs/adr/2026-11-07-war-outcomes.md "바뀜 (D-527)". 규칙(수)은 society/warOutcomes.ts, 고르기는 NPC
// 규칙식(npc/policy.ts occupationChoice). society.ts occupy가 고른 결과마다 여기를 부른다(시뮬·서버 같은 함수 — 서버 NPC 공격도 이 길):
// - 약탈: 그 도시 정부가 무너진다(남은 상태 looted, 소유는 그대로). 하루 끝마다 약탈 세력이 도시 금고 몫(lootTakeBp, "국고 ÷ 도시 수" 꼴)과 그 도시
//   공공 창고(도시 주인 세력의 그 도시 창고 물건) 몫을 꺼내 간다(물건은 약탈 세력의 가장 오래된 도시 창고로, 도시가 없으면 위치 없이 — 원장 보유).
//   재건할 수 있는 날이 지나면 옛 세력이 재건 비용을 내고(소각, 모자라면 있는 만큼) 정부를 다시 세운다 → 다시 전쟁(resumeWar).
// - 점령 상태: 도시 ID마다 상태 하나(world.occupations). 하루 끝에 세금 시각이 지났으면 그 도시 몫 세금을 거두고, 주인 바뀜·한쪽이 사라짐·
//   옛 세력이 힘을 회복함·저절로 회복함(약 7일)이면 끝.
// - 점령·귀속: 재건 비용을 점령자 국고에서 소각(모자라면 있는 만큼), 회복 불이익 상태(annexed)를 둔다. 도시 넘기기·지분·편입 제안은 society.ts 그대로.
// 같은 도시에 새 결과가 오면 옛 상태를 지우고 새로 둔다(점령 상태 중 다른 세력이 점령·귀속하면 그 점령은 끝난다). 끝날 때마다 까닭을 onEnd로 알린다
// (서버가 war_outcomes.end_reason에 적는다).
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import {
  annexPenaltyUntil,
  bpShare,
  govRebuildCost,
  govRebuildFrom,
  nextOccupationTaxMs,
  occupationExpelled,
  occupationWindow,
  rebuildCost,
  recoveryDayPm,
  type WarStateEndReason,
} from "../society/warOutcomes.ts";
import type { SimHooks } from "./npcRun.ts";
import type { SimCity, SimFaction, SimOccupation, SimWorld } from "./world.ts";

export interface WarSummary {
  /** 점령 상태가 거둔 세금 거래 수·남은 상태가 끝난 수 */
  readonly occupationTaxes: number;
  readonly occupationsEnded: number;
  /** 점령·귀속 재건 비용을 낸 수 */
  readonly rebuilt: number;
  /** 지금 남은 점령 상태·회복 불이익 수 */
  readonly occupied: number;
  readonly annexed: number;
  /** 약탈(D-527): 꺼내 간 거래 수, 옛 세력이 정부를 재건한 수(= 다시 전쟁), 지금 남은 약탈 상태 수 */
  readonly lootWithdrawals: number;
  readonly govRebuilt: number;
  readonly looted: number;
  /** 점령 상태가 끝난 까닭(D-527): 옛 세력이 힘을 회복해 몰아냄 · 저절로 회복 */
  readonly expelled: number;
  readonly recovered: number;
}

export interface SocietyWar {
  /** 약탈: 정부가 무너진 상태(looted) 시작. 꺼내 가기는 하루 끝마다 */
  raid(attacker: SimFaction, target: SimFaction, city: SimCity, nowMs: number): SimOccupation;
  /** 점령 상태 시작(소유 그대로) */
  occupy(attacker: SimFaction, target: SimFaction, city: SimCity, nowMs: number): SimOccupation;
  /** 점령·귀속: 재건 비용 소각 + 회복 불이익. 소각한 값 */
  annex(attacker: SimFaction, target: SimFaction, city: SimCity, nowMs: number): bigint;
  /** 하루 만족도 다가가기 빠르기(점령·귀속 불이익 중 회복이면 느리게) */
  recoveryPm(cityId: number, milli: number, targetMilli: number, nowMs: number): number;
  /** 하루 끝: 약탈 꺼내 가기·정부 재건, 점령 상태 세금·끝, 끝난 회복 불이익 지우기 */
  endOfDay(nowMs: number): void;
  check(): string[];
  summary(): WarSummary;
}

export function createSocietyWar(o: {
  readonly world: SimWorld;
  readonly c: SocietyCoefficients;
  readonly hooks: SimHooks | undefined;
  readonly treasuryAsset: (f: SimFaction) => string;
  /** 옛 세력이 정부를 재건했을 때 — 약탈 세력과 다시 전쟁(society.ts가 선포·교전 기록을 한다) */
  readonly resumeWar?: ((owner: SimFaction, looter: SimFaction, nowMs: number) => void) | undefined;
  /** 남은 상태가 끝났을 때(서버 기록) */
  readonly onEnd?: ((entry: SimOccupation, reason: WarStateEndReason, nowMs: number) => void) | undefined;
}): SocietyWar {
  const { world, c } = o;
  const book: LedgerBook = world.book;
  const counts = {
    occupationTaxes: 0,
    occupationsEnded: 0,
    rebuilt: 0,
    lootWithdrawals: 0,
    govRebuilt: 0,
    expelled: 0,
    recovered: 0,
  };
  const treasury = (f: SimFaction): bigint => book.balanceOf(f.id, o.treasuryAsset(f));

  /** 대상 국고의 도시 몫(만분율)을 점령자에게(대상 국고 화폐 그대로). 옮긴 값 */
  const takeTreasury = (
    from: SimFaction,
    to: SimFaction,
    bp: number,
    kind: string,
    nowMs: number,
  ): bigint => {
    const asset = o.treasuryAsset(from);
    const share = bpShare(treasury(from), bp) / BigInt(Math.max(1, from.cities.size));
    if (share > 0n)
      book.post({
        kind,
        atMs: nowMs,
        entries: [
          { account: book.ownerAccount(from.id, asset), amount: -share },
          { account: book.ownerAccount(to.id, asset), amount: share },
        ],
      });
    return share;
  };

  /** 국고에서 소각(모자라면 있는 만큼). 소각한 값 */
  const burn = (payer: SimFaction, want: bigint, nowMs: number): bigint => {
    const asset = o.treasuryAsset(payer);
    const have = treasury(payer);
    const cost = want < have ? want : have > 0n ? have : 0n;
    if (cost > 0n)
      book.post({
        kind: "burn",
        atMs: nowMs,
        entries: [
          { account: book.ownerAccount(payer.id, asset), amount: -cost },
          { account: book.systemAccount(`sink:${asset}`, asset), amount: cost },
        ],
      });
    return cost;
  };

  const end = (cityId: number, reason: WarStateEndReason, nowMs: number): void => {
    const entry = world.occupations.get(cityId);
    if (!entry) return;
    world.occupations.delete(cityId);
    counts.occupationsEnded += 1;
    if (reason === "expelled") counts.expelled += 1;
    if (reason === "recovered") counts.recovered += 1;
    o.onEnd?.(entry, reason, nowMs);
  };

  /** 약탈 하루 몫: 도시 금고 몫 + 공공 창고(그 도시 창고의 도시 주인 세력 물건 — 유저·다른 세력 물건은 사유 자산이라 건드리지 않는다, D-161) */
  const withdraw = (entry: SimOccupation, owner: SimFaction, looter: SimFaction, nowMs: number): void => {
    const taken = takeTreasury(owner, looter, c.lootTakeBp, "loot", nowMs);
    entry.taken += taken;
    const home = [...looter.cities].filter((id) => world.cities.has(id)).toSorted((a, b) => a - b)[0];
    const entries = [];
    for (const account of [...book.accounts()].toSorted((a, b) => a.id - b.id)) {
      if (account.ownerId !== owner.id || account.location !== entry.city || account.balance <= 0n) continue;
      const amount = bpShare(account.balance, c.war.raidGoodsBp);
      if (amount <= 0n) continue;
      entries.push({ account: account.id, amount: -amount });
      entries.push({ account: book.ownerAccount(looter.id, account.asset, home ?? null), amount });
    }
    if (entries.length > 0) book.post({ kind: "loot", atMs: nowMs, entries });
    if (taken > 0n || entries.length > 0) counts.lootWithdrawals += 1;
  };

  /** 상태가 이어지는가: 도시 주인이 그대로이고 두 세력이 살아 있다. 아니면 끝내고 거짓 */
  const stillHeld = (entry: SimOccupation, nowMs: number): [SimFaction, SimFaction] | null => {
    const city = world.cities.get(entry.city);
    const owner = world.factions.get(entry.owner);
    const occupier = world.factions.get(entry.occupier);
    if (city?.owner !== entry.owner) {
      end(entry.city, "owner_changed", nowMs);
      return null;
    }
    if (!owner?.alive || !occupier?.alive) {
      end(entry.city, "gone", nowMs);
      return null;
    }
    return [owner, occupier];
  };

  return {
    raid(attacker, target, city, nowMs) {
      end(city.id, "replaced", nowMs);
      const untilMs = govRebuildFrom(nowMs, c.war);
      const entry: SimOccupation = {
        city: city.id,
        kind: "looted",
        occupier: attacker.id,
        owner: target.id,
        sinceMs: nowMs,
        untilMs,
        nextTaxMs: untilMs,
        taken: 0n,
      };
      world.occupations.set(city.id, entry);
      return entry;
    },

    occupy(attacker, target, city, nowMs) {
      end(city.id, "replaced", nowMs);
      const window = occupationWindow(nowMs, c.war);
      const entry: SimOccupation = {
        city: city.id,
        kind: "occupied",
        occupier: attacker.id,
        owner: target.id,
        sinceMs: nowMs,
        untilMs: window.untilMs,
        nextTaxMs: window.nextTaxMs,
        taken: 0n,
      };
      world.occupations.set(city.id, entry);
      return entry;
    },

    annex(attacker, target, city, nowMs) {
      end(city.id, "replaced", nowMs);
      const cost = burn(attacker, rebuildCost(city.housing, c.war), nowMs);
      if (cost > 0n) counts.rebuilt += 1;
      const untilMs = annexPenaltyUntil(nowMs, c.war);
      if (untilMs > nowMs)
        world.occupations.set(city.id, {
          city: city.id,
          kind: "annexed",
          occupier: attacker.id,
          owner: target.id,
          sinceMs: nowMs,
          untilMs,
          nextTaxMs: untilMs,
          taken: 0n,
        });
      return cost;
    },

    recoveryPm(cityId, milli, targetMilli, nowMs) {
      const entry = world.occupations.get(cityId);
      const penalized = entry?.kind === "annexed" && nowMs < entry.untilMs;
      return recoveryDayPm(penalized, milli, targetMilli, c.war);
    },

    endOfDay(nowMs) {
      for (const entry of [...world.occupations.values()].toSorted((a, b) => a.city - b.city)) {
        const city = world.cities.get(entry.city);
        if (entry.kind === "annexed") {
          // 회복 불이익: 기한이 지나거나 도시가 다른 주인에게 가면(다시 점령·반란·독립·폐허) 끝
          if (city?.owner !== entry.occupier) end(entry.city, "owner_changed", nowMs);
          else if (nowMs >= entry.untilMs) end(entry.city, "expired", nowMs);
          continue;
        }
        const held = stillHeld(entry, nowMs);
        if (!held) continue;
        const [owner, occupier] = held;
        if (entry.kind === "looted") {
          // 정부 재건 전까지 하루마다 꺼내 간다
          withdraw(entry, owner, occupier, nowMs);
          // 재건할 수 있는 날이 지나면 재건 비용을 내고(모자라면 있는 만큼 — 국고가 빈 세력도 무너진 채 남지 않게) 다시 세운다 → 다시 전쟁
          // (D-527 "해당 세력재건시 다시 전쟁", 확인 대기 851)
          if (nowMs >= entry.untilMs && city) {
            burn(owner, govRebuildCost(city.housing, c.war), nowMs);
            counts.govRebuilt += 1;
            end(entry.city, "rebuilt", nowMs);
            o.resumeWar?.(owner, occupier, nowMs);
          }
          continue;
        }
        // 점령 상태: 옛 세력이 힘을 회복하면 몰아낸다(D-527, 유닛 수 비교 [임시])
        if (occupationExpelled(owner.units.size, occupier.units.size, c.war)) {
          end(entry.city, "expelled", nowMs);
          continue;
        }
        // 세금: 시각이 지난 만큼(하루 끝에만 돌아서 한 번에 한 번)
        if (nowMs >= entry.nextTaxMs) {
          const taken = takeTreasury(owner, occupier, c.war.occupyTaxBp, "occupation_tax", nowMs);
          if (taken > 0n) counts.occupationTaxes += 1;
          entry.taken += taken;
          entry.nextTaxMs = nextOccupationTaxMs(nowMs, c.war);
        }
        // 저절로 회복(D-527 "기본적으로 자율 회복됨")
        if (nowMs >= entry.untilMs) end(entry.city, "recovered", nowMs);
      }
    },

    check() {
      const problems: string[] = [];
      for (const [cityId, entry] of world.occupations) {
        if (cityId !== entry.city) problems.push(`W1 occupation key ${cityId} != city ${entry.city}`);
        if (entry.occupier === entry.owner) problems.push(`W2 occupation ${cityId} occupier = owner`);
        if (entry.untilMs <= entry.sinceMs) problems.push(`W3 occupation ${cityId} ends before it starts`);
      }
      return problems;
    },

    summary() {
      let occupied = 0;
      let annexed = 0;
      let looted = 0;
      for (const entry of world.occupations.values())
        if (entry.kind === "occupied") occupied += 1;
        else if (entry.kind === "looted") looted += 1;
        else annexed += 1;
      return { ...counts, occupied, annexed, looted };
    },
  };
}
