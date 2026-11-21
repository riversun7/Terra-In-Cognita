// 외교 조회(tRPC diplomacy.view) — 내 나라(가문 소속 → 시민권)의 조약(열린 것·맺은 것·최근 끝난 것)·참전 요청·제안 상대. 읽기만 한다.
// 다른 나라끼리의 조약은 보이지 않는다. docs/adr/2026-11-21-diplomacy-treaties.md
import type { GovernanceName } from "@terra/shared/governance";
import {
  type DiplomacyNationRef,
  type DiplomacyResponse,
  type TreatyView,
  type TreatyWaiting,
  type WarJoinView,
  isOpenTreaty,
  treatyPathOf,
} from "@terra/shared/treaty";
import type { GovernanceNation } from "../governance/port.ts";
import type { GovernanceRules } from "../governance/rules.ts";
import type { GovernanceService } from "../governance/service.ts";
import type { GovernanceStore } from "../governance/store.ts";
import { type NationPreset, nationName } from "../npc/nations.ts";
import { kindsOf, protectionOf } from "./clauses.ts";
import type { DiplomacyPort } from "./port.ts";
import { type DiplomacyService, awaitingReceiver, isParty, otherOf } from "./service.ts";
import type { DiplomacyStore, TreatyRow, WarJoinRow } from "./store.ts";

/** 조약을 몇 개까지 보이나(열린 것·맺은 것은 늘, 끝난 것은 이 수까지) */
const RECENT = 12;

const EMPTY: Omit<DiplomacyResponse, "status"> = {
  nation: null,
  leader: false,
  maxDays: 1,
  tributeMaxPm: 0,
  partners: [],
  treaties: [],
  warJoins: [],
};

/** 보는 나라 기준 다음 차례 */
export function waitingOf(treaty: TreatyRow, us: number, nowMs: number): TreatyWaiting {
  if (!isOpenTreaty(treaty.state)) return null;
  if (treaty.agendaId !== null) return treaty.agendaNation === us ? "our_vote" : "their_vote";
  const ourText = treaty.authorNation === us;
  if (!treaty.authorReady) return ourText ? "us" : "them";
  if (!awaitingReceiver(treaty, nowMs)) return null;
  return ourText ? "them" : "us";
}

