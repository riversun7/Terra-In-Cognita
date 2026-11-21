// 나라 의결 서비스(서버 권위) — docs/adr/2026-11-21-governance.md, 질문 2351~2365 답(D-580·기획 대조), 기획 D-217·D-5057·D-131·D-344·D-349·D-574 10.
// - 명령(WebSocket gov_*): 안건 올리기·표 던지기·후보 등록. 조회는 view.ts.
// - 틱(1분마다, attach.ts): 임기(민주주의·자본주의 — 처음 보는 나라는 지금부터 임기를 센다, 끝나기 투표 기간 전에 선출 자동으로 열기), NPC 표(D-323
//   점수 고르기 — npcVote.ts, 선출은 후보 등록 기간 뒤), 닫기(셈 — @terra/shared/governance), 집행(유예가 지난 가결 안건).
// - 독재: 투표가 없다. 지도자(지배 가문의 장)가 체제 전환을 직권으로 정하고 유예(D-131 7일) 뒤 집행(D-217, 2362 가). 독재가 되면 열린 투표는 취소.
// - 독재로 가는 길(2363 가 — D-344·D-349): 지배 쪽 지분이 과반이어야 한다. 과반이면 지도자가 직권으로 정한다(유예 뒤). 나머지 지분은 남고 의결권만
//   잃는다(governance_state.share_votes_suspended — 몰수 아님). 군사 쿠데타 길은 조건·절차가 정해지지 않아 만들지 않았다(질문 2401).
// - 선출(2358 가): 이긴 가문이 지배 가문이 된다(다른 가문이면 지배 가문이 바뀐다). 그 가문의 장이 지도자. 임기 = 닫은 때 + 임기 칸.
// - 해임 가결: 바로 다시 뽑기(선출 안건)를 연다. 해임된 가문은 그 선출에 나서지 못한다. 결과까지 해임된 가문이 임시로 남는다 [임시 질문 2403].
// - 선전포고 가결: 바로 전쟁(세력·사회 declareWar — NPC와 같은 길, 2364 "전쟁 즉시").
// - 바뀜(governance-2): NPC 도전자도 성향 규칙식으로 선출에 나선다(질문 2404 나 — npcVote.ts npcChallengers). 해임 뒤 다시 뽑기가 실패하면 지도자 자리가 빈다
//   (질문 2403 답 D-582 — governance_state.vacant_since_ms, 다음 선출로 채운다. 빈자리가 길어지면 나라가 갈라지는 절차는 빈틈). 결과가 정해진 안건은 일찍 닫는다
//   (질문 2410 가 — early.ts). 틱마다 지배 가문 반영·도시 지분 정리(shareFixups.ts — 2406·D-338·D-582). 독재가 끝나면 의결권 정지 표시를 지운다(질문 2405 가 확정).
// - 바뀜(governance-3): 군사 쿠데타(coup.ts — 질문 2433 답·D-583), 지배 쪽 지분 따라가기·지분 과반을 사서 된 독재의 국고 지분 남기기(shareFixups.ts — 2432 나·(다)
//   답 D-583), 빈자리 도시 독립 투표(cityVotes.ts — 2434 (가) 답 D-583), 국고 지분 팔기 안건(2438 답 D-583 — 독재는 지배 가문장 직권, 승인된 판매는 approvedShareSale
//   고리로 넘긴다 — 정부 지분 시장 cityShares/service.ts approvedSale이 국고 팔 주문을 건다, docs/adr/2026-11-21-share-market.md), 독재 지도자의 선전포고 직권(2440 나 — D-217 독재 = 지배 가문장이 정함).
// - 바뀜(governance-5 — 질문 2451~2460 답·사용자 결정 D-584·D-585): 강화·화폐 단계·가문 독립 선언·지도자 나라 거래세·신임도(leaderAgendas.ts). 빈자리는 도시 독립 투표로
//   이어지지 않는다(D-584 — D-583 3 대신): 빈자리가 되면 누구나 나설 수 있는 선출을 바로 연다(기간 gov_vacancy_election_ms). 열려 있던 도시 독립 투표는 취소한다.
//   후임자(국가 지도자 가문에서 대행·계승)를 고르는 규칙은 정해지지 않아 만들지 않았다(질문 2491).
// 쓰기는 DB 바로(서버 하나라 이 서비스가 순서대로 쓴다). 한 번에 하나만 돈다(명령·틱이 같은 사슬).
import {
  type AgendaKind,
  type GovernanceRegime,
  type GovernanceTaxes,
  type HouseKey,
  type MonetaryMode,
  isHouseKey,
  tallyElection,
  tallyMotion,
} from "@terra/shared/governance";
import type { GovernanceAction, GovernanceResultCode } from "@terra/protocol";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { type CoupCredit, createCoupService } from "./coup.ts";
import type { CoupSide, CoupStore } from "./coupStore.ts";
import { type TreatyHooks, createLeaderAgendas } from "./leaderAgendas.ts";
import type { LeaderStore } from "./leaderStore.ts";
import { electionDecided, motionDecided } from "./early.ts";
import { type Electorate, type Ruling, createElectorate } from "./electorate.ts";
import { npcChallengers, npcVoteChoice } from "./npcVote.ts";
import { applyRulings, dictatorshipShares, runShareFixups } from "./shareFixups.ts";
import type { GovernanceNation, GovernancePort } from "./port.ts";
import type { GovernanceRules } from "./rules.ts";
import { type AgendaPayload, type AgendaRow, type GovernanceStore, type StateRow } from "./store.ts";

export type GovernanceResult =
  | { readonly ok: true; readonly agendaId: number; readonly action: GovernanceAction }
  | { readonly ok: false; readonly code: GovernanceResultCode };

