// 시뮬 공성 결과 실행 — 기획 D-520, docs/adr/2026-11-07-war-outcomes.md. 규칙(수)은 society/warOutcomes.ts, 고르기는 NPC 규칙식
// (npc/policy.ts occupationChoice). society.ts occupy가 고른 결과마다 여기를 부른다(시뮬·서버 같은 함수 — 서버 NPC 공격도 이 길):
// - 약탈: 도시 금고 몫(lootTakeBp, 공물·약탈과 같은 "국고 ÷ 도시 수" 꼴) + 그 도시 공공 창고(도시 주인 세력의 그 도시 창고 물건) 몫을 점령자에게.
//   물건은 점령자의 가장 오래된 도시 창고로(도시가 없으면 위치 없이 — 원장 보유). 도시 소유는 그대로.
// - 점령 상태: 도시 ID마다 상태 하나(world.occupations). 하루 끝에 세금 시각이 지났으면 그 도시 몫 세금을 거두고, 기한·주인 바뀜·점령자 사라짐이면 끝.
// - 점령·귀속: 재건 비용을 점령자 국고에서 소각(모자라면 있는 만큼), 회복 불이익 상태(annexed)를 둔다. 도시 넘기기·지분·편입 제안은 society.ts 그대로.
// 같은 도시에 새 결과가 오면 옛 상태를 지우고 새로 둔다(점령 상태 중 다른 세력이 점령·귀속하면 그 점령은 끝난다).
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import {
  annexPenaltyUntil,
  bpShare,
  nextOccupationTaxMs,
  occupationWindow,
  raidCooldownUntil,
  rebuildCost,
  recoveryDayPm,
} from "../society/warOutcomes.ts";
import type { SimHooks } from "./npcRun.ts";
import type { SimCity, SimFaction, SimOccupation, SimWorld } from "./world.ts";

export interface WarSummary {
  /** 점령 상태가 거둔 세금 거래 수·점령 상태가 끝난 수 */
  readonly occupationTaxes: number;
  readonly occupationsEnded: number;
  /** 점령·귀속 재건 비용을 낸 수 */
  readonly rebuilt: number;
  /** 지금 남은 점령 상태·회복 불이익 수 */
  readonly occupied: number;
  readonly annexed: number;
}

export interface SocietyWar {
  /** 약탈: 도시 금고 몫 + 공공 창고 몫. 가져간 국고 값(대상 국고 화폐 최소 단위) */
  raid(attacker: SimFaction, target: SimFaction, city: SimCity, nowMs: number): bigint;
  /** 점령 상태 시작(소유 그대로) */
  occupy(attacker: SimFaction, target: SimFaction, city: SimCity, nowMs: number): SimOccupation;
  /** 점령·귀속: 재건 비용 소각 + 회복 불이익. 소각한 값 */
  annex(attacker: SimFaction, target: SimFaction, city: SimCity, nowMs: number): bigint;
  /** 하루 만족도 다가가기 빠르기(점령·귀속 불이익 중 회복이면 느리게) */
  recoveryPm(cityId: number, milli: number, targetMilli: number, nowMs: number): number;
  /** 하루 끝: 점령 상태 세금·끝, 끝난 회복 불이익 지우기 */
  endOfDay(nowMs: number): void;
  check(): string[];
  summary(): WarSummary;
}

export function createSocietyWar(o: {
  readonly world: SimWorld;
  readonly c: SocietyCoefficients;
  readonly hooks: SimHooks | undefined;
  readonly treasuryAsset: (f: SimFaction) => string;
}): SocietyWar {
  const { world, c } = o;
  const book: LedgerBook = world.book;
  const counts = { occupationTaxes: 0, occupationsEnded: 0, rebuilt: 0 };
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

  const end = (cityId: number): void => {
    if (world.occupations.delete(cityId)) counts.occupationsEnded += 1;
  };

  return {
    raid(attacker, target, city, nowMs) {
      const taken = takeTreasury(target, attacker, c.lootTakeBp, "loot", nowMs);
      // 그 세력은 쉬는 날 동안 이 도시를 다시 치지 않는다(확인 대기 685)
      const until = raidCooldownUntil(nowMs, c.war);
      if (until > nowMs) attacker.raided.set(city.id, until);
      // 공공 창고 = 그 도시 창고의 도시 주인 세력 물건(유저·다른 세력 물건은 사유 자산이라 건드리지 않는다, D-161)
      const home = [...attacker.cities].filter((id) => world.cities.has(id)).toSorted((a, b) => a - b)[0];
      const entries = [];
      for (const account of [...book.accounts()].toSorted((a, b) => a.id - b.id)) {
        if (account.ownerId !== target.id || account.location !== city.id || account.balance <= 0n) continue;
        const amount = bpShare(account.balance, c.war.raidGoodsBp);
        if (amount <= 0n) continue;
        entries.push({ account: account.id, amount: -amount });
        entries.push({ account: book.ownerAccount(attacker.id, account.asset, home ?? null), amount });
      }
      if (entries.length > 0) book.post({ kind: "loot", atMs: nowMs, entries });
      return taken;
    },

    occupy(attacker, target, city, nowMs) {
      end(city.id);
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
      end(city.id);
      const asset = o.treasuryAsset(attacker);
      const want = rebuildCost(city.housing, c.war);
      const have = treasury(attacker);
      const cost = want < have ? want : have > 0n ? have : 0n;
      if (cost > 0n) {
        book.post({
          kind: "burn",
          atMs: nowMs,
          entries: [
            { account: book.ownerAccount(attacker.id, asset), amount: -cost },
            { account: book.systemAccount(`sink:${asset}`, asset), amount: cost },
          ],
        });
        counts.rebuilt += 1;
      }
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
      for (const faction of world.factions.values())
        for (const [cityId, until] of faction.raided) if (until <= nowMs) faction.raided.delete(cityId);
      for (const entry of [...world.occupations.values()].toSorted((a, b) => a.city - b.city)) {
        const city = world.cities.get(entry.city);
        if (entry.kind === "annexed") {
          // 회복 불이익: 기한이 지나거나 도시가 다른 주인에게 가면(다시 점령·반란·독립·폐허) 끝
          if (nowMs >= entry.untilMs || city?.owner !== entry.occupier) end(entry.city);
          continue;
        }
        const owner = world.factions.get(entry.owner);
        const occupier = world.factions.get(entry.occupier);
        // 점령 상태 끝(확인 대기 681): 도시 주인이 바뀜(폐허 포함)·점령자나 주인이 사라짐
        if (city?.owner !== entry.owner || !owner?.alive || !occupier?.alive) {
          end(entry.city);
          continue;
        }
        // 세금: 시각이 지난 만큼(하루 끝에만 돌아서 한 번에 한 번)
        if (nowMs >= entry.nextTaxMs) {
          const taken = takeTreasury(owner, occupier, c.war.occupyTaxBp, "occupation_tax", nowMs);
          if (taken > 0n) counts.occupationTaxes += 1;
          entry.taken += taken;
          entry.nextTaxMs = nextOccupationTaxMs(nowMs, c.war);
        }
        if (nowMs >= entry.untilMs) end(entry.city);
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
      for (const entry of world.occupations.values())
        if (entry.kind === "occupied") occupied += 1;
        else annexed += 1;
      return { ...counts, occupied, annexed };
    },
  };
}
