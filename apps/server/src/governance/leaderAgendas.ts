// 지도자 안건·나라 단위 결정(줄기 governance-5 — service.ts 줄 수 때문에 따로 둔다). 질문 2451~2460 답(코디네이터 전달)·사용자 결정 D-584·D-585.
// - 강화(2452, D-5057 "전쟁·외교: 강화 수락"): 전쟁 중인 상대와. 민주주의·자본주의 = 투표(전쟁 묶음 — 짧은 기간), 독재 = 직권(D-217). 집행: 상대가 NPC가 이끄는 나라면 NPC 강화
//   규칙식(npcRun proposePeace와 같은 셈)이 받으면 강화 조약, 아니면 거절(failed). 상대가 플레이어가 이끄는 나라(빈자리 포함)면 그쪽이 gov_peace_offer_ms 안에 우리에게 같은
//   강화를 집행했으면 맺고, 아니면 제안으로 남는다(enacted + 감사 기록 governance.peace_offered) [임시 — 질문 2497]. 동맹·보호 조약은 세계에 조약 체계가 없어 만들지 않았다(질문 2498).
// - 화폐 단계(2453, D-252·D-131): 공식(테일러 준칙 — 지금과 같다) ↔ 지도자 손 조절(하루 조절 만분율, 하루 상한 = 중앙은행 칸 E5) [임시]. 단계를 바꾸는 것은 안건(문턱
//   gov_threshold_currency_pm 2/3) 또는 독재 직권, 손 조절 단계 안에서 조절량만 바꾸는 것은 지도자가 바로(직권 줄). 손 조절은 플레이어가 이끄는 나라에서만 건다(NPC가 이끌게
//   되면 공식으로 돈다 [임시]).
// - 거래세(2460, D-128): 지도자가 정한 nation_taxes.trade_tax_bp를 플레이어가 이끄는 나라(플레이어 가문 나라·선출된 플레이어 지배 가문)의 거래소에 건다(틱마다 다르면).
//   NPC가 이끄는 나라는 거래세 규칙식 그대로.
// - 가문 독립 선언(2454, D-300 "한 가문이 그 도시 지분 50% 이상이면 투표 없이 독립 선언"): 자본주의 나라의 시작 도시가 아닌 도시(D-341). 그 도시가 새 도시국가가 되고 선언한
//   가문이 지배 가문(선출 기록 자리), 체제 = 옛 나라 체제 [임시 2459]. 플레이어 = gov_propose house_independence(그 가문의 장), NPC 가문 = 성향 규칙식(쿠데타 점수와 같은 식 ≥
//   gov_house_independence_npc_score — D-323) + 옛 나라와 힘 비(가문 힘 × 1000 ≥ 옛 나라 군대 힘 × gov_house_independence_power_pm — D-585) [임시 식].
// - 지도자 신임도(D-585 — approval.ts): 지배 가문이 바뀌면 시작값(플레이어 낮게·NPC), 해임 문턱·반란 문턱 고리. 오르내림 규칙은 질문 2493.
import type { HouseKey, MonetaryMode } from "@terra/shared/governance";
import { rebellionShiftOf, removalThresholdWithApproval } from "./approval.ts";
import type { ElectorateTools } from "./electorate.ts";
import type { LeaderStore } from "./leaderStore.ts";
import { npcRunScore } from "./npcVote.ts";
import type { GovernanceNation, GovernancePort } from "./port.ts";
import type { GovernanceRules } from "./rules.ts";
import type { AgendaPayload, AgendaRow, GovernanceStore, StateRow } from "./store.ts";

export type LeaderFail =
  | "unknown_target"
  | "not_at_war"
  | "invalid_choice"
  | "not_majority_holder"
  | "not_eligible";

export interface LeaderDeps {
  readonly port: GovernancePort;
  readonly store: Pick<GovernanceStore, "agendasOf" | "insertAgenda" | "saveState" | "states" | "finish">;
  readonly leader: LeaderStore;
  readonly tools: Pick<ElectorateTools, "ruling">;
  readonly rules: () => GovernanceRules;
  readonly audit: (userId: string | null, action: string, after: Record<string, unknown>) => Promise<void>;
}

/** 플레이어가 이끄는 나라인가(플레이어 가문 나라·선출된 플레이어 지배 가문) */
export const playerLed = (nation: GovernanceNation, ruling: HouseKey | null): boolean =>
  nation.playerHouse || ruling?.startsWith("p:") === true;