export function createDiplomacyView(o: {
  readonly port: DiplomacyPort;
  readonly store: DiplomacyStore;
  readonly gstore: Pick<GovernanceStore, "factionLabels">;
  readonly governance: () => GovernanceService | undefined;
  readonly service: Pick<DiplomacyService, "npcLed">;
  readonly rules: () => GovernanceRules;
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  readonly now: () => number;
}) {
  const names = async (rowIds: readonly number[]): Promise<Map<number, GovernanceName | null>> => {
    const labels = await o.gstore.factionLabels(rowIds);
    const presets = o.presets?.() ?? [];
    return new Map(
      rowIds.map((id) => {
        const label = labels.get(id);
        const preset = label?.code ? nationName(label.code, presets) : undefined;
        return [id, preset ?? (label?.name ? { ko: label.name, en: label.name } : null)];
      }),
    );
  };

  return async (userId: string): Promise<DiplomacyResponse> => {
    const gov = o.governance();
    if (!gov || !o.port.ready()) return { status: "not_ready", ...EMPTY };
    const s = await gov.standing(userId);
    if (!s) return { status: "no_nation", ...EMPTY };
    const nation = s.nation;
    const us = nation.rowId;
    const nowMs = o.now();
    const rules = o.rules();
    const all = await o.store.treatiesOf(us, 200);
    const live = all.filter((row) => isOpenTreaty(row.state) || row.state === "active");
    const ended = all.filter((row) => !isOpenTreaty(row.state) && row.state !== "active").slice(0, RECENT);
    const treaties = [...live, ...ended].toSorted((a, b) => b.id - a.id);
    const joins = await o.store.joinsOf(us, 30);
    const others = o.port.nations().filter((row) => row.rowId !== us);
    const nameOf = await names([
      us,
      ...others.map((row) => row.rowId),
      ...treaties.map((row) => otherOf(row, us)),
      ...joins.flatMap((row) => [row.requesterNation, row.joinerNation, row.enemyNation]),
    ]);
    const ref = (id: number): DiplomacyNationRef => ({ id, name: nameOf.get(id) ?? null });
    const ourEnemies = o.port.enemiesOf(nation);
    const partners = await Promise.all(
      others.map(async (other) => {
        // 그 나라와 맺은 동맹(둘 다)·보호(우리가 보호받는 쪽) 조약이 있으면 우리 적 가운데 그 나라가 아직 싸우지 않는 상대에게 참전을 요청할 수 있다
        const ally = live.find(
          (row) =>
            row.state === "active" &&
            isParty(row, other.rowId) &&
            (kindsOf(row.clauses).includes("alliance") ||
              (protectionOf(row.clauses)?.protectorNationId ?? us) !== us),
        );
        const requestable = ally
          ? ourEnemies.flatMap((id) => {
              const enemy = o.port.nation(id);
              return enemy && enemy.rowId !== other.rowId && !o.port.atWar(other, enemy) ? [ref(id)] : [];
            })
          : [];
        return {
          ...ref(other.rowId),
          atWar: o.port.atWar(nation, other),
          truceUntilMs: truceOf(nation, other),
          playerLed: !(await o.service.npcLed(other)),
          requestTreatyId: ally?.id ?? null,
          requestable,
        };
      }),
    );
    function truceOf(a: GovernanceNation, b: GovernanceNation): number | null {
      const until = o.port.truceUntil(a, b);
      return until !== undefined && until > nowMs ? until : null;
    }
    const treatyView = (row: TreatyRow): TreatyView => {
      const waiting = waitingOf(row, us, nowMs);
      const open = isOpenTreaty(row.state);
      return {
        id: row.id,
        other: ref(otherOf(row, us)),
        initiatedByUs: row.nationA === us,
        authoredByUs: row.authorNation === us,
        revision: row.revision,
        clauses: row.clauses.map((clause) => ({
          kind: clause.kind,
          weProtect: clause.kind === "protection" ? clause.protectorNationId === us : null,
          tributePm: clause.kind === "protection" ? (clause.tributePm ?? 0) : null,
        })),
        days: row.days,
        state: row.state,
        waiting,
        path: treatyPathOf(kindsOf(row.clauses), nation.regime),
        respondByMs: open ? row.respondByMs : null,
        agendaId: row.agendaNation === us ? row.agendaId : null,
        createdAtMs: row.createdAtMs,
        activatedAtMs: row.activatedAtMs,
        expiresAtMs: row.expiresAtMs,
        endedAtMs: row.endedAtMs,
        can: {
          accept: s.leader && waiting === "us",
          counter: s.leader && waiting === "us",
          decline: s.leader && open,
        },
      };
    };
    const joinView = (row: WarJoinRow): WarJoinView => ({
      id: row.id,
      treatyId: row.treatyId,
      requester: ref(row.requesterNation),
      joiner: ref(row.joinerNation),
      enemy: ref(row.enemyNation),
      state: row.state,
      auto: row.auto,
      createdAtMs: row.createdAtMs,
      respondByMs: row.respondByMs,
      canAnswer: s.leader && row.state === "requested" && row.joinerNation === us && row.respondByMs > nowMs,
    });
    return {
      status: "ready",
      nation: { ...ref(us), regime: nation.regime },
      leader: s.leader,
      maxDays: rules.treatyMaxDays,
      tributeMaxPm: rules.tributeMaxPm,
      partners,
      treaties: treaties.map(treatyView),
      warJoins: joins.map(joinView),
    };
  };
}

export type DiplomacyView = ReturnType<typeof createDiplomacyView>;
