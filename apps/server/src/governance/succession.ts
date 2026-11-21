// 지도자 빈자리의 자동 계승 — 질문 2491, 사용자 결정 D-584 "국가 지도자 가문 중에서 대체자, 후계자를 선정하거나 없으면 자동 투표"·D-588 5 "국가 지도자 = 지배 가문의
// 가문장. 자리가 비면 지배 가문의 서열이나 미리 지정한 후계자로 자동 계승하고, 지배 가문에서 이을 사람이 없을 때만 자동 선출"(줄기 governance-6).
// - 빈자리가 되면 먼저 지도자 가문(빈자리가 된 때의 지배 가문) 안에서 후임을 고르고, 그 사람을 그 가문의 가문장으로 세운다(factionIdentity/succession.ts
//   succeedHouseHead — 가문장 넘기기와 같은 몸통, 지금 가문장은 가문원으로). 지도자 = 지배 가문의 가문장이라 그대로 지도자다. 빈자리는 끝난다. 그 가문에 이을 사람이 없을
//   때만 예전처럼 누구나 나서는 자동 선출을 연다(service.ts — gov_vacancy_election_ms).
// - 고르는 차례: ① 가문장이 미리 정한 후계자(표 house_heirs, WebSocket house_heir — 그때 가문원이어야 한다) ② 서열 — 가문에 먼저 들어온 차례(들어온 시각, 같으면
//   계정 ID). 가문원 서열 자료가 따로 없어 들어온 차례를 서열로 읽는다 [임시 — 기술 기본값, 질문 2532]. 바꾸기 쉽게 pickSuccessor 하나에 둔다.
// - 빈자리가 되는 길: (1) 해임 뒤 다시 뽑기 실패(질문 2403 답 D-582 — 해임된 사람 = 안건 칸 barredUser는 이을 수 없다), (2) 지배 플레이어 가문에 가문장이 없어짐(계정이
//   지워져 가문원 줄이 사라짐 등). 옛 빈자리(이 판 전에 생긴 것)는 해임된 사람을 몰라 그 가문의 지금 가문장을 뺀다.
// - [임시] NPC 지배 가문: 의결에 개인 가문원이 없어(NPC 가문장은 NPC 가문 규칙이 늘 정한다) 이 길을 타지 않는다 → 해임 뒤 빈자리는 자동 선출. 독재 나라는 선출이 없어
//   이을 사람이 없으면 그대로 둔다(예전 길).
import type { HouseKey } from "@terra/shared/governance";
import type { Database } from "../db/client.ts";
import { succeedHouseHead } from "../factionIdentity/succession.ts";
import { type GovernanceNation, parseHouseKey } from "./port.ts";
import type { AgendaPayload, GovernanceStore, HouseMemberRow, StateRow } from "./store.ts";

/**
 * 후임 고르기(D-588 5): 이을 수 있는(excluded가 아닌) 가문원 가운데 ① 미리 정한 후계자 ② 서열 = 들어온 차례 [임시 2532](같으면 계정 ID 차례). 없으면 null
 */