export function createLeaderAgendas(d: LeaderDeps) {
  /** 나라 → 지금 신임도(틱이 채운다 — 해임 문턱 고리가 읽는다) */
  let approvalCache = new Map<number, number>();

  /** 강화 안건 칸 검사 */
  const peacePayload = (
    nation: GovernanceNation,
    targetId: number | undefined,
  ): AgendaPayload | LeaderFail => {
    const target = targetId === undefined ? undefined : d.port.nation(targetId);
    if (!target || target.rowId === nation.rowId) return "unknown_target";
    if (!d.port.atWar(nation, target)) return "not_at_war";
    return { targetNationId: target.rowId };
  };

  /** 화폐 단계 칸 검사: 같은 단계의 조절량만 바꾸면 direct(지도자 바로) */
  const currencyPayload = async (
    nation: GovernanceNation,
    mode: MonetaryMode | undefined,
    rateBp: number | undefined,
  ): Promise<{ payload: AgendaPayload; direct: boolean } | LeaderFail> => {
    if (!mode) return "invalid_choice";
    const current = (await d.leader.monetary()).get(nation.rowId)?.mode ?? "formula";
    const rate = mode === "manual" ? Math.trunc(rateBp ?? 0) : 0;
    if (mode === current && mode === "formula") return "invalid_choice";
    return { payload: { monetaryMode: mode, monetaryRateBp: rate }, direct: mode === current };
  };

  /** 그 도시에서 그 가문이 지분 50% 이상인가(D-300) */
  const majorityHolder = (cityId: number, key: HouseKey): boolean => {
    const { houses, total } = d.port.cityShares(cityId);
    const own = houses.get(key) ?? 0n;
    return total > 0n && own * 1000n >= total * 500n;
  };

  /** 가문 독립 집행(플레이어·NPC 같은 길): 새 도시국가 + 지배 가문 기록. 새 나라 행(못 했으면 undefined) */
  const declare = async (
    nation: GovernanceNation,
    key: HouseKey,
    cityId: number,
    userId: string | null,
    nowMs: number,
  ): Promise<number | undefined> => {
    const child = await d.port.cityIndependence(nation, cityId, nowMs);
    if (child === undefined) return undefined;
    const regime = nation.regime;
    await d.store.saveState(
      {
        nationId: child,
        rulingHouseKey: key,
        electedAtMs: nowMs,
        termEndsAtMs: regime === "dictatorship" ? null : nowMs + d.rules().termMs,
        shareVotesSuspended: false,
        vacantSinceMs: null,
      },
      nowMs,
    );
    const childNation = d.port.nation(child);
    if (childNation && key.startsWith("n:")) d.port.applyRuling(childNation, key);
    await d.store.insertAgenda({
      nationId: nation.rowId,
      kind: "house_independence",
      regime,
      proposerKey: key,
      proposerUser: userId,
      payload: { cityId, byAuthority: true },
      openedAtMs: nowMs,
      registerUntilMs: null,
      closesAtMs: nowMs,
      status: "enacted",
      decidedAtMs: nowMs,
      effectAtMs: nowMs,
    });
    await d.audit(userId, "governance.house_independent", {
      nationId: nation.rowId,
      cityId,
      house: key,
      newNationId: child,
    });
    return child;
  };

  /** 플레이어 가문장의 독립 선언(gov_propose house_independence) — 안건 ID 대신 새 나라 행 */
  const declareByPlayer = async (
    nation: GovernanceNation,
    ownHouse: HouseKey | null,
    ruling: HouseKey | null,
    cityId: number | undefined,
    userId: string,
    nowMs: number,
  ): Promise<number | LeaderFail> => {
    if (nation.regime !== "capitalism" || ownHouse === null || ownHouse === ruling) return "not_eligible";
    if (cityId === undefined || !nation.cities.includes(cityId) || d.port.isStartCity(cityId))
      return "invalid_choice";
    if (!majorityHolder(cityId, ownHouse)) return "not_majority_holder";
    return (await declare(nation, ownHouse, cityId, userId, nowMs)) ?? "invalid_choice";
  };

  /** NPC 가문 독립 선언(틱 — 자본주의 나라, 도시마다 지분 50% 이상 NPC 가문) */
  const npcIndependence = async (
    nation: GovernanceNation,
    ruling: HouseKey | null,
    nowMs: number,
  ): Promise<void> => {
    if (nation.regime !== "capitalism") return;
    const rules = d.rules();
    const army = d.port.powerOf(d.port.armyUnits(nation), nowMs);
    for (const house of d.port.npcHousesOf(nation)) {
      const key: HouseKey = `n:${house.id}`;
      if (key === ruling || d.port.isStartCity(house.cityId) || !majorityHolder(house.cityId, key)) continue;
      const score = npcRunScore(
        { key, id: house.id, satisfaction: d.port.citySatisfaction(house.cityId), traits: nation.traits },
        rules,
      );
      if (score < rules.houseIndependenceNpcScore) continue;
      const power = d.port.powerOf(d.port.houseUnits(nation, key), nowMs);
      if (power * 1000 < army * rules.houseIndependencePowerPm) continue;
      // 한 틱에 나라마다 하나(도시가 빠지면 나라 모양이 바뀐다)
      if ((await declare(nation, key, house.cityId, null, nowMs)) !== undefined) return;
    }
  };

  /** 강화 집행: 맺음 enacted · 제안으로 남음 enacted(offer) · NPC 거절 failed · 맞지 않음 cancelled */
  const enactPeace = async (agenda: AgendaRow, nation: GovernanceNation, nowMs: number): Promise<void> => {
    const target =
      agenda.payload.targetNationId === undefined ? undefined : d.port.nation(agenda.payload.targetNationId);
    if (!target || !d.port.atWar(nation, target))
      return d.store.finish(agenda.id, { status: "cancelled", enactedAtMs: nowMs });
    const targetRuling = (await d.tools.ruling(target, (await d.store.states()).get(target.rowId))).key;
    const vacant = targetRuling === null && !target.playerHouse;
    let made = false;
    if (!playerLed(target, targetRuling) && !vacant) {
      if (!d.port.npcAcceptsPeace(nation, target, nowMs))
        return d.store.finish(agenda.id, { status: "failed", decidedAtMs: nowMs });
      made = await d.port.makePeace(nation, target, nowMs);
    } else {
      // 상대가 이미 우리에게 강화를 정했으면(기다림 안) 맺는다
      const since = nowMs - d.rules().peaceOfferMs;
      const offered = (await d.store.agendasOf(target.rowId, 200)).some(
        (row) =>
          row.kind === "peace" &&
          row.status === "enacted" &&
          row.payload.targetNationId === nation.rowId &&
          (row.enactedAtMs ?? 0) >= since,
      );
      if (offered) made = await d.port.makePeace(nation, target, nowMs);
    }
    await d.store.finish(agenda.id, { status: "enacted", enactedAtMs: nowMs });
    await d.audit(null, made ? "governance.peace_made" : "governance.peace_offered", {
      nationId: nation.rowId,
      targetNationId: target.rowId,
      agendaId: agenda.id,
    });
  };

  /** 화폐 단계 집행 */
  const enactCurrency = async (agenda: AgendaRow, nation: GovernanceNation, nowMs: number): Promise<void> => {
    const mode = agenda.payload.monetaryMode;
    if (!mode) return d.store.finish(agenda.id, { status: "cancelled", enactedAtMs: nowMs });
    const rateBp =
      mode === "manual" ? Math.max(-10_000, Math.min(10_000, agenda.payload.monetaryRateBp ?? 0)) : 0;
    await d.leader.saveMonetary({ nationId: nation.rowId, mode, rateBp }, null, nowMs);
    await d.store.finish(agenda.id, { status: "enacted", enactedAtMs: nowMs });
    await d.audit(null, "governance.currency_stage", {
      nationId: nation.rowId,
      agendaId: agenda.id,
      mode,
      rateBp,
    });
  };

  /** 틱: 지도자 나라의 거래세·화폐 단계 걸기, 신임도 줄·고리, NPC 가문 독립 */
  const tick = async (
    nations: ReadonlyMap<number, GovernanceNation>,
    states: ReadonlyMap<number, StateRow>,
    nowMs: number,
  ): Promise<void> => {
    const rules = d.rules();
    const monetary = await d.leader.monetary();
    const approvals = await d.leader.approvals();
    const manual = new Map<number, number>();
    const shifts = new Map<number, number>();
    const cache = new Map<number, number>();
    for (const nation of nations.values()) {
      const ruling = (await d.tools.ruling(nation, states.get(nation.rowId))).key;
      const led = playerLed(nation, ruling);
      if (led) {
        const want = d.port.leaderTradeTaxOf(nation);
        if (want !== undefined && want !== d.port.tradeTaxOf(nation)) d.port.setTradeTax(nation, want, nowMs);
        const money = monetary.get(nation.rowId);
        if (money?.mode === "manual") manual.set(nation.ownerId, money.rateBp);
      }
      if (ruling !== null) {
        let row = approvals.get(nation.rowId);
        if (row?.houseKey !== ruling) {
          row = {
            nationId: nation.rowId,
            houseKey: ruling,
            approval: ruling.startsWith("p:") ? rules.approvalPlayerStart : rules.approvalNpcStart,
          };
          await d.leader.saveApproval(row, nowMs);
        }
        cache.set(nation.rowId, row.approval);
        const shift = rebellionShiftOf(row.approval, rules.approvalRebellionEase);
        if (shift > 0) shifts.set(nation.ownerId, shift);
      }
    }
    approvalCache = cache;
    d.port.installMonetary(manual);
    d.port.installRebellionShifts(shifts);
    for (const nation of nations.values())
      await npcIndependence(nation, (await d.tools.ruling(nation, states.get(nation.rowId))).key, nowMs);
  };

  return {
    peacePayload,
    currencyPayload,
    declareByPlayer,
    enactPeace,
    enactCurrency,
    tick,
    /** 해임 가결 문턱(신임도 고리 — 칸 출발값 0 = 그대로) */
    removalThreshold: (nationRow: number, basePm: number): number =>
      removalThresholdWithApproval(basePm, approvalCache.get(nationRow), d.rules().approvalRemovalEasePm),
  };
}

export type LeaderAgendas = ReturnType<typeof createLeaderAgendas>;
