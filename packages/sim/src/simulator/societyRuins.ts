// 시뮬 세력·사회의 폐허 복원(시뮬·서버 같은 함수) — 기획 D-510·D-339·D-343·D-344·D-105·D-464 217, docs/adr/2026-11-07-ruins-restoration.md
// - 폐허 기록: 웨이브에 진 도시(시작 도시 아님)가 세계에서 빠질 때 world.ruins에 남긴다(ID = 도시 ID, 옛 주인·주거).
// - 정부 짓기(claim): 주인 없는 폐허의 주인이 된다. NPC는 국고에서 정부 짓기 값을 내고(pay), 유저는 서버 건물 짓기가 부른다(값 없이).
//   주인이 되면 복원 사업(목표 = 설정 칸, 화폐 = 도시가 드는 세력의 국고 화폐)이 생긴다.
// - 모금(open·fund): 주인은 언제든 넣고, 주인이 모금을 열면 누구나 넣는다(D-343). 낸 값은 에스크로 계정(restoreEscrow)에 둔다.
// - 복원: 목표를 채우면 그 값은 소각(복원 비용), 옛 지분(쓸모없던 것)을 소각하고 1000주를 낸 값 비례로 낸다(독재 = 지배 가문 과반,
//   society/restoration.ts). 도시는 같은 ID로 도시가 드는 세력에 돌아온다(주거 = 옛 주거, 행정 건물 Lv1, 휴먼 없음 — 구인 카드로).
// - 도시가 드는 세력이 사라지면 낸 값을 돌려주고 주인 없음으로 되돌린다.
// - NPC 규칙식(하루 끝, 확인 대기 질문 484): 주인 없는 폐허는 옛 주인 세력이 정부를 짓고(값이 되면), 폐허가 된 지 며칠이 지나면 값을 낼 수
//   있는 세력 가운데 도시가 가장 적은 세력이 짓는다. 주인 NPC는 날마다 국고 몫을 넣고(국고가 목표보다 적으면 모금을 연다), 열린 모금에는
//   다른 NPC가 상업 성향만큼 넣는다.
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import {
  contributionList,
  npcFundAmount,
  npcInvestAmount,
  raisedOf,
  restorationShares,
  acceptedContribution,
} from "../society/restoration.ts";
import { type Holding, burnShares, issueShares } from "../society/shares.ts";
import { DAY_MS } from "./metrics.ts";
import type { SimHooks } from "./npcRun.ts";
import {
  type SimCity,
  type SimFaction,
  type SimRuin,
  type SimWorld,
  restoreEscrow,
  rulingFamilyOf,
} from "./world.ts";

/** 폐허 명령 결과(서버가 프로토콜 코드로 옮긴다) */
export type RuinResult =
  | "ok"
  | "unknown_ruin"
  | "claimed"
  | "not_claimed"
  | "not_owner"
  | "not_open"
  | "already_open"
  | "insufficient_funds"
  | "no_faction"
  | "invalid_amount";

export interface RuinsSummary {
  /** 끝에 남은 폐허 수 */
  readonly left: number;
  /** 정부를 지어 주인이 된 수, 복원된 수, 도시가 드는 세력이 사라져 돌려준 수 */
  readonly claimed: number;
  readonly restored: number;
  readonly released: number;
  /** 넣은 거래 수와 넣은 값(자산 → 최소 단위) */
  readonly contributions: number;
  readonly raised: Record<string, string>;
}

export interface SocietyRuins {
  /** 폐허를 남긴다(도시를 세계에서 빼기 전에 부른다) */
  record(city: SimCity, nowMs: number): void;
  /** 정부를 짓고 주인이 된다. pay = 정부 짓기 값을 국고에서 낸다(NPC). building = 2차맵 정부 건물(서버 유저) */
  claim(
    ruinId: number,
    claimant: number,
    joinFaction: number,
    nowMs: number,
    options: { readonly pay: boolean; readonly building?: number | null },
  ): RuinResult;
  /** 주인이 모금을 연다 */
  open(ruinId: number, by: number): RuinResult;
  /** 넣는다(남은 몫까지만 받는다). 목표를 채우면 그 자리에서 복원 */
  fund(
    ruinId: number,
    by: number,
    amount: bigint,
    nowMs: number,
  ): { readonly result: RuinResult; readonly accepted: bigint; readonly restored: boolean };
  /** 지금 목표를 채우면 나눌 지분(화면 미리 셈) */
  previewShares(ruinId: number): Holding[];
  endOfDay(nowMs: number): void;
  check(): string[];
  summary(): RuinsSummary;
}