export function pickSuccessor(
  members: readonly HouseMemberRow[],
  heir: string | undefined,
  excluded: ReadonlySet<string>,
): string | null {
  const eligible = members.filter((member) => !excluded.has(member.userId));
  if (heir !== undefined && eligible.some((member) => member.userId === heir)) return heir;
  const first = eligible.toSorted(
    (a, b) => a.joinedAtMs - b.joinedAtMs || (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  )[0];
  return first?.userId ?? null;
}

/** 후임 고르기가 보는 나라 칸 */
type SuccessionNation = Pick<GovernanceNation, "rowId" | "regime">;

export interface SuccessionDeps {
  readonly store: Pick<GovernanceStore, "houseMembersOf" | "heirOf" | "saveState">;
  readonly audit: (userId: string | null, action: string, after: Record<string, unknown>) => Promise<void>;
  /** 가문장을 세운다(시험은 가짜). 없으면 db로 factionIdentity succeedHouseHead, db도 없으면 세우지 못한다(false) */
  readonly promote?: ((houseRow: number, userId: string, nowMs: number) => Promise<boolean>) | undefined;
  readonly db?: Database | undefined;
}

export function createSuccession(d: SuccessionDeps) {
  const promote = async (houseRow: number, userId: string, nowMs: number): Promise<boolean> => {
    if (d.promote) return d.promote(houseRow, userId, nowMs);
    return d.db ? succeedHouseHead({ pool: d.db.$client, db: d.db }, houseRow, userId, nowMs) : false;
  };

  /** 그 가문의 후임(플레이어 가문만 — NPC 가문은 null [임시]) */
  const successorOf = async (
    house: HouseKey | null,
    excluded: ReadonlySet<string>,
  ): Promise<{ readonly row: number; readonly userId: string } | null> => {
    const parsed = house === null ? undefined : parseHouseKey(house);
    if (!parsed || parsed.npc) return null;
    const [members, heir] = await Promise.all([d.store.houseMembersOf(parsed.id), d.store.heirOf(parsed.id)]);
    const userId = pickSuccessor(members, heir, excluded);
    return userId === null ? null : { row: parsed.id, userId };
  };

  /** 후임을 그 가문의 가문장으로 세우고 그 가문이 지배 가문으로 남는다(빈자리 끝). 못 세우면 그대로. 감사 기록 governance.successor */
  const install = async (
    nation: SuccessionNation,
    state: StateRow,
    house: HouseKey,
    successor: { readonly row: number; readonly userId: string },
    nowMs: number,
  ): Promise<StateRow | undefined> => {
    if (!(await promote(successor.row, successor.userId, nowMs))) return undefined;
    const next: StateRow = { ...state, rulingHouseKey: house, vacantSinceMs: null };
    await d.store.saveState(next, nowMs);
    await d.audit(null, "governance.successor", { nationId: nation.rowId, house, userId: successor.userId });
    return next;
  };

  /**
   * 지도자 선출을 닫은 뒤 상태 쓰기(service.ts close): 이긴 가문이 있으면 지배 가문·임기. 해임 뒤 다시 뽑기(barred)가 실패하면 먼저 해임된 가문에서 후임(해임된 사람
   * barredUser는 빼고), 없으면 빈자리(질문 2403 답 D-582). 쓴 상태
   */
  const afterElection = async (
    nation: SuccessionNation,
    current: StateRow,
    payload: AgendaPayload,
    winner: HouseKey | null,
    nowMs: number,
    termMs: number,
  ): Promise<StateRow> => {
    const { barred, barredUser } = payload;
    const successor =
      winner !== null || !barred || current.vacantSinceMs !== null
        ? null
        : await successorOf(barred, new Set(barredUser === undefined ? [] : [barredUser]));
    const next: StateRow = {
      ...current,
      rulingHouseKey: winner ?? current.rulingHouseKey,
      electedAtMs: winner === null ? current.electedAtMs : nowMs,
      termEndsAtMs: nowMs + termMs,
      vacantSinceMs:
        winner !== null ? null : barred ? (current.vacantSinceMs ?? nowMs) : current.vacantSinceMs,
    };
    if (successor !== null && barred) {
      const installed = await install(nation, next, barred, successor, nowMs);
      if (installed) return installed;
    }
    await d.store.saveState(next, nowMs);
    return next;
  };

  /**
   * 틱(나라마다, 임기·자동 선출 앞): 빈자리면(선출이 열려 있지 않을 때) 먼저 그 가문에서 후임(옛 빈자리는 해임된 사람을 몰라 지금 가문장을 뺀다 [임시]). 가문장이 없는 지배
   * 플레이어 가문은 후임을 세우고 없으면 빈자리로(독재는 선출이 없어 그대로). 바뀐 상태(없으면 그대로)
   */
  const tick = async (
    nation: SuccessionNation,
    state: StateRow | undefined,
    electing: boolean,
    nowMs: number,
  ): Promise<StateRow | undefined> => {
    const house = state?.rulingHouseKey ?? null;
    const parsed = house === null ? undefined : parseHouseKey(house);
    if (!state || house === null || !parsed || parsed.npc) return state;
    const members = await d.store.houseMembersOf(parsed.id);
    const head = members.find((member) => member.role === "leader")?.userId;
    if (state.vacantSinceMs !== null) {
      // 빈자리 선출이 열려 있으면 그 선출을 기다린다
      if (electing) return state;
      const successor = await successorOf(house, new Set(head === undefined ? [] : [head]));
      return (successor && (await install(nation, state, house, successor, nowMs))) ?? state;
    }
    if (head !== undefined) return state;
    // 지배 가문에 가문장이 없어졌다: 그 가문에서 잇는다
    const successor = await successorOf(house, new Set());
    const installed = successor ? await install(nation, state, house, successor, nowMs) : undefined;
    if (installed) return installed;
    if (nation.regime === "dictatorship") return state;
    const vacant: StateRow = { ...state, vacantSinceMs: nowMs };
    await d.store.saveState(vacant, nowMs);
    await d.audit(null, "governance.vacant", { nationId: nation.rowId, house });
    return vacant;
  };

  return { successorOf, install, afterElection, tick };
}

export type Succession = ReturnType<typeof createSuccession>;
