// 지도자끼리 조약 서비스(서버 권위) — 사용자 결정 D-588(질문 2497 가·나 — 받는 쪽이 기한 안에 받는 제안 + 조항을 주고받으며 고치는 협상, D-292 조항 카드,
// 167 다 투표 필요 카드, 받는 쪽 NPC = NPC 규칙), 질문 2498(동맹·보호 효과 — 기술 기본값, D-291 요청 → 수락 → 전쟁 참가자 등록), docs/adr/2026-11-21-diplomacy-treaties.md.
// - 받아들이기(동의): 조약은 두 나라가 모두 받아들였을 때 맺는다. 지금 조항을 쓴 나라(지은이)가 먼저, 상대가 다음. 나라마다 받아들이는 길 = treatyPathOf(카드, 체제):
//   투표가 필요한 카드(동맹·보호·휴전·강화 — D-444 167)가 있고 독재가 아니면 비준 투표(의결 안건 treaty — 휴전·강화만이면 짧은 투표), 아니면 지도자가 바로.
//   지은이가 받아들이면 상대에게 간다(답 기한 = 설정 칸 gov_peace_offer_ms). 상대가 NPC가 이끄는 나라면 NPC 규칙(clauses.ts npcTreatyAnswer)이 바로 답한다.
// - 맞제안: 받는 쪽 지도자가 조항·기간을 고쳐 되돌린다(판 + 1, 지은이가 바뀐다 — 다시 받아들이기부터).
// - 맺음(서버가 바로 집행 — D-292): 휴전·강화 = 세력·사회 강화 조약(전쟁 끝 + 불가침), 불가침·동맹·보호 = 조약 기간 동안 불가침, 보호 = 공물(공물 주기마다) + 보호받는
//   쪽이 전쟁에 들면 보호하는 쪽에 참전 요청이 저절로 간다, 동맹·보호 = 참전 요청·수락(수락 = 그 적과 전쟁 참가자 — 무명분 비용 없음).
// - 틱(의결 틱 뒤 1분마다): 비준 투표 부결·취소, 답 기한 지남, 기간 끝(expired), 맺은 동안 두 나라가 전쟁 상태가 됨(broken — 조약은 공격을 막지 않는다, D-329 86),
//   불가침 다시 걸기(켤 때), 공물, 보호 저절로 참전 요청, 참전 요청 기한 지남.
//   바뀜(fixes-1117c — D-255 "어기면 모두가 보는 신뢰가 떨어진다"·D-290 "조약 위반 기록"): broken이면 맺은 뒤 상대에게 선포한 나라를 어긴 나라로 적는다(broken_by,
//   위반 장부 breaches.ts — 세력 신뢰·제재 명분). 모르면 null [임시 2582].
// 쓰기는 DB 바로. 명령·틱은 의결 사슬(governance service.run)에서 돈다 — 의결 틱의 조약 비준 집행(enact)과 겹치지 않는다.
import { DAY_MS } from "@terra/sim";
import type { DiplomacyAction, DiplomacyResultCode } from "@terra/protocol";
import { type TreatyClause, isOpenTreaty, treatyPathOf } from "@terra/shared/treaty";
import { writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { type TreatyHooks, playerLed } from "../governance/leaderAgendas.ts";
import type { GovernanceNation } from "../governance/port.ts";
import type { GovernanceRules } from "../governance/rules.ts";
import type { GovernanceService } from "../governance/service.ts";
import type { AgendaRow, GovernanceStore } from "../governance/store.ts";
import {
  type ClauseInput,
  TRUCE_CLAUSES,
  kindsOf,
  normalizeClauses,
  npcJoinsWar,
  npcTreatyAnswer,
  protectionOf,
} from "./clauses.ts";
import type { DiplomacyPort } from "./port.ts";
import type { DiplomacyStore, TreatyRow, WarJoinRow } from "./store.ts";

export type DiplomacyResult =
  | { readonly ok: true; readonly action: DiplomacyAction; readonly ref: number }
  | { readonly ok: false; readonly code: DiplomacyResultCode };

const fail = (code: DiplomacyResultCode): DiplomacyResult => ({ ok: false, code });
const done = (action: DiplomacyAction, ref: number): DiplomacyResult => ({ ok: true, action, ref });

export interface ProposeTreatyInput {
  readonly targetNationId: number;
  readonly clauses: readonly ClauseInput[];
  readonly days: number;
}

/** 조약에서 보는 나라의 상대 */
export const otherOf = (treaty: TreatyRow, nationId: number): number =>
  treaty.nationA === nationId ? treaty.nationB : treaty.nationA;
export const isParty = (treaty: TreatyRow, nationId: number): boolean =>
  treaty.nationA === nationId || treaty.nationB === nationId;

/** 받는 쪽(지은이가 아닌 나라)이 지금 답할 수 있나 */
export const awaitingReceiver = (treaty: TreatyRow, nowMs: number): boolean =>
  isOpenTreaty(treaty.state) &&
  treaty.authorReady &&
  treaty.agendaId === null &&
  treaty.respondByMs !== null &&
  treaty.respondByMs > nowMs;

/** 감사 기록에 적는 참전 요청 칸 */
const joinNote = (join: WarJoinRow) => ({
  requestId: join.id,
  treatyId: join.treatyId,
  requester: join.requesterNation,
  joiner: join.joinerNation,
  enemy: join.enemyNation,
});

/** 그 조약에서 requester가 상대에게 참전을 요청할 수 있나(동맹 = 둘 다, 보호 = 보호받는 쪽만) */
export const mayRequest = (treaty: TreatyRow, requester: number): boolean => {
  if (treaty.state !== "active") return false;
  if (kindsOf(treaty.clauses).includes("alliance")) return true;
  const protection = protectionOf(treaty.clauses);
  return protection !== undefined && protection.protectorNationId !== requester;
};

export function createDiplomacyService(o: {
  readonly governance: () => GovernanceService | undefined;
  readonly gstore: Pick<GovernanceStore, "insertAgenda" | "finish" | "agenda" | "states">;
  readonly port: DiplomacyPort;
  readonly store: DiplomacyStore;
  readonly rules: () => GovernanceRules;
  readonly now: () => number;
  readonly db?: Database | undefined;
  readonly log?: { error(obj: object, message: string): void } | undefined;
}) {
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

  /** NPC가 이끄는 나라인가(빈자리·플레이어가 이끄는 나라가 아니면) */
  const npcLed = async (nation: GovernanceNation): Promise<boolean> => {
    const gov = o.governance();
    if (!gov) return false;
    const state = (await o.gstore.states()).get(nation.rowId);
    const ruling = (await gov.tools.ruling(nation, state)).key;
    const vacant = ruling === null && !nation.playerHouse;
    return !vacant && !playerLed(nation, ruling);
  };

  const save = (row: TreatyRow, nowMs: number) => o.store.saveTreaty(row, nowMs);

  /** 끝낸다(declined·lapsed·expired·broken). 열린 비준 투표가 있으면 취소. brokenBy = 위반이면 어긴 나라(모르면 null) */
  const end = async (
    treaty: TreatyRow,
    state: "declined" | "lapsed" | "expired" | "broken",
    nowMs: number,
    userId: string | null = null,
    brokenBy: number | null = null,
  ): Promise<void> => {
    if (treaty.agendaId !== null) {
      const agenda = await o.gstore.agenda(treaty.agendaId);
      if (agenda?.status === "open")
        await o.gstore.finish(agenda.id, { status: "cancelled", decidedAtMs: nowMs });
    }
    await save(
      { ...treaty, state, agendaId: null, agendaNation: null, respondByMs: null, endedAtMs: nowMs, brokenBy },
      nowMs,
    );
    await audit(userId, `diplomacy.treaty_${state}`, {
      treatyId: treaty.id,
      nationA: treaty.nationA,
      nationB: treaty.nationB,
      revision: treaty.revision,
      ...(state === "broken" ? { brokenBy } : {}),
    });
  };

  /** 위반 장부를 켤 때 한 번 DB 위반 기록으로 채운다(어긴 나라 세력 행 → 거울 세계 세력 ID) */
  const breachBook = async () => {
    const book = o.port.breaches();
    if (!book || book.loaded()) return book;
    for (const row of await o.store.breaches()) {
      const owner = o.port.nation(row.nationId)?.ownerId;
      if (owner !== undefined) book.record(owner, row.atMs);
    }
    book.markLoaded();
    return book;
  };

  /** 맺은 조약이 두 나라 전쟁으로 깨졌다: 맺은 뒤 선포한 나라를 어긴 나라로 적고 장부에 남긴다 */
  const breakTreaty = async (
    treaty: TreatyRow,
    a: GovernanceNation,
    b: GovernanceNation,
    nowMs: number,
  ): Promise<void> => {
    const book = await breachBook();
    const declarer = book?.declarerSince(a.ownerId, b.ownerId, treaty.activatedAtMs ?? 0);
    const breaker = declarer === a.ownerId ? a : declarer === b.ownerId ? b : undefined;
    await end(treaty, "broken", nowMs, null, breaker?.rowId ?? null);
    if (breaker) book?.record(breaker.ownerId, nowMs);
  };

  /** 맺는다(D-292 서버가 바로 집행). 조건이 바뀌어 맺을 수 없으면 거절로 끝낸다 */
  const activate = async (treaty: TreatyRow, nowMs: number, userId: string | null): Promise<boolean> => {
    const a = o.port.nation(treaty.nationA);
    const b = o.port.nation(treaty.nationB);
    const kinds = kindsOf(treaty.clauses);
    const ceasefire = kinds.includes("ceasefire");
    if (!a || !b || (!ceasefire && o.port.atWar(a, b))) {
      await end(treaty, "declined", nowMs, userId);
      return false;
    }
    if (ceasefire && o.port.atWar(a, b)) await o.port.makePeace(a, b, nowMs);
    const expiresAtMs = nowMs + treaty.days * DAY_MS;
    if (kinds.some((kind) => TRUCE_CLAUSES.has(kind))) await o.port.setTruce(a, b, expiresAtMs);
    const protection = protectionOf(treaty.clauses);
    const tribute = (protection?.tributePm ?? 0) > 0;
    await save(
      {
        ...treaty,
        state: "active",
        agendaId: null,
        agendaNation: null,
        respondByMs: null,
        activatedAtMs: nowMs,
        expiresAtMs,
        nextTributeMs: tribute ? nowMs + o.rules().tributeEveryMs : null,
      },
      nowMs,
    );
    await audit(userId, "diplomacy.treaty_active", {
      treatyId: treaty.id,
      nationA: treaty.nationA,
      nationB: treaty.nationB,
      clauses: treaty.clauses,
      days: treaty.days,
    });
    return true;
  };

  /** 지은이가 받아들였다 → 상대에게 보낸다. 상대가 NPC가 이끄는 나라면 NPC 규칙이 바로 답한다 */
  const sendOut = async (
    treaty: TreatyRow,
    nowMs: number,
    userId: string | null,
  ): Promise<DiplomacyAction> => {
    const sent: TreatyRow = {
      ...treaty,
      authorReady: true,
      agendaId: null,
      agendaNation: null,
      respondByMs: nowMs + o.rules().peaceOfferMs,
    };
    await save(sent, nowMs);
    await audit(userId, "diplomacy.treaty_sent", {
      treatyId: treaty.id,
      from: treaty.authorNation,
      to: otherOf(treaty, treaty.authorNation),
      revision: treaty.revision,
      clauses: treaty.clauses,
      days: treaty.days,
    });
    const author = o.port.nation(treaty.authorNation);
    const receiver = o.port.nation(otherOf(treaty, treaty.authorNation));
    if (!author || !receiver || !(await npcLed(receiver))) return "sent";
    const atWar = o.port.atWar(author, receiver);
    const accept = npcTreatyAnswer({
      clauses: treaty.clauses,
      self: receiver.rowId,
      atWar,
      peaceScore: atWar && o.port.npcAcceptsPeace(author, receiver, nowMs) ? 1 : 0,
      aggression: receiver.traits.aggression,
      myStrength: o.port.strengthOf(receiver, nowMs),
      otherStrength: o.port.strengthOf(author, nowMs),
      calmPm: o.rules().npcTreatyCalmPm,
    });
    if (accept) return (await activate(sent, nowMs, null)) ? "active" : "declined";
    await end(sent, "declined", nowMs);
    return "declined";
  };

  /** 그 나라가 지금 조항을 받아들인다: 지도자 바로면 다음 걸음, 아니면 비준 투표를 연다 */
  const consent = async (
    treaty: TreatyRow,
    nation: GovernanceNation,
    proposerKey: string | null,
    userId: string | null,
    nowMs: number,
  ): Promise<DiplomacyResult> => {
    const author = treaty.authorNation === nation.rowId;
    const path = treatyPathOf(kindsOf(treaty.clauses), nation.regime);
    if (path === "leader") {
      if (author) return done(await sendOut(treaty, nowMs, userId), treaty.id);
      return (await activate(treaty, nowMs, userId))
        ? done("active", treaty.id)
        : done("declined", treaty.id);
    }
    const rules = o.rules();
    const periodMs = path === "short_vote" ? rules.periodOf("peace") : rules.periodOf("treaty");
    const agenda = await o.gstore.insertAgenda({
      nationId: nation.rowId,
      kind: "treaty",
      regime: nation.regime,
      proposerKey,
      proposerUser: userId,
      payload: {
        treatyId: treaty.id,
        treatyRevision: treaty.revision,
        targetNationId: otherOf(treaty, nation.rowId),
      },
      openedAtMs: nowMs,
      registerUntilMs: null,
      closesAtMs: nowMs + periodMs,
    });
    await save({ ...treaty, agendaId: agenda.id, agendaNation: nation.rowId }, nowMs);
    await audit(userId, "diplomacy.treaty_vote", {
      treatyId: treaty.id,
      nationId: nation.rowId,
      agendaId: agenda.id,
      author,
    });
    return done("voting", treaty.id);
  };

  /** 보는 사람의 나라·지도자 자격 */
  const leaderOf = async (
    userId: string,
  ): Promise<{ nation: GovernanceNation; key: string | null } | DiplomacyResult> => {
    const gov = o.governance();
    if (!gov || !o.port.ready()) return fail("busy");
    const s = await gov.standing(userId);
    if (!s) return fail("no_nation");
    if (!s.leader) return fail("not_leader");
    return { nation: s.nation, key: s.ruling.key };
  };

  const checkClauses = (
    input: { readonly clauses: readonly ClauseInput[]; readonly days: number },
    nation: GovernanceNation,
    other: GovernanceNation,
  ): TreatyClause[] | undefined => {
    const rules = o.rules();
    if (!Number.isSafeInteger(input.days) || input.days < 1 || input.days > rules.treatyMaxDays)
      return undefined;
    return normalizeClauses(
      input.clauses,
      nation.rowId,
      other.rowId,
      o.port.atWar(nation, other),
      rules.tributeMaxPm,
    );
  };

  const openBetween = async (a: number, b: number): Promise<boolean> =>
    (await o.store.treatiesOf(a, 200)).some((row) => isParty(row, b) && isOpenTreaty(row.state));

  const propose = async (userId: string, input: ProposeTreatyInput): Promise<DiplomacyResult> => {
    const me = await leaderOf(userId);
    if ("ok" in me) return me;
    const target = o.port.nation(input.targetNationId);
    if (!target || target.rowId === me.nation.rowId) return fail("unknown_target");
    const clauses = checkClauses(input, me.nation, target);
    if (!clauses) return fail("invalid_clauses");
    if (await openBetween(me.nation.rowId, target.rowId)) return fail("already_open");
    const nowMs = o.now();
    const treaty = await o.store.insertTreaty({
      nationA: me.nation.rowId,
      nationB: target.rowId,
      clauses,
      days: input.days,
      atMs: nowMs,
    });
    return consent(treaty, me.nation, me.key, userId, nowMs);
  };

  /** 보는 사람 나라가 든 조약(없거나 남의 것이면 unknown_treaty) */
  const treatyFor = async (
    nation: GovernanceNation,
    treatyId: number,
  ): Promise<TreatyRow | DiplomacyResult> => {
    const treaty = await o.store.treaty(treatyId);
    return treaty && isParty(treaty, nation.rowId) ? treaty : fail("unknown_treaty");
  };

  const counter = async (
    userId: string,
    input: { readonly treatyId: number; readonly clauses: readonly ClauseInput[]; readonly days: number },
  ): Promise<DiplomacyResult> => {
    const me = await leaderOf(userId);
    if ("ok" in me) return me;
    const treaty = await treatyFor(me.nation, input.treatyId);
    if ("ok" in treaty) return treaty;
    const nowMs = o.now();
    if (treaty.authorNation === me.nation.rowId || !awaitingReceiver(treaty, nowMs))
      return fail("not_your_turn");
    const other = o.port.nation(otherOf(treaty, me.nation.rowId));
    if (!other) return fail("unknown_target");
    const clauses = checkClauses(input, me.nation, other);
    if (!clauses) return fail("invalid_clauses");
    const next: TreatyRow = {
      ...treaty,
      authorNation: me.nation.rowId,
      revision: treaty.revision + 1,
      clauses,
      days: input.days,
      state: "negotiating",
      authorReady: false,
      respondByMs: null,
    };
    await save(next, nowMs);
    await audit(userId, "diplomacy.treaty_counter", {
      treatyId: treaty.id,
      nationId: me.nation.rowId,
      revision: next.revision,
      clauses,
      days: input.days,
    });
    return consent(next, me.nation, me.key, userId, nowMs);
  };

  const respond = async (
    userId: string,
    input: { readonly treatyId: number; readonly accept: boolean },
  ): Promise<DiplomacyResult> => {
    const me = await leaderOf(userId);
    if ("ok" in me) return me;
    const treaty = await treatyFor(me.nation, input.treatyId);
    if ("ok" in treaty) return treaty;
    const nowMs = o.now();
    if (!isOpenTreaty(treaty.state)) return fail("not_your_turn");
    // 거절·거두기: 열린 조약이면 어느 쪽 지도자든(비준 투표 중이어도 — 투표는 취소)
    if (!input.accept) {
      await end(treaty, "declined", nowMs, userId);
      return done("declined", treaty.id);
    }
    if (treaty.authorNation === me.nation.rowId || !awaitingReceiver(treaty, nowMs))
      return fail("not_your_turn");
    return consent(treaty, me.nation, me.key, userId, nowMs);
  };

  /** 참전 요청에 NPC가 이끄는 참가국이 바로 답한다 [임시 2556] */
  const npcAnswerJoin = async (join: WarJoinRow, nowMs: number): Promise<DiplomacyAction | undefined> => {
    const joiner = o.port.nation(join.joinerNation);
    const enemy = o.port.nation(join.enemyNation);
    if (!joiner || !enemy || !(await npcLed(joiner))) return undefined;
    const mine = o.port.strengthOf(joiner, nowMs);
    const theirs = o.port.strengthOf(enemy, nowMs);
    if (npcJoinsWar(mine, theirs) && (await o.port.joinWar(joiner, enemy, nowMs))) {
      await o.store.finishJoin(join.id, "joined", nowMs, { npc: true, mine, theirs });
      await audit(null, "diplomacy.war_joined", { ...joinNote(join), npc: true });
      return "joined";
    }
    await o.store.finishJoin(join.id, "declined", nowMs, { npc: true, mine, theirs });
    await audit(null, "diplomacy.war_join_declined", { ...joinNote(join), npc: true });
    return "refused";
  };

  /** 요청 하나 넣기(사람·저절로 같은 길). NPC 참가국이면 바로 답한다 */
  const openJoin = async (
    treaty: TreatyRow,
    requester: GovernanceNation,
    joiner: GovernanceNation,
    enemy: GovernanceNation,
    auto: boolean,
    userId: string | null,
    nowMs: number,
  ): Promise<DiplomacyResult> => {
    const join = await o.store.insertJoin({
      treatyId: treaty.id,
      requesterNation: requester.rowId,
      joinerNation: joiner.rowId,
      enemyNation: enemy.rowId,
      auto,
      atMs: nowMs,
      respondByMs: nowMs + o.rules().warRequestMs,
    });
    await audit(userId, "diplomacy.war_requested", { ...joinNote(join), auto });
    const npc = await npcAnswerJoin(join, nowMs);
    return done(npc ?? "requested", join.id);
  };

  const requestWar = async (
    userId: string,
    input: { readonly treatyId: number; readonly enemyNationId: number },
  ): Promise<DiplomacyResult> => {
    const me = await leaderOf(userId);
    if ("ok" in me) return me;
    const treaty = await treatyFor(me.nation, input.treatyId);
    if ("ok" in treaty) return treaty;
    if (!mayRequest(treaty, me.nation.rowId)) return fail("not_ally");
    const joiner = o.port.nation(otherOf(treaty, me.nation.rowId));
    const enemy = o.port.nation(input.enemyNationId);
    if (!joiner || !enemy || enemy.rowId === joiner.rowId || enemy.rowId === me.nation.rowId)
      return fail("unknown_target");
    if (!o.port.atWar(me.nation, enemy)) return fail("not_at_war");
    if (o.port.atWar(joiner, enemy)) return fail("already_at_war");
    if (await o.store.joinExists(treaty.id, joiner.rowId, enemy.rowId, true))
      return fail("already_requested");
    return openJoin(treaty, me.nation, joiner, enemy, false, userId, o.now());
  };

  const respondWar = async (
    userId: string,
    input: { readonly requestId: number; readonly accept: boolean },
  ): Promise<DiplomacyResult> => {
    const me = await leaderOf(userId);
    if ("ok" in me) return me;
    const join = await o.store.join(input.requestId);
    if (!join || join.joinerNation !== me.nation.rowId) return fail("unknown_treaty");
    const nowMs = o.now();
    if (join.state !== "requested" || join.respondByMs <= nowMs) return fail("not_your_turn");
    if (!input.accept) {
      await o.store.finishJoin(join.id, "declined", nowMs, { userId });
      await audit(userId, "diplomacy.war_join_declined", joinNote(join));
      return done("refused", join.id);
    }
    const requester = o.port.nation(join.requesterNation);
    const enemy = o.port.nation(join.enemyNation);
    if (!requester || !enemy || !o.port.atWar(requester, enemy)) {
      await o.store.finishJoin(join.id, "lapsed", nowMs, { reason: "war_over" });
      return fail("not_at_war");
    }
    if (!(await o.port.joinWar(me.nation, enemy, nowMs))) return fail("already_at_war");
    await o.store.finishJoin(join.id, "joined", nowMs, { userId });
    await audit(userId, "diplomacy.war_joined", joinNote(join));
    return done("joined", join.id);
  };

  /** 가결된 비준 투표 집행(의결 틱 안 — run을 부르지 않는다) */
  const enact = async (agenda: AgendaRow, nation: GovernanceNation, nowMs: number): Promise<void> => {
    const treatyId = agenda.payload.treatyId;
    const treaty = treatyId === undefined ? undefined : await o.store.treaty(treatyId);
    const valid =
      treaty !== undefined &&
      isOpenTreaty(treaty.state) &&
      treaty.agendaId === agenda.id &&
      treaty.agendaNation === nation.rowId &&
      treaty.revision === agenda.payload.treatyRevision;
    if (!valid) return o.gstore.finish(agenda.id, { status: "cancelled", enactedAtMs: nowMs });
    await o.gstore.finish(agenda.id, { status: "enacted", enactedAtMs: nowMs });
    if (treaty.authorNation === nation.rowId) await sendOut(treaty, nowMs, null);
    else if (treaty.respondByMs !== null && treaty.respondByMs > nowMs) await activate(treaty, nowMs, null);
    else await end(treaty, "lapsed", nowMs);
  };

  /** 의결 강화 안건이 플레이어가 이끄는 상대를 향할 때(leaderAgendas.ts enactPeace — 의결 사슬 안) */
  const peaceOffer = async (
    nation: GovernanceNation,
    target: GovernanceNation,
    nowMs: number,
  ): Promise<"made" | "offered"> => {
    const rows = await o.store.treatiesOf(nation.rowId, 200);
    const theirs = rows.find(
      (row) =>
        isParty(row, target.rowId) &&
        row.authorNation === target.rowId &&
        awaitingReceiver(row, nowMs) &&
        kindsOf(row.clauses).includes("ceasefire"),
    );
    // 상대가 먼저 낸 휴전·강화 조약 — 우리 나라는 강화 안건으로 이미 받아들였다
    if (theirs) return (await activate(theirs, nowMs, null)) ? "made" : "offered";
    if (rows.some((row) => isParty(row, target.rowId) && isOpenTreaty(row.state))) return "offered";
    const rules = o.rules();
    const days = Math.max(1, Math.min(rules.treatyMaxDays, Math.ceil(rules.truceMs / DAY_MS)));
    const treaty = await o.store.insertTreaty({
      nationA: nation.rowId,
      nationB: target.rowId,
      clauses: [{ kind: "ceasefire" }],
      days,
      atMs: nowMs,
    });
    await sendOut(treaty, nowMs, null);
    return "offered";
  };

  /** 틱 한 번(run 안) */
  const tick = async (): Promise<void> => {
    if (!o.port.ready()) return;
    const nowMs = o.now();
    const rules = o.rules();
    await breachBook();
    for (const treaty of await o.store.liveTreaties()) {
      if (isOpenTreaty(treaty.state)) {
        if (treaty.agendaId !== null) {
          const agenda = await o.gstore.agenda(treaty.agendaId);
          if (!agenda || agenda.status === "failed" || agenda.status === "cancelled") {
            // 지은이 나라가 받아들이지 않았다 → 거절, 받는 나라 투표가 떨어졌다 → 기한 안에 다시 해 볼 수 있다
            if (treaty.agendaNation === treaty.authorNation) await end(treaty, "declined", nowMs);
            else await save({ ...treaty, agendaId: null, agendaNation: null }, nowMs);
          }
        } else if (treaty.authorReady && (treaty.respondByMs ?? 0) <= nowMs)
          await end(treaty, "lapsed", nowMs);
        continue;
      }
      const a = o.port.nation(treaty.nationA);
      const b = o.port.nation(treaty.nationB);
      if (!a || !b || (treaty.expiresAtMs ?? 0) <= nowMs) {
        await end(treaty, "expired", nowMs);
        continue;
      }
      if (o.port.atWar(a, b)) {
        await breakTreaty(treaty, a, b, nowMs);
        continue;
      }
      const kinds = kindsOf(treaty.clauses);
      if (kinds.some((kind) => TRUCE_CLAUSES.has(kind)) && treaty.expiresAtMs !== null)
        await o.port.setTruce(a, b, treaty.expiresAtMs);
      const protection = protectionOf(treaty.clauses);
      if (!protection) continue;
      const protector = protection.protectorNationId === a.rowId ? a : b;
      const ward = protector === a ? b : a;
      if (treaty.nextTributeMs !== null && treaty.nextTributeMs <= nowMs) {
        const paid = o.port.payTribute(ward, protector, protection.tributePm ?? 0, nowMs);
        await save({ ...treaty, nextTributeMs: nowMs + rules.tributeEveryMs }, nowMs);
        await audit(null, "diplomacy.tribute", {
          treatyId: treaty.id,
          from: ward.rowId,
          to: protector.rowId,
          amount: paid.toString(),
        });
      }
      // 보호받는 나라가 든 전쟁마다 보호하는 나라에 참전 요청(조약·적마다 한 번 [임시 2555])
      for (const enemyId of o.port.enemiesOf(ward)) {
        const enemy = o.port.nation(enemyId);
        if (!enemy || enemy.rowId === protector.rowId || o.port.atWar(protector, enemy)) continue;
        if (await o.store.joinExists(treaty.id, protector.rowId, enemy.rowId, false)) continue;
        await openJoin(treaty, ward, protector, enemy, true, null, nowMs);
      }
    }
    for (const join of await o.store.openJoins()) {
      const requester = o.port.nation(join.requesterNation);
      const enemy = o.port.nation(join.enemyNation);
      if (join.respondByMs <= nowMs || !requester || !enemy || !o.port.atWar(requester, enemy))
        await o.store.finishJoin(join.id, "lapsed", nowMs, { reason: "expired_or_over" });
    }
  };

  /** 명령을 의결 사슬에서 돌리고 오류는 internal_error로 */
  const guarded =
    <A extends unknown[]>(work: (...args: A) => Promise<DiplomacyResult>) =>
    (...args: A): Promise<DiplomacyResult> => {
      const gov = o.governance();
      if (!gov) return Promise.resolve(fail("busy"));
      return gov
        .run(() => work(...args))
        .catch((error: unknown) => {
          o.log?.error({ err: error }, "diplomacy command failed");
          return fail("internal_error");
        });
    };

  const hooks: TreatyHooks = { enact, peaceOffer };

  return {
    propose: guarded(propose),
    counter: guarded(counter),
    respond: guarded(respond),
    requestWar: guarded(requestWar),
    respondWar: guarded(respondWar),
    /** 의결 서비스에 거는 고리(비준 집행·강화 제안) */
    hooks,
    tick: (): Promise<void> => {
      const gov = o.governance();
      if (!gov) return Promise.resolve();
      return gov.run(tick).catch((error: unknown) => {
        o.log?.error({ err: error }, "diplomacy tick failed");
      });
    },
    npcLed,
    /** 조약 위반 장부(조회·시험 — 세계가 준비되지 않았으면 undefined) */
    breaches: () => o.port.breaches(),
  };
}

export type DiplomacyService = ReturnType<typeof createDiplomacyService>;
