// 시뮬 세력·사회의 폐허 복원(시뮬·서버 같은 함수) — 기획 D-510·D-339·D-343·D-344·D-105·D-464 217, docs/adr/2026-11-07-ruins-restoration.md
// ("바뀜 (기획 답 480~489)").
// - 폐허 기록: 웨이브에 진 도시(시작 도시 아님)와 공성에서 이겨 약탈하고 폐허로 둔 도시(486 나)가 세계에서 빠질 때 world.ruins에 남긴다
//   (ID = 도시 ID, 옛 주인·주거).
// - 정부 짓기(claim): 주인 없는 폐허의 주인이 된다. NPC는 국고에서 정부 짓기 값을 내고(pay, 시설 칸 없이 바로 다 지은 것으로 친다), 유저는 서버
//   건물 짓기가 부른다(값 없이 — 짓기를 시작하면 자리를 잡는다, 480 다). 주인이 되면 복원 사업(목표 = 옛 주거 × 주거 1당 값 482 나, 화폐 = 도시가
//   드는 세력의 국고 화폐, 기한 = 처음 주인이 된 때 + 기한 날 수 485 다)이 생긴다. 정부 건물이 0%·사라지면 다시 지은 쪽이 주인(487 다, 낸 값·
//   목표·기한은 사업에 남는다).
// - 모금(open·fund): 정부 건물이 다 지어지고 서 있어야 한다(480 다). 주인은 언제든 넣고, 주인이 모금을 열면 누구나 넣는다(D-343). 낸 값은
//   에스크로 계정(restoreEscrow)에 둔다. 기한이 지나면 받지 않는다.
// - 복원: 목표를 채우면 그 값은 소각(복원 비용), 옛 지분(쓸모없던 것)을 소각하고 1000주를 낸 값 비례로 낸다(독재 = 지배 가문 과반,
//   society/restoration.ts). 도시는 같은 ID로 도시가 드는 세력에 돌아온다(주거 = 옛 주거, 행정 레벨 = 정부 건물 레벨 489 다 — NPC는 Lv1,
//   휴먼 없음 — 구인 카드로).
// - 바뀜(governance-6, 질문 2483 나 — D-585 6 "도시의 국가가 바뀌게 되면 사라진다. 폐허가 재건되면 그대로이다"): 옛 주인이 아닌 나라가 복원하면 도시의
//   나라가 바뀐 것으로 보아 그 도시의 옛 나라 주민세 빚을 지운다(cancelResidentDebts — 점령 길 moveCity와 같은 뜻). 옛 주인이 복원하면 빚은 그대로.
//   주민세 고리(residentProperty·residentHomes)가 없으면 원장을 훑지 않는다(시뮬은 고리가 없어 바이트 그대로).
// - 하루 끝: 도시가 드는 세력이 사라졌거나 기한이 지난 사업은 낸 값을 돌려주고 주인 없음으로 되돌린다.
// - NPC(484 다): 정부 짓기는 판단 후보 "폐허 복원"(npc/brain.ts)이 고른다. 후보(npcOptions) = 주인 없는(또는 정부 건물이 0%인) 폐허(옛
//   주인은 바로, 다른 세력은 폐허가 된 지 며칠 뒤), 실행은 npcAct. 넣기·투자는 판단 칸을 쓰지 않고 하루 끝 규칙식으로 돈다(판단마다
//   되풀이되면 연구 등을 밀어내 econ16 D-391 기술 조건이 떨어졌다 — ADR 잰 값): 주인 NPC는 국고 몫, 열린 모금에는 다른 NPC가 국고 몫 ×
//   상업 성향.
import type { RestoreView } from "../npc/brain.ts";
import type { LedgerBook } from "../ledger/ledgerBook.ts";
import type { SocietyCoefficients } from "../society/coefficients.ts";
import {
  acceptedContribution,
  contributionList,
  npcFundAmount,
  npcInvestAmount,
  raisedOf,
  restorationGoal,
  restorationShares,
} from "../society/restoration.ts";
import { cancelResidentDebts, refundCityFund } from "../society/residentTax.ts";
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
  | "invalid_amount"
  /** 정부 건물이 아직 다 지어지지 않았거나 0%·사라졌다(480 다) */
  | "not_built"
  /** 모금 기한이 지났다(485 다, 하루 끝에 돌려준다) */
  | "expired";