export interface SocietyRuinsOptions {
  readonly world: SimWorld;
  readonly c: SocietyCoefficients;
  readonly hooks: SimHooks | undefined;
  readonly treasuryAsset: (faction: SimFaction) => string;
  /** 도시가 돌아온 뒤(기술 기록) */
  readonly onRestored: (faction: SimFaction, city: SimCity, nowMs: number) => void;
}

export function createSocietyRuins(o: SocietyRuinsOptions): SocietyRuins {
  const { world } = o;
  const book: LedgerBook = world.book;
  const counts = { claimed: 0, restored: 0, released: 0, contributions: 0 };
  const raisedTotal = new Map<string, bigint>();
  const rules = () => o.c.restoration;
  const sorted = (): SimRuin[] => [...world.ruins.values()].toSorted((a, b) => a.id - b.id);
  const escrow = (ruin: SimRuin): number =>
    book.systemAccount(restoreEscrow(ruin.id, ruin.currency), ruin.currency);
  const treasury = (f: SimFaction): bigint => book.balanceOf(f.id, o.treasuryAsset(f));
  /** 에스크로 잔고(계정을 새로 만들지 않는다 — 검사용) */
  const escrowBalance = (ruin: SimRuin): bigint => {
    const code = restoreEscrow(ruin.id, ruin.currency);
    for (const account of book.accounts()) if (account.systemCode === code) return account.balance;
    return 0n;
  };

  /** 도시가 드는 세력이 사라졌을 때: 낸 값을 돌려주고 주인 없음으로 */
  const release = (ruin: SimRuin, nowMs: number): void => {
    const list = contributionList(ruin.contributions);
    if (list.length > 0) {
      const total = list.reduce((sum, h) => sum + h.amount, 0n);
      book.post({
        kind: "restore_refund",
        atMs: nowMs,
        entries: [
          { account: escrow(ruin), amount: -total },
          ...list.map((h) => ({ account: book.ownerAccount(h.owner, ruin.currency), amount: h.amount })),
        ],
      });
    }
    ruin.contributions.clear();
    ruin.claimant = null;
    ruin.joinFaction = null;
    ruin.claimedAtMs = 0;
    ruin.building = null;
    ruin.goal = 0n;
    ruin.currency = "";
    ruin.open = false;
    counts.released += 1;
  };

  const restore = (ruin: SimRuin, faction: SimFaction, nowMs: number): void => {
    const raised = raisedOf(ruin.contributions);
    if (raised > 0n)
      book.post({
        kind: "restore_spend",
        atMs: nowMs,
        entries: [
          { account: escrow(ruin), amount: -raised },
          { account: book.systemAccount(`sink:${ruin.currency}`, ruin.currency), amount: raised },
        ],
      });
    // 옛 지분(무너질 때 쓸모없게 남은 것)은 소각하고 낸 값 비례로 새로 낸다(D-339·D-342·D-344)
    burnShares(book, ruin.id, nowMs);
    issueShares(
      book,
      ruin.id,
      restorationShares(
        contributionList(ruin.contributions),
        BigInt(o.c.sharesPerCity),
        faction.regime,
        rulingFamilyOf(faction),
      ),
      nowMs,
    );
    const city: SimCity = {
      id: ruin.id,
      owner: faction.id,
      start: false,
      housing: ruin.housing,
      researchLevel: 0,
      // [임시] 복원한 도시 행정 건물 = Lv1(옛 마을회관, 정부 건물 레벨과 잇지 않음 — 확인 대기)
      adminLevel: 1,
      recruitDraw: null,
      development: 0,
      nextRebellionMs: nowMs,
    };
    world.ruins.delete(ruin.id);
    world.cities.set(city.id, city);
    faction.cities.add(city.id);
    o.hooks?.cityFounded?.(city.id, 0, nowMs);
    o.onRestored(faction, city, nowMs);
    counts.restored += 1;
  };

  const fund: SocietyRuins["fund"] = (ruinId, by, amount, nowMs) => {
    const ruin = world.ruins.get(ruinId);
    if (!ruin) return { result: "unknown_ruin", accepted: 0n, restored: false };
    if (ruin.claimant === null || ruin.joinFaction === null)
      return { result: "not_claimed", accepted: 0n, restored: false };
    if (by !== ruin.claimant && !ruin.open) return { result: "not_open", accepted: 0n, restored: false };
    if (amount <= 0n) return { result: "invalid_amount", accepted: 0n, restored: false };
    const faction = world.factions.get(ruin.joinFaction);
    if (!faction?.alive) return { result: "no_faction", accepted: 0n, restored: false };
    const accepted = acceptedContribution(ruin.goal, raisedOf(ruin.contributions), amount);
    if (accepted <= 0n) return { result: "invalid_amount", accepted: 0n, restored: false };
    if (book.balanceOf(by, ruin.currency) < accepted)
      return { result: "insufficient_funds", accepted: 0n, restored: false };
    book.post({
      kind: "restore_fund",
      atMs: nowMs,
      entries: [
        { account: book.ownerAccount(by, ruin.currency), amount: -accepted },
        { account: escrow(ruin), amount: accepted },
      ],
    });
    ruin.contributions.set(by, (ruin.contributions.get(by) ?? 0n) + accepted);
    counts.contributions += 1;
    raisedTotal.set(ruin.currency, (raisedTotal.get(ruin.currency) ?? 0n) + accepted);
    const done = raisedOf(ruin.contributions) >= ruin.goal;
    if (done) restore(ruin, faction, nowMs);
    return { result: "ok", accepted, restored: done };
  };

  const claim: SocietyRuins["claim"] = (ruinId, claimant, joinFaction, nowMs, options) => {
    const ruin = world.ruins.get(ruinId);
    if (!ruin) return "unknown_ruin";
    if (ruin.claimant !== null) return "claimed";
    const faction = world.factions.get(joinFaction);
    if (!faction?.alive) return "no_faction";
    const asset = o.treasuryAsset(faction);
    if (options.pay) {
      const cost = BigInt(rules().claimCost);
      if (book.balanceOf(claimant, asset) < cost) return "insufficient_funds";
      if (cost > 0n)
        book.post({
          kind: "burn",
          atMs: nowMs,
          entries: [
            { account: book.ownerAccount(claimant, asset), amount: -cost },
            { account: book.systemAccount(`sink:${asset}`, asset), amount: cost },
          ],
        });
    }
    ruin.claimant = claimant;
    ruin.joinFaction = joinFaction;
    ruin.claimedAtMs = nowMs;
    ruin.building = options.building ?? null;
    ruin.goal = BigInt(Math.max(1, rules().goal));
    ruin.currency = asset;
    ruin.open = false;
    counts.claimed += 1;
    return "ok";
  };

  return {
    record(city, nowMs) {
      if (city.start) return;
      world.ruins.set(city.id, {
        id: city.id,
        formerOwner: city.owner,
        ruinedAtMs: nowMs,
        housing: city.housing,
        claimant: null,
        joinFaction: null,
        claimedAtMs: 0,
        building: null,
        goal: 0n,
        currency: "",
        open: false,
        contributions: new Map(),
      });
    },
    claim,
    open(ruinId, by) {
      const ruin = world.ruins.get(ruinId);
      if (!ruin) return "unknown_ruin";
      if (ruin.claimant === null) return "not_claimed";
      if (ruin.claimant !== by) return "not_owner";
      if (ruin.open) return "already_open";
      ruin.open = true;
      return "ok";
    },
    fund,
    previewShares(ruinId) {
      const ruin = world.ruins.get(ruinId);
      const faction = ruin?.joinFaction === null ? undefined : world.factions.get(ruin?.joinFaction ?? -1);
      if (!ruin || !faction) return [];
      return restorationShares(
        contributionList(ruin.contributions),
        BigInt(o.c.sharesPerCity),
        faction.regime,
        rulingFamilyOf(faction),
      );
    },

    endOfDay(nowMs) {
      const r = rules();
      // 1) 도시가 드는 세력이 사라진 사업: 돌려주고 주인 없음으로
      for (const ruin of sorted())
        if (ruin.joinFaction !== null && !world.factions.get(ruin.joinFaction)?.alive) release(ruin, nowMs);
      // 2) 주인 없는 폐허: 옛 주인 → (며칠 뒤) 값을 낼 수 있는 세력 가운데 도시가 가장 적은 세력(같으면 작은 ID)이 정부를 짓는다
      const alive = [...world.factions.values()].filter((f) => f.alive).toSorted((a, b) => a.id - b.id);
      const cost = BigInt(r.claimCost);
      for (const ruin of sorted()) {
        if (ruin.claimant !== null) continue;
        const former = world.factions.get(ruin.formerOwner);
        let pick: SimFaction | undefined = former?.alive && treasury(former) >= cost ? former : undefined;
        if (!pick && Math.floor((nowMs - ruin.ruinedAtMs) / DAY_MS) >= r.npcClaimAfterDays)
          for (const f of alive)
            if (treasury(f) >= cost && (!pick || f.cities.size < pick.cities.size)) pick = f;
        if (!pick || claim(ruin.id, pick.id, pick.id, nowMs, { pay: true }) !== "ok") continue;
        // 국고가 목표보다 적으면 모금을 연다
        if (treasury(pick) < ruin.goal) ruin.open = true;
      }
      // 3) 주인 NPC가 넣는다(주인이 세력인 사업만 — 유저 주인은 스스로 넣는다)
      for (const ruin of sorted()) {
        const owner = ruin.claimant === null ? undefined : world.factions.get(ruin.claimant);
        if (!owner?.alive) continue;
        const amount = npcFundAmount(
          book.balanceOf(owner.id, ruin.currency),
          ruin.goal,
          raisedOf(ruin.contributions),
          r.npcFundPm,
        );
        if (amount > 0n) fund(ruin.id, owner.id, amount, nowMs);
      }
      // 4) 열린 모금에 다른 NPC가 상업 성향만큼 넣는다(누구나, D-343)
      for (const ruin of sorted()) {
        if (!ruin.open) continue;
        for (const f of alive) {
          const live = world.ruins.get(ruin.id);
          if (!live) break;
          if (f.id === live.claimant || !f.alive) continue;
          const amount = npcInvestAmount(
            book.balanceOf(f.id, live.currency),
            live.goal,
            raisedOf(live.contributions),
            r.npcInvestPm,
            f.traits.commerce,
          );
          if (amount > 0n) fund(live.id, f.id, amount, nowMs);
        }
      }
    },

    check() {
      const problems: string[] = [];
      for (const ruin of world.ruins.values()) {
        if (world.cities.has(ruin.id)) problems.push(`R1 ruin ${ruin.id} is also a city`);
        const raised = raisedOf(ruin.contributions);
        const held = ruin.currency === "" ? 0n : escrowBalance(ruin);
        if (held !== raised) problems.push(`R2 ruin ${ruin.id} escrow ${held} != contributions ${raised}`);
        if (ruin.claimant !== null && raised >= ruin.goal) problems.push(`R3 ruin ${ruin.id} funded`);
      }
      return problems;
    },

    summary() {
      const raised: Record<string, string> = {};
      for (const asset of [...raisedTotal.keys()].toSorted())
        raised[asset] = String(raisedTotal.get(asset) ?? 0n);
      return { left: world.ruins.size, ...counts, raised };
    },
  };
}