export interface ProposeInput {
  readonly kind: AgendaKind;
  readonly regime?: GovernanceRegime | undefined;
  readonly targetNationId?: number | undefined;
  /** 세율 안건 값(질문 2407 가) */
  readonly taxes?: GovernanceTaxes | undefined;
  /** 국고 지분 팔기(질문 2438 답 D-583): 도시·주 수·한 주 가장 낮은 값 */
  readonly cityId?: number | undefined;
  readonly shares?: string | undefined;
  readonly minPrice?: string | undefined;
  /** 화폐 단계 전환(질문 2453 — 줄기 governance-5): 목표 단계·하루 조절 만분율 */
  readonly monetaryMode?: MonetaryMode | undefined;
  readonly monetaryRateBp?: number | undefined;
}

/** 승인된 국고 지분 팔기(정부 지분 시장 cityShares/service.ts approvedSale이 받는다 — D-583) */
export interface ApprovedShareSale {
  readonly nationRowId: number;
  readonly agendaId: number;
  readonly cityId: number;
  readonly shares: bigint;
  readonly minPrice: bigint;
}

const fail = (code: GovernanceResultCode): GovernanceResult => ({ ok: false, code });

const blankState = (nation: GovernanceNation): StateRow => ({
  nationId: nation.rowId,
  rulingHouseKey: null,
  electedAtMs: null,
  termEndsAtMs: null,
  shareVotesSuspended: false,
  vacantSinceMs: null,
});

/** 보는 사람이 나라 안에서 가진 자격 */
export interface Standing {
  readonly nation: GovernanceNation;
  readonly state: StateRow | undefined;
  readonly ruling: Ruling;
  readonly electorate: Electorate;
  readonly leader: boolean;
  /** 이끄는 가문(그 나라 소속 플레이어 가문의 장이면) */
  readonly ownHouse: HouseKey | null;
  /** 내 표 무게(내가 던지는 투표자 열쇠 합) */
  readonly power: bigint;
}

/** 그 사람이 올린 안건으로 적을 열쇠 */
const proposerKeyOf = (s: Standing, userId: string): string | null =>
  s.leader
    ? s.ruling.key
    : (s.ownHouse ?? s.electorate.voters.find((voter) => voter.userId === userId)?.key ?? null);