/** 정부 건물 상태(서버 고리): 짓는 중 · 다 지어지고 서 있음 · 0%·사라짐(487 다). level = 지금 레벨(짓는 중이면 0) */
export interface GovernmentStatus {
  readonly state: "building" | "up" | "down";
  readonly level: number;
}

export type GovernmentLookup = (buildingId: number) => GovernmentStatus;

export interface RuinsSummary {
  /** 끝에 남은 폐허 수 */
  readonly left: number;
  /** 정부를 지어 주인이 된 수, 복원된 수, 도시가 드는 세력이 사라져 돌려준 수 */
  readonly claimed: number;
  readonly restored: number;
  readonly released: number;
  /** 모금 기한이 지나 돌려준 수(485 다), 정부 건물이 무너져 다시 지은 쪽이 주인이 된 수(487 다) */
  readonly expired: number;
  readonly reclaimed: number;
  /** 넣은 거래 수와 넣은 값(자산 → 최소 단위) */
  readonly contributions: number;
  readonly raised: Record<string, string>;
}

export interface SocietyRuins {
  /** 폐허를 남긴다(도시를 세계에서 빼기 전에 부른다) */
  record(city: SimCity, nowMs: number): void;
  /**
   * 정부를 짓고 주인이 된다(주인 없음 또는 정부 건물이 0%·사라짐). pay = 정부 짓기 값을 국고에서 낸다(NPC). building = 2차맵 정부 건물
   * (서버 유저)
   */
  claim(
    ruinId: number,
    claimant: number,
    joinFaction: number,
    nowMs: number,
    options: { readonly pay: boolean; readonly building?: number | null },
  ): RuinResult;
  /** 그 폐허에 정부를 지어 주인이 될 수 있나(주인 없음 또는 정부 건물이 0%·사라짐, 487 다) */
  claimable(ruinId: number): boolean;
  /** 복원 사업을 열 수 있나(주인이 있고 정부 건물이 다 지어지고 서 있음, 480 다) */
  ready(ruinId: number): boolean;
  /** 모금 기한(ms). 주인이 없으면 0, 기한 칸이 0 이하면 끝없음(Number.MAX_SAFE_INTEGER) */
  deadlineOf(ruinId: number): number;
  /** 주인이 모금을 연다 */
  open(ruinId: number, by: number, nowMs: number): RuinResult;
  /** 넣는다(남은 몫까지만 받는다). 목표를 채우면 그 자리에서 복원 */
  fund(
    ruinId: number,
    by: number,
    amount: bigint,
    nowMs: number,
  ): { readonly result: RuinResult; readonly accepted: bigint; readonly restored: boolean };
  /** 지금 목표를 채우면 나눌 지분(화면 미리 셈) */
  previewShares(ruinId: number): Holding[];
  /** 정부 건물 상태 고리(서버). 없으면 건물이 있는 폐허도 다 지어진 것으로 친다(시뮬은 NPC만 — 건물이 없다) */
  attachGovernment(lookup: GovernmentLookup): void;
  /** NPC 판단 후보(484 다): 정부를 지을 폐허 하나(옛 내 폐허 먼저, 같으면 작은 ID). 없으면 빈 목록 */
  npcOptions(faction: SimFaction, nowMs: number): RestoreView[];
  /** NPC가 고른 "폐허 복원"(정부 짓기)을 실행한다. 지었나 */
  npcAct(faction: SimFaction, ruinId: number, nowMs: number): boolean;
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

/** 끝없는 기한(기한 칸이 0 이하) */
const NO_DEADLINE = Number.MAX_SAFE_INTEGER;
/** 행정 레벨 범위(SimCity.adminLevel, 49 N45) */
const ADMIN_MIN = 1;
const ADMIN_MAX = 5;

export function createSocietyRuins(o: SocietyRuinsOptions): SocietyRuins {
  const { world } = o;
  const book: LedgerBook = world.book;
  const counts = { claimed: 0, restored: 0, released: 0, expired: 0, reclaimed: 0, contributions: 0 };
  const raisedTotal = new Map<string, bigint>();
  let government: GovernmentLookup | undefined;
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
  /** 정부 건물 상태(건물이 없으면 = NPC = 다 지어짐) */
  const statusOf = (ruin: SimRuin): GovernmentStatus =>
    ruin.building === null || !government ? { state: "up", level: 1 } : government(ruin.building);
  const isReady = (ruin: SimRuin): boolean => ruin.claimant !== null && statusOf(ruin).state === "up";
  const deadlineOf = (ruin: SimRuin): number => {
    if (ruin.claimant === null) return 0;
    if (ruin.deadlineMs > 0) return ruin.deadlineMs;
    const days = rules().fundDays;
    return days > 0 ? ruin.claimedAtMs + days * DAY_MS : NO_DEADLINE;
  };

  /** 낸 값을 돌려주고 주인 없음으로(도시가 드는 세력이 사라짐·기한이 지남) */
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
    ruin.deadlineMs = 0;
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
      // 행정 레벨 = 그 도시 안 정부 건물 레벨(489 다). NPC는 시설 칸 없는 정부 = Lv1
      adminLevel: Math.min(ADMIN_MAX, Math.max(ADMIN_MIN, statusOf(ruin).level)),
      recruitDraw: null,
      development: 0,
      nextRebellionMs: nowMs,
    };
    world.ruins.delete(ruin.id);
    world.cities.set(city.id, city);
    faction.cities.add(city.id);
    // 다른 나라가 복원 = 도시의 나라가 바뀜 → 옛 나라 주민세 빚을 지운다(질문 2483 나). 같은 나라면 그대로(D-585 6)
    // 옛 나라의 그 도시 운영비 금고 남은 몫은 옛 나라 국고로(gov-fix-2 — 질문 2537)
    if (faction.id !== ruin.formerOwner && (o.hooks?.residentProperty || o.hooks?.residentHomes)) {
      cancelResidentDebts(book, ruin.formerOwner, ruin.id, nowMs);
      refundCityFund(book, ruin.formerOwner, ruin.id, nowMs);
    }
    o.hooks?.cityFounded?.(city.id, 0, nowMs);
    o.onRestored(faction, city, nowMs);
    counts.restored += 1;
  };

  const fund: SocietyRuins["fund"] = (ruinId, by, amount, nowMs) => {
    const ruin = world.ruins.get(ruinId);
    if (!ruin) return { result: "unknown_ruin", accepted: 0n, restored: false };
    if (ruin.claimant === null || ruin.joinFaction === null)
      return { result: "not_claimed", accepted: 0n, restored: false };
    if (!isReady(ruin)) return { result: "not_built", accepted: 0n, restored: false };
    if (nowMs >= deadlineOf(ruin)) return { result: "expired", accepted: 0n, restored: false };
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

  /** 정부를 지을 수 있나: 주인 없음, 또는 주인의 정부 건물이 0%·사라짐(487 다) */
  const canClaim = (ruin: SimRuin): boolean =>
    ruin.claimant === null || (ruin.building !== null && statusOf(ruin).state === "down");

  const claim: SocietyRuins["claim"] = (ruinId, claimant, joinFaction, nowMs, options) => {
    const ruin = world.ruins.get(ruinId);
    if (!ruin) return "unknown_ruin";
    if (!canClaim(ruin)) return "claimed";
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
    const again = ruin.claimant !== null;
    if (again) {
      // 다시 지은 쪽이 주인(487 다): 낸 값·목표·화폐·모금 열림·기한은 사업에 남는다
      ruin.deadlineMs = deadlineOf(ruin);
      counts.reclaimed += 1;
    } else {
      ruin.goal = restorationGoal(ruin.housing, rules());
      ruin.currency = asset;
      ruin.open = false;
      const days = rules().fundDays;
      ruin.deadlineMs = days > 0 ? nowMs + days * DAY_MS : 0;
      counts.claimed += 1;
    }
    ruin.claimant = claimant;
    ruin.joinFaction = joinFaction;
    ruin.claimedAtMs = nowMs;
    ruin.building = options.building ?? null;
    return "ok";
  };

  /** NPC가 넣을 값(내 사업 = 국고 몫, 남의 사업 = 국고 몫 × 상업 성향) */
  const npcAmount = (faction: SimFaction, ruin: SimRuin): bigint => {
    const r = rules();
    const held = book.balanceOf(faction.id, ruin.currency);
    const raised = raisedOf(ruin.contributions);
    return ruin.claimant === faction.id
      ? npcFundAmount(held, ruin.goal, raised, r.npcFundPm)
      : npcInvestAmount(held, ruin.goal, raised, r.npcInvestPm, faction.traits.commerce);
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
        deadlineMs: 0,
        contributions: new Map(),
      });
    },
    claim,
    claimable(ruinId) {
      const ruin = world.ruins.get(ruinId);
      return ruin !== undefined && canClaim(ruin);
    },
    ready(ruinId) {
      const ruin = world.ruins.get(ruinId);
      return ruin !== undefined && isReady(ruin);
    },
    deadlineOf(ruinId) {
      const ruin = world.ruins.get(ruinId);
      return ruin ? deadlineOf(ruin) : 0;
    },
    open(ruinId, by, nowMs) {
      const ruin = world.ruins.get(ruinId);
      if (!ruin) return "unknown_ruin";
      if (ruin.claimant === null) return "not_claimed";
      if (ruin.claimant !== by) return "not_owner";
      if (!isReady(ruin)) return "not_built";
      if (nowMs >= deadlineOf(ruin)) return "expired";
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
    attachGovernment(lookup) {
      government = lookup;
    },

    npcOptions(faction, nowMs) {
      const r = rules();
      let pick: SimRuin | undefined;
      for (const ruin of sorted()) {
        // 주인 없음, 또는 주인의 정부 건물이 0%·사라짐(487 다 — 다시 지은 쪽이 주인). 내가 주인이면 건너뛴다(NPC는 건물 없이 값으로 짓는다)
        if (!canClaim(ruin) || ruin.claimant === faction.id) continue;
        // 옛 주인은 바로, 다른 세력은 폐허가 된 지 며칠 뒤. 옛 내 폐허를 먼저(같으면 작은 ID)
        const former = ruin.formerOwner === faction.id;
        if (!former && Math.floor((nowMs - ruin.ruinedAtMs) / DAY_MS) < r.npcClaimAfterDays) continue;
        if (!pick || (former && pick.formerOwner !== faction.id)) pick = ruin;
      }
      return pick
        ? [{ ruin: pick.id, cost: BigInt(r.claimCost), former: pick.formerOwner === faction.id }]
        : [];
    },

    npcAct(faction, ruinId, nowMs) {
      const ruin = world.ruins.get(ruinId);
      if (!ruin || !faction.alive) return false;
      if (claim(ruinId, faction.id, faction.id, nowMs, { pay: true }) !== "ok") return false;
      // 국고가 목표보다 적으면 모금을 연다(누구나 넣게)
      if (treasury(faction) < ruin.goal) ruin.open = true;
      return true;
    },

    endOfDay(nowMs) {
      // 1) 도시가 드는 세력이 사라졌거나 모금 기한이 지난 사업: 낸 값을 돌려주고 주인 없음으로(485 다)
      for (const ruin of sorted()) {
        if (ruin.joinFaction === null) continue;
        if (!world.factions.get(ruin.joinFaction)?.alive) {
          release(ruin, nowMs);
          counts.released += 1;
        } else if (nowMs >= deadlineOf(ruin)) {
          release(ruin, nowMs);
          counts.expired += 1;
        }
      }
      // 2) NPC 넣기 규칙식: 주인 NPC는 국고 몫, 열린 모금에는 다른 NPC가 국고 몫 × 상업 성향(누구나, D-343). 정부 건물이 서 있고 기한 전인
      //    사업만(fund가 본다). 유저 주인 사업에도 투자한다
      const alive = [...world.factions.values()].filter((f) => f.alive).toSorted((a, b) => a.id - b.id);
      for (const ruin of sorted()) {
        const owner = ruin.claimant === null ? undefined : world.factions.get(ruin.claimant);
        if (!owner?.alive) continue;
        const amount = npcAmount(owner, ruin);
        if (amount > 0n) fund(ruin.id, owner.id, amount, nowMs);
      }
      for (const ruin of sorted()) {
        if (!ruin.open) continue;
        for (const f of alive) {
          const live = world.ruins.get(ruin.id);
          if (!live) break;
          if (f.id === live.claimant) continue;
          const amount = npcAmount(f, live);
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