export function createGovernanceService(o: {
  readonly port: GovernancePort;
  readonly store: GovernanceStore;
  readonly rules: () => GovernanceRules;
  readonly now: () => number;
  readonly db?: Database | undefined;
  readonly log?: { error(obj: object, message: string): void } | undefined;
  /** 가결된 세율 안건을 나라 세금에 쓴다(government/nationTaxPolicy.ts applyNationTaxes). 없으면 세율 안건을 집행하지 못한다(취소) */
  readonly applyTaxes?:
    | ((nationRowId: number, taxes: GovernanceTaxes, nowMs: number) => Promise<boolean>)
    | undefined;
  /** 쿠데타·지배 쪽 지분 가문 표(coupStore.ts) */
  readonly coups: CoupStore;
  /** 승인된 국고 지분 팔기를 정부 지분 시장에 넘긴다(질문 2438 답 D-583 — 시장 줄기가 붙인다). 없으면 승인 기록만 남긴다 */
  readonly approvedShareSale?: ((sale: ApprovedShareSale, nowMs: number) => Promise<void>) | undefined;
  /** 화폐 단계·신임도·가문 집 표(leaderStore.ts — 줄기 governance-5) */
  readonly leader: LeaderStore;
  /** 쿠데타 신용(D-584 — attach.ts가 credit/로 잇는다) */
  readonly credit?: CoupCredit | undefined;
  /** 가결된 조약 비준 안건 집행(diplomacy/ — D-588, 의결 사슬 안에서 불린다 — 그 안에서 run을 부르지 않는다). 없으면 취소 */
  readonly treaties?: () => TreatyHooks | undefined;
}) {
  const tools = createElectorate(o);
  let chain: Promise<unknown> = Promise.resolve();
  /** 명령·틱을 한 줄로 세운다(같은 안건에 두 처리가 겹치지 않게) */
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = chain.then(work, work);
    chain = next.catch(() => undefined);
    return next;
  };
  const audit = async (
    userId: string | null,
    action: string,
    after: Record<string, unknown>,
  ): Promise<void> => {
    if (!o.db) return;
    await writeAudit(o.db, {
      actor: { kind: userId ? "user" : "system", id: userId, ip: null },
      action,
      targetId: userId,
      after,
    });
  };

  const shareDeps = {
    port: o.port,
    store: o.store,
    coups: o.coups,
    tools,
    audit: (action: string, after: Record<string, unknown>) => audit(null, action, after),
  };

  const coup = createCoupService({
    port: o.port,
    store: o.store,
    leader: o.leader,
    coups: o.coups,
    tools,
    rules: o.rules,
    now: o.now,
    standing: (userId) => standing(userId),
    audit,
    credit: o.credit,
  });
  // 강화·화폐 단계·가문 독립·거래세·신임도(leaderAgendas.ts — 줄기 governance-5)
  const leader = createLeaderAgendas({
    port: o.port,
    store: o.store,
    leader: o.leader,
    tools,
    rules: o.rules,
    audit,
    treaties: o.treaties,
  });

  const standing = async (userId: string): Promise<Standing | undefined> => {
    const nationId = o.port.viewerNation(userId);
    const nation = nationId === undefined ? undefined : o.port.nation(nationId);
    if (!nation) return undefined;
    const state = (await o.store.states()).get(nation.rowId);
    const ruling = await tools.ruling(nation, state);
    const electorate = await tools.electorate(nation);
    const houses = await o.store.playerHousesOf(nation.rowId);
    const own = houses.find((house) => house.head === userId);
    const power = electorate.voters
      .filter((voter) => voter.userId === userId)
      .reduce((sum, voter) => sum + voter.weight, 0n);
    return {
      nation,
      state,
      ruling,
      electorate,
      leader: ruling.leaderUser === userId,
      ownHouse: own ? `p:${own.id}` : null,
      power,
    };
  };

  /** 안건의 투표권(나라 전체 — 빈자리 도시 독립 투표는 D-584로 없어졌다) */
  const electorateOf = (_agenda: AgendaRow, nation: GovernanceNation): Promise<Electorate> =>
    tools.electorate(nation);
  /** 안건의 가결 문턱(종류마다, 해임은 지도자 신임도 고리 — D-585, 칸 출발값 0 = 그대로) */
  const thresholdFor = (agenda: AgendaRow): number =>
    agenda.kind === "leader_removal"
      ? leader.removalThreshold(agenda.nationId, o.rules().thresholdOf(agenda.kind))
      : o.rules().thresholdOf(agenda.kind);

  /** 발의권(2351 가): 지도자는 늘, 민주주의 = 소속 가문장, 자본주의 = 의결권 몫 하한 이상 */
  const mayPropose = (s: Standing): boolean => {
    if (s.leader) return true;
    if (s.nation.regime === "democracy") return s.ownHouse !== null;
    if (s.nation.regime === "capitalism")
      return (
        s.electorate.total > 0n && s.power * 1000n >= BigInt(o.rules().proposeSharePm) * s.electorate.total
      );
    return false;
  };

  /** 열린 선출 안건 하나 열기(시스템·해임 뒤·사람) */
  const openElection = async (
    nation: GovernanceNation,
    proposer: { key: string | null; user: string | null },
    nowMs: number,
    payload: AgendaPayload,
    incumbent: HouseKey | null,
    periodMs?: number,
  ): Promise<AgendaRow> => {
    const rules = o.rules();
    const closesAtMs = nowMs + (periodMs ?? rules.periodOf("leader_election"));
    const agenda = await o.store.insertAgenda({
      nationId: nation.rowId,
      kind: "leader_election",
      regime: nation.regime,
      proposerKey: proposer.key,
      proposerUser: proposer.user,
      payload,
      openedAtMs: nowMs,
      registerUntilMs: Math.min(closesAtMs, nowMs + rules.registerMs),
      closesAtMs,
    });
    // NPC 지배 가문은 스스로 후보로 나선다(NPC 행동 — 해임된 가문은 빼고)
    if (incumbent?.startsWith("n:") && incumbent !== payload.barred)
      await o.store.register(agenda.id, incumbent, null, nowMs);
    // 다른 NPC 가문도 출마 점수가 문턱 이상이면 나선다(질문 2404 나 — 점수 높은 차례로 등록, 먼저 등록 = 동점 셋째 규칙)
    const electorate = await tools.electorate(nation);
    const satisfaction = new Map(electorate.voters.map((voter) => [voter.key, voter]));
    const floor = BigInt(rules.proposeSharePm) * electorate.total;
    const houses = o.port.npcHousesOf(nation).flatMap((house) => {
      const key: HouseKey = `n:${house.id}`;
      if (key === incumbent || key === payload.barred) return [];
      // 자본주의는 플레이어 후보와 같은 하한(내 표 무게 ≥ 투표권 × gov_propose_share_pm)
      const weight = satisfaction.get(key)?.weight ?? 0n;
      if (nation.regime === "capitalism" && !(electorate.total > 0n && weight * 1000n >= floor)) return [];
      return [
        { key, id: house.id, satisfaction: o.port.citySatisfaction(house.cityId), traits: nation.traits },
      ];
    });
    let order = 1;
    for (const key of npcChallengers(houses, rules)) {
      await o.store.register(agenda.id, key, null, nowMs + order);
      order += 1;
    }
    return agenda;
  };

  const decideByAuthority = async (
    s: Standing,
    userId: string,
    target: GovernanceRegime,
    nowMs: number,
  ): Promise<GovernanceResult> => {
    const agenda = await o.store.insertAgenda({
      nationId: s.nation.rowId,
      kind: "regime_change",
      regime: s.nation.regime,
      proposerKey: s.ruling.key,
      proposerUser: userId,
      payload: { regime: target, byAuthority: true },
      openedAtMs: nowMs,
      registerUntilMs: null,
      closesAtMs: nowMs,
      status: "passed",
      decidedAtMs: nowMs,
      effectAtMs: nowMs + o.rules().graceRegimeMs,
    });
    await audit(userId, "governance.regime_decree", {
      nationId: s.nation.rowId,
      agendaId: agenda.id,
      target,
    });
    return { ok: true, agendaId: agenda.id, action: "decided" };
  };

  /** 독재 지도자의 직권(선전포고·국고 지분 팔기 — 유예 없이 바로 집행, D-217) */
  const decreeNow = async (
    s: Standing,
    userId: string,
    kind: AgendaKind,
    payload: AgendaPayload,
    nowMs: number,
  ): Promise<GovernanceResult> => {
    const agenda = await o.store.insertAgenda({
      nationId: s.nation.rowId,
      kind,
      regime: s.nation.regime,
      proposerKey: s.ruling.key,
      proposerUser: userId,
      payload: { ...payload, byAuthority: true },
      openedAtMs: nowMs,
      registerUntilMs: null,
      closesAtMs: nowMs,
      status: "passed",
      decidedAtMs: nowMs,
      effectAtMs: nowMs,
    });
    await audit(userId, "governance.decree", {
      nationId: s.nation.rowId,
      agendaId: agenda.id,
      kind,
      payload,
    });
    await enact({ ...agenda, payload: { ...payload, byAuthority: true } }, s.nation, nowMs);
    return { ok: true, agendaId: agenda.id, action: "decided" };
  };

  /** 국고 지분 팔기 안건 칸 검사(질문 2438 답 D-583) — 틀리면 실패 코드 */
  const shareSalePayload = (
    s: Standing,
    input: ProposeInput,
  ): AgendaPayload | Extract<GovernanceResult, { ok: false }> => {
    const { cityId, shares, minPrice } = input;
    if (
      cityId === undefined ||
      shares === undefined ||
      minPrice === undefined ||
      !s.nation.cities.includes(cityId)
    )
      return { ok: false, code: "invalid_choice" };
    if (BigInt(shares) <= 0n) return { ok: false, code: "invalid_choice" };
    if (o.port.treasuryShares(s.nation, cityId) < BigInt(shares))
      return { ok: false, code: "not_enough_shares" };
    return { cityId, shares, minPrice };
  };

  const propose = async (userId: string, input: ProposeInput): Promise<GovernanceResult> => {
    if (!o.port.ready()) return fail("busy");
    const s = await standing(userId);
    if (!s) return fail("no_nation");
    const rules = o.rules();
    const nowMs = o.now();
    const { nation } = s;
    if (input.kind === "war_declaration" && !rules.warAgenda) return fail("kind_disabled");
    // 도시 독립 투표는 서버가 연다(질문 2434 (가) 답 D-583)
    if (input.kind === "city_independence" || input.kind === "treaty") return fail("kind_disabled");
    // 가문 독립 선언(질문 2454 — D-300, 투표 없이 바로. agendaId = 새 나라 행)
    if (input.kind === "house_independence") {
      const done = await leader.declareByPlayer(
        nation,
        s.ownHouse,
        s.ruling.key,
        input.cityId,
        userId,
        nowMs,
      );
      return typeof done === "number" ? { ok: true, agendaId: done, action: "decided" } : fail(done);
    }
    // 독재: 투표가 없다 — 지도자의 직권만(D-217·D-5057): 체제 전환(유예), 선전포고(질문 2440 나 — 바로), 국고 지분 팔기(질문 2438 답 D-583 — 바로)
    if (nation.regime === "dictatorship") {
      if (!s.leader) return fail("dictatorship");
      if (input.kind === "war_declaration") {
        const target = input.targetNationId === undefined ? undefined : o.port.nation(input.targetNationId);
        if (!target || target.rowId === nation.rowId) return fail("unknown_target");
        if (o.port.atWar(nation, target)) return fail("already_at_war");
        return decreeNow(s, userId, "war_declaration", { targetNationId: target.rowId }, nowMs);
      }
      if (input.kind === "treasury_share_sale") {
        const payload = shareSalePayload(s, input);
        return "ok" in payload ? payload : decreeNow(s, userId, "treasury_share_sale", payload, nowMs);
      }
      // 강화·화폐 단계도 직권(줄기 governance-5 — D-217)
      if (input.kind === "peace") {
        const payload = leader.peacePayload(nation, input.targetNationId);
        return typeof payload === "string" ? fail(payload) : decreeNow(s, userId, "peace", payload, nowMs);
      }
      if (input.kind === "currency_stage") {
        const checked = await leader.currencyPayload(nation, input.monetaryMode, input.monetaryRateBp);
        return typeof checked === "string"
          ? fail(checked)
          : decreeNow(s, userId, "currency_stage", checked.payload, nowMs);
      }
      if (input.kind !== "regime_change") return fail("dictatorship");
      if (!input.regime) return fail("invalid_choice");
      if (input.regime === nation.regime) return fail("same_regime");
      return decideByAuthority(s, userId, input.regime, nowMs);
    }
    if (!mayPropose(s)) return fail("not_eligible");
    const active = (await o.store.activeAgendas()).filter((agenda) => agenda.nationId === nation.rowId);
    const open = active.filter((agenda) => agenda.status === "open");
    const proposerKey = proposerKeyOf(s, userId);
    if (open.filter((agenda) => agenda.proposerKey === proposerKey).length >= rules.openPerProposer)
      return fail("limit");
    const payload: { -readonly [K in keyof AgendaPayload]: AgendaPayload[K] } = {};
    // 세율 크게 바꾸기(질문 2407 가): 나라 세금 명령(nation_tax)이 폭이 문턱 이상일 때 이 길로 연다(rules.ts taxChangeNeedsAgenda)
    switch (input.kind) {
      case "leader_election":
        if (open.some((agenda) => agenda.kind === "leader_election")) return fail("already_open");
        break;
      case "leader_removal":
        if (s.ruling.key === null) return fail("not_eligible");
        if (open.some((agenda) => agenda.kind === "leader_removal" || agenda.kind === "leader_election"))
          return fail("already_open");
        payload.barred = s.ruling.key;
        break;
      case "regime_change": {
        if (!input.regime) return fail("invalid_choice");
        if (input.regime === nation.regime) return fail("same_regime");
        if (active.some((agenda) => agenda.kind === "regime_change")) return fail("already_open");
        if (input.regime === "dictatorship") {
          // D-344: 독재는 지배 가문이 지분 과반 — 과반이면 지도자 직권(2363 가)
          if (tools.rulingSharePm(nation, s.ruling.key) <= 500) return fail("no_majority");
          if (s.leader) return decideByAuthority(s, userId, "dictatorship", nowMs);
        }
        payload.regime = input.regime;
        break;
      }
      case "treasury_share_sale": {
        const checked = shareSalePayload(s, input);
        if ("ok" in checked) return checked;
        if (
          open.some(
            (agenda) => agenda.kind === "treasury_share_sale" && agenda.payload.cityId === checked.cityId,
          )
        )
          return fail("already_open");
        Object.assign(payload, checked);
        break;
      }
      case "tax_change":
        if (!input.taxes) return fail("invalid_choice");
        if (open.some((agenda) => agenda.kind === "tax_change")) return fail("already_open");
        payload.taxes = input.taxes;
        break;
      case "war_declaration": {
        const target = input.targetNationId === undefined ? undefined : o.port.nation(input.targetNationId);
        if (!target || target.rowId === nation.rowId) return fail("unknown_target");
        if (o.port.atWar(nation, target)) return fail("already_at_war");
        if (
          open.some(
            (agenda) => agenda.kind === "war_declaration" && agenda.payload.targetNationId === target.rowId,
          )
        )
          return fail("already_open");
        payload.targetNationId = target.rowId;
        break;
      }
      case "peace": {
        const checked = leader.peacePayload(nation, input.targetNationId);
        if (typeof checked === "string") return fail(checked);
        if (
          open.some(
            (agenda) => agenda.kind === "peace" && agenda.payload.targetNationId === checked.targetNationId,
          )
        )
          return fail("already_open");
        Object.assign(payload, checked);
        break;
      }
      case "currency_stage": {
        const checked = await leader.currencyPayload(nation, input.monetaryMode, input.monetaryRateBp);
        if (typeof checked === "string") return fail(checked);
        // 손 조절 단계 안의 조절량은 지도자가 바로(D-252)
        if (checked.direct)
          return s.leader
            ? decreeNow(s, userId, "currency_stage", checked.payload, nowMs)
            : fail("not_eligible");
        if (open.some((agenda) => agenda.kind === "currency_stage")) return fail("already_open");
        Object.assign(payload, checked.payload);
        break;
      }
    }
    const agenda =
      input.kind === "leader_election"
        ? await openElection(nation, { key: proposerKey, user: userId }, nowMs, payload, s.ruling.key)
        : await o.store.insertAgenda({
            nationId: nation.rowId,
            kind: input.kind,
            regime: nation.regime,
            proposerKey,
            proposerUser: userId,
            payload,
            openedAtMs: nowMs,
            registerUntilMs: null,
            closesAtMs: nowMs + rules.periodOf(input.kind),
          });
    await audit(userId, "governance.propose", {
      nationId: nation.rowId,
      agendaId: agenda.id,
      kind: input.kind,
      payload,
    });
    return { ok: true, agendaId: agenda.id, action: "proposed" };
  };

  /** 안건과 보는 사람의 자격(내 나라의 열린 안건만) */
  const openAgendaFor = async (
    userId: string,
    agendaId: number,
  ): Promise<{ s: Standing; agenda: AgendaRow } | GovernanceResult> => {
    if (!o.port.ready()) return fail("busy");
    const s = await standing(userId);
    if (!s) return fail("no_nation");
    const agenda = await o.store.agenda(agendaId);
    if (!agenda || agenda.nationId !== s.nation.rowId) return fail("unknown_agenda");
    if (agenda.status !== "open" || agenda.closesAtMs <= o.now()) return fail("not_open");
    return { s, agenda };
  };

  const vote = async (userId: string, agendaId: number, choice: string): Promise<GovernanceResult> => {
    const found = await openAgendaFor(userId, agendaId);
    if ("ok" in found) return found;
    const { s, agenda } = found;
    const voters =
      agenda.kind === "city_independence"
        ? (await electorateOf(agenda, s.nation)).voters
        : s.electorate.voters;
    const mine = voters.filter((voter) => voter.userId === userId);
    if (mine.length === 0) return fail(s.nation.regime === "dictatorship" ? "dictatorship" : "not_eligible");
    if (agenda.kind === "leader_election") {
      if (choice !== "abstain") {
        if (!isHouseKey(choice)) return fail("invalid_choice");
        const candidates = await o.store.candidates([agenda.id]);
        if (!candidates.some((row) => row.houseKey === choice) || choice === agenda.payload.barred)
          return fail("invalid_choice");
      }
    } else if (choice !== "yes" && choice !== "no" && choice !== "abstain") return fail("invalid_choice");
    const nowMs = o.now();
    for (const voter of mine)
      await o.store.castVote({
        agendaId,
        voterKey: voter.key,
        userId,
        npc: false,
        choice,
        weight: voter.weight,
        castAtMs: nowMs,
      });
    return { ok: true, agendaId, action: "voted" };
  };

  const register = async (userId: string, agendaId: number): Promise<GovernanceResult> => {
    const found = await openAgendaFor(userId, agendaId);
    if ("ok" in found) return found;
    const { s, agenda } = found;
    if (agenda.kind !== "leader_election") return fail("invalid_choice");
    const nowMs = o.now();
    if (agenda.registerUntilMs !== null && nowMs >= agenda.registerUntilMs)
      return fail("registration_closed");
    if (s.ownHouse === null) return fail("not_eligible");
    if (s.ownHouse === agenda.payload.barred) return fail("barred");
    if (
      s.nation.regime === "capitalism" &&
      !(s.electorate.total > 0n && s.power * 1000n >= BigInt(o.rules().proposeSharePm) * s.electorate.total)
    )
      return fail("not_eligible");
    await o.store.register(agenda.id, s.ownHouse, userId, nowMs);
    return { ok: true, agendaId, action: "registered" };
  };

  // ---------- 틱 ----------

  const saveState = async (state: StateRow, nowMs: number): Promise<void> => o.store.saveState(state, nowMs);

  const castNpcVotes = async (agenda: AgendaRow, nation: GovernanceNation, state: StateRow | undefined) => {
    const nowMs = o.now();
    if (
      agenda.kind === "leader_election" &&
      agenda.registerUntilMs !== null &&
      nowMs < agenda.registerUntilMs
    )
      return;
    const ruling = await tools.ruling(nation, state);
    const electorate = await electorateOf(agenda, nation);
    const npcVoters = electorate.voters.filter((voter) => voter.npc);
    if (npcVoters.length === 0) return;
    const cast = new Set((await o.store.votes([agenda.id])).map((row) => row.voterKey));
    const candidates =
      agenda.kind === "leader_election"
        ? (await o.store.candidates([agenda.id])).map((row) => row.houseKey)
        : [];
    const rules = o.rules();
    for (const voter of npcVoters) {
      if (cast.has(voter.key)) continue;
      const choice = npcVoteChoice(
        {
          kind: agenda.kind,
          incumbent: ruling.key,
          self: voter.self,
          candidates,
          barred: agenda.payload.barred ?? null,
          satisfaction: voter.satisfaction,
          traits: voter.traits,
          targetRegime: agenda.payload.regime,
          loyal: voter.loyal,
        },
        rules,
      );
      await o.store.castVote({
        agendaId: agenda.id,
        voterKey: voter.key,
        userId: null,
        npc: true,
        choice,
        weight: voter.weight,
        castAtMs: nowMs,
      });
    }
  };

  const enact = async (
    agenda: AgendaRow,
    nation: GovernanceNation | undefined,
    nowMs: number,
  ): Promise<void> => {
    if (!nation) return o.store.finish(agenda.id, { status: "cancelled", enactedAtMs: nowMs });
    const states = await o.store.states();
    const state = states.get(nation.rowId) ?? blankState(nation);
    switch (agenda.kind) {
      case "leader_removal": {
        await o.store.finish(agenda.id, { status: "enacted", enactedAtMs: nowMs });
        const ruling = await tools.ruling(nation, state);
        const barred = agenda.payload.barred ?? ruling.key;
        await openElection(nation, { key: null, user: null }, nowMs, barred ? { barred } : {}, ruling.key);
        return;
      }
      case "regime_change": {
        const target = agenda.payload.regime;
        const ruling = await tools.ruling(nation, state);
        const valid =
          target !== undefined &&
          target !== nation.regime &&
          (target !== "dictatorship" || tools.rulingSharePm(nation, ruling.key) > 500);
        if (!valid) return o.store.finish(agenda.id, { status: "cancelled", enactedAtMs: nowMs });
        const dictatorship = target === "dictatorship";
        const suspended = dictatorship && tools.rulingSharePm(nation, ruling.key) < 1000;
        o.port.setRegime(nation, target);
        await saveState(
          {
            ...state,
            termEndsAtMs: dictatorship ? null : nowMs + o.rules().termMs,
            // D-349: 독재가 되면 지배 쪽이 아닌 지분은 의결권을 잃는다(몰수 아님). 독재가 끝나면 되찾는다(질문 2405 가 — D-344·D-217)
            shareVotesSuspended: suspended,
          },
          nowMs,
        );
        // 지분 과반을 사서 독재가 됐다(D-344 — 이 길뿐): 국고 지분은 국고에 남긴다(질문 2432 (다) 답 D-583 — 배당은 받고 의결권은 없다). 지배 쪽 지분 가문 기록
        if (dictatorship && ruling.key) {
          const record = { nationId: nation.rowId, houseKey: ruling.key, treasuryKept: true };
          await o.coups.saveShareHouse(record, nowMs);
          await dictatorshipShares(shareDeps, { ...nation, regime: target }, ruling.key, nowMs, record);
        }
        await o.store.finish(agenda.id, { status: "enacted", enactedAtMs: nowMs });
        await audit(null, "governance.regime_enacted", {
          nationId: nation.rowId,
          agendaId: agenda.id,
          from: nation.regime,
          to: target,
        });
        return;
      }
      case "war_declaration": {
        const target =
          agenda.payload.targetNationId === undefined
            ? undefined
            : o.port.nation(agenda.payload.targetNationId);
        const declared = target ? await o.port.declareWar(nation, target, nowMs) : false;
        await o.store.finish(agenda.id, { status: declared ? "enacted" : "cancelled", enactedAtMs: nowMs });
        if (declared)
          await audit(null, "governance.war_declared", {
            nationId: nation.rowId,
            targetNationId: target?.rowId,
          });
        return;
      }
      case "city_independence":
        // 빈자리 도시 독립은 없어졌다(D-584 — D-583 3 대신): 남은 안건은 취소
        return o.store.finish(agenda.id, { status: "cancelled", enactedAtMs: nowMs });
      case "peace":
        return leader.enactPeace(agenda, nation, nowMs);
      case "treaty":
        return leader.enactTreaty(agenda, nation, nowMs);
      case "currency_stage":
        return leader.enactCurrency(agenda, nation, nowMs);
      case "treasury_share_sale": {
        // 승인된 국고 지분 팔기(질문 2438 답 D-583): 정부 지분 시장에 넘긴다(cityShares — 국고 팔 주문, 고리가 없으면 승인 기록만)
        const { cityId, shares, minPrice } = agenda.payload;
        const valid =
          cityId !== undefined &&
          shares !== undefined &&
          minPrice !== undefined &&
          o.port.treasuryShares(nation, cityId) >= BigInt(shares);
        if (valid && o.approvedShareSale)
          await o.approvedShareSale(
            {
              nationRowId: nation.rowId,
              agendaId: agenda.id,
              cityId,
              shares: BigInt(shares),
              minPrice: BigInt(minPrice),
            },
            nowMs,
          );
        await o.store.finish(agenda.id, { status: valid ? "enacted" : "cancelled", enactedAtMs: nowMs });
        if (valid)
          await audit(null, "governance.share_sale_approved", {
            nationId: nation.rowId,
            agendaId: agenda.id,
            cityId,
            shares,
            minPrice,
          });
        return;
      }
      case "tax_change": {
        // 가결된 세율을 나라 세금에(질문 2407 가) — 쓰지 못하면 취소
        const taxes = agenda.payload.taxes;
        const applied = taxes && o.applyTaxes ? await o.applyTaxes(nation.rowId, taxes, nowMs) : false;
        await o.store.finish(agenda.id, { status: applied ? "enacted" : "cancelled", enactedAtMs: nowMs });
        if (applied)
          await audit(null, "governance.tax_enacted", { nationId: nation.rowId, agendaId: agenda.id, taxes });
        return;
      }
      default:
        return o.store.finish(agenda.id, { status: "enacted", enactedAtMs: nowMs });
    }
  };

  const close = async (
    agenda: AgendaRow,
    nation: GovernanceNation | undefined,
    nowMs: number,
  ): Promise<void> => {
    // 나라가 사라졌거나 투표 중에 체제가 바뀌었으면 취소(투표권의 뜻이 바뀐다)
    if (!nation || nation.regime !== agenda.regime)
      return o.store.finish(agenda.id, {
        status: "cancelled",
        decidedAtMs: nowMs,
        result: { reason: "regime", abstain: "0", cast: "0", electorate: "0", quorumPm: 0, thresholdPm: 0 },
      });
    const rules = o.rules();
    const states = await o.store.states();
    const state = states.get(nation.rowId);
    const ruling = await tools.ruling(nation, state);
    const electorate = await electorateOf(agenda, nation);
    const weights = new Map(electorate.voters.map((voter) => [voter.key, voter.weight]));
    // 셈은 닫는 때의 투표권으로(그 사이 떠난 가문·판 지분은 빠진다)
    const votes = (await o.store.votes([agenda.id])).flatMap((row) => {
      const weight = weights.get(row.voterKey);
      return weight === undefined ? [] : [{ choice: row.choice, weight }];
    });
    const quorumPm = rules.quorumOf(agenda.kind);
    if (agenda.kind === "leader_election") {
      const candidateRows = (await o.store.candidates([agenda.id])).filter(
        (row) => row.houseKey !== agenda.payload.barred,
      );
      const scores = await o.store.boardScores(candidateRows.map((row) => row.houseKey));
      const result = tallyElection(
        votes,
        candidateRows.map((row) => ({
          key: row.houseKey,
          registeredAtMs: row.registeredAtMs,
          boardScore: scores.get(row.houseKey) ?? 0,
        })),
        electorate.total,
        quorumPm,
        ruling.key,
      );
      const current = state ?? blankState(nation);
      // 해임 뒤 다시 뽑기가 실패하면 지도자 자리가 빈다(질문 2403 답 D-582). 선출로 채우면 빈자리가 끝난다
      const vacantSinceMs = result.winner
        ? null
        : agenda.payload.barred
          ? (current.vacantSinceMs ?? nowMs)
          : current.vacantSinceMs;
      await saveState(
        {
          ...current,
          rulingHouseKey: result.winner ?? current.rulingHouseKey,
          electedAtMs: result.winner ? nowMs : current.electedAtMs,
          termEndsAtMs: nowMs + rules.termMs,
          vacantSinceMs,
        },
        nowMs,
      );
      if (vacantSinceMs !== null && current.vacantSinceMs === null)
        await audit(null, "governance.vacant", { nationId: nation.rowId, agendaId: agenda.id });
      await o.store.finish(agenda.id, {
        status: result.winner ? "enacted" : "failed",
        decidedAtMs: nowMs,
        enactedAtMs: result.winner ? nowMs : null,
        result: {
          reason: result.reason,
          abstain: result.abstain.toString(),
          cast: result.cast.toString(),
          electorate: result.electorate.toString(),
          quorumPm,
          thresholdPm: 0,
          winner: result.winner,
          counts: result.counts.map((row) => ({ key: row.key, votes: row.votes.toString() })),
        },
      });
      if (result.winner && result.winner !== ruling.key)
        await audit(null, "governance.ruling_house", {
          nationId: nation.rowId,
          from: ruling.key,
          to: result.winner,
        });
      return;
    }
    const thresholdPm = thresholdFor(agenda);
    const result = tallyMotion(votes, electorate.total, { quorumPm, thresholdPm });
    const row = {
      reason: result.reason,
      yes: result.yes.toString(),
      no: result.no.toString(),
      abstain: result.abstain.toString(),
      cast: result.cast.toString(),
      electorate: result.electorate.toString(),
      quorumPm,
      thresholdPm,
    };
    if (!result.passed)
      return o.store.finish(agenda.id, { status: "failed", decidedAtMs: nowMs, result: row });
    // 체제 전환만 유예(D-131), 해임·선전포고는 바로(2364)
    const effectAtMs = nowMs + (agenda.kind === "regime_change" ? rules.graceRegimeMs : 0);
    await o.store.finish(agenda.id, { status: "passed", decidedAtMs: nowMs, effectAtMs, result: row });
    if (effectAtMs <= nowMs) await enact({ ...agenda, status: "passed", effectAtMs }, nation, nowMs);
  };

  /** 결과가 정해졌나(early.ts — 확정 표 = NPC 표, 선출은 등록 기간 뒤) */
  const decidedEarly = async (
    agenda: AgendaRow,
    nation: GovernanceNation,
    nowMs: number,
  ): Promise<boolean> => {
    if (
      agenda.kind === "leader_election" &&
      agenda.registerUntilMs !== null &&
      nowMs < agenda.registerUntilMs
    )
      return false;
    const rules = o.rules();
    const electorate = await electorateOf(agenda, nation);
    const weights = new Map(electorate.voters.map((voter) => [voter.key, voter.weight]));
    const votes = (await o.store.votes([agenda.id])).flatMap((row) => {
      const weight = weights.get(row.voterKey);
      return weight === undefined ? [] : [{ choice: row.choice, weight, fixed: row.npc }];
    });
    const quorumPm = rules.quorumOf(agenda.kind);
    if (agenda.kind !== "leader_election")
      return motionDecided(votes, electorate.total, { quorumPm, thresholdPm: thresholdFor(agenda) });
    const state = (await o.store.states()).get(nation.rowId);
    const ruling = await tools.ruling(nation, state);
    const rows = (await o.store.candidates([agenda.id])).filter(
      (row) => row.houseKey !== agenda.payload.barred,
    );
    const scores = await o.store.boardScores(rows.map((row) => row.houseKey));
    const candidates = rows.map((row) => ({
      key: row.houseKey,
      registeredAtMs: row.registeredAtMs,
      boardScore: scores.get(row.houseKey) ?? 0,
    }));
    return electionDecided(votes, candidates, electorate.total, quorumPm, ruling.key) !== null;
  };

  const tick = async (): Promise<void> => {
    if (!o.port.ready()) return;
    const nowMs = o.now();
    const rules = o.rules();
    const nations = new Map(o.port.nations().map((nation) => [nation.rowId, nation]));
    const states = await o.store.states();
    // 지배 가문 반영(2406)·도시 지분 정리(D-338·D-582) — shareFixups.ts
    applyRulings(o.port, nations.values(), states);
    await runShareFixups(shareDeps, nations.values(), states, nowMs);
    // 군사 쿠데타(coup.ts): 끝난 참가 받기 → 전투, NPC 참가·일으키기
    await coup.tick(nations, states, nowMs);
    // 지도자 나라 거래세·화폐 단계·신임도·NPC 가문 독립(leaderAgendas.ts — 줄기 governance-5)
    await leader.tick(nations, await o.store.states(), nowMs);
    let active = await o.store.activeAgendas();
    // 임기·자동 선출·독재 정리
    for (const nation of nations.values()) {
      const state = states.get(nation.rowId);
      const mine = active.filter((agenda) => agenda.nationId === nation.rowId);
      if (nation.regime === "dictatorship") {
        if (state && state.termEndsAtMs !== null) await saveState({ ...state, termEndsAtMs: null }, nowMs);
        for (const agenda of mine.filter((row) => row.status === "open"))
          await o.store.finish(agenda.id, {
            status: "cancelled",
            decidedAtMs: nowMs,
            result: {
              reason: "regime",
              abstain: "0",
              cast: "0",
              electorate: "0",
              quorumPm: 0,
              thresholdPm: 0,
            },
          });
        continue;
      }
      if (!state || state.termEndsAtMs === null) {
        await saveState({ ...(state ?? blankState(nation)), termEndsAtMs: nowMs + rules.termMs }, nowMs);
        continue;
      }
      const electing = mine.some(
        (agenda) =>
          agenda.status === "open" && (agenda.kind === "leader_election" || agenda.kind === "leader_removal"),
      );
      // 빈자리(D-584): 누구나 나설 수 있는 선출을 바로 연다(기간 gov_vacancy_election_ms)
      if (state.vacantSinceMs !== null && !electing) {
        await openElection(nation, { key: null, user: null }, nowMs, {}, null, rules.vacancyElectionMs);
        continue;
      }
      if (
        rules.autoElections &&
        !electing &&
        nowMs >= state.termEndsAtMs - rules.periodOf("leader_election")
      ) {
        const ruling = await tools.ruling(nation, state);
        await openElection(nation, { key: null, user: null }, nowMs, {}, ruling.key);
      }
    }
    active = await o.store.activeAgendas();
    const freshStates = await o.store.states();
    for (const agenda of active) {
      const nation = nations.get(agenda.nationId);
      // 빈자리 도시 독립 투표는 없어졌다(D-584): 열려 있던 것은 취소
      if (agenda.kind === "city_independence") {
        await o.store.finish(agenda.id, { status: "cancelled", decidedAtMs: nowMs });
        continue;
      }
      if (agenda.status === "open") {
        if (agenda.closesAtMs <= nowMs) await close(agenda, nation, nowMs);
        else if (nation && nation.regime !== "dictatorship") {
          await castNpcVotes(agenda, nation, freshStates.get(nation.rowId));
          // 결과가 정해졌으면 일찍 닫는다(질문 2410 가)
          if (nation.regime === agenda.regime && (await decidedEarly(agenda, nation, nowMs)))
            await close(agenda, nation, nowMs);
        }
      } else if (agenda.status === "passed" && agenda.effectAtMs !== null && agenda.effectAtMs <= nowMs) {
        await enact(agenda, nation, nowMs);
      }
    }
  };

  const guarded =
    <A extends unknown[]>(work: (...args: A) => Promise<GovernanceResult>) =>
    (...args: A): Promise<GovernanceResult> =>
      serial(() => work(...args)).catch((error: unknown) => {
        o.log?.error({ err: error }, "governance command failed");
        return fail("internal_error");
      });

  return {
    propose: guarded(propose),
    vote: guarded(vote),
    register: guarded(register),
    coup: guarded((userId: string) => coup.launch(userId)),
    coupJoin: guarded((userId: string, coupId: number, side: CoupSide, unitIds?: readonly number[]) =>
      coup.join(userId, coupId, side, unitIds),
    ),
    tick: () =>
      serial(tick).catch((error: unknown) => {
        o.log?.error({ err: error }, "governance tick failed");
      }),
    /** 의결 사슬에서 일을 돌린다(외교 서비스 — 틱·명령과 겹치지 않게). 사슬 안에서 다시 부르지 않는다 */
    run: <T>(work: () => Promise<T>): Promise<T> => serial(work),
    /** 조회(view.ts)가 같은 자격 셈을 쓴다 */
    standing,
    mayPropose,
    tools,
    electorateOf,
    thresholdFor,
    coups: o.coups,
  };
}

export type GovernanceService = ReturnType<typeof createGovernanceService>;
