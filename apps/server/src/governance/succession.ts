// 지도자 빈자리의 자동 계승 — 질문 2491, 사용자 결정 D-584 "국가 지도자 가문 중에서 대체자, 후계자를 선정하거나 없으면 자동 투표"·D-588 5 "국가 지도자 = 지배 가문의
// 가문장. 자리가 비면 지배 가문의 서열이나 미리 지정한 후계자로 자동 계승하고, 지배 가문에서 이을 사람이 없을 때만 자동 선출"(줄기 governance-6).
// - 빈자리가 되면 먼저 지도자 가문(빈자리가 된 때의 지배 가문) 안에서 후임을 고르고, 그 사람을 그 가문의 가문장으로 세운다(factionIdentity/succession.ts
//   succeedHouseHead — 가문장 넘기기와 같은 몸통, 지금 가문장은 가문원으로). 지도자 = 지배 가문의 가문장이라 그대로 지도자다. 빈자리는 끝난다. 그 가문에 이을 사람이 없을
//   때만 예전처럼 누구나 나서는 자동 선출을 연다(service.ts — gov_vacancy_election_ms).
// - 고르는 차례: ① 가문장이 미리 정한 후계자(표 house_heirs, WebSocket house_heir — 그때 가문원이어야 한다) ② 서열 — 가문에 먼저 들어온 차례(들어온 시각, 같으면
//   계정 ID). 가문원 서열 자료가 따로 없어 들어온 차례를 서열로 읽는다 [임시 — 기술 기본값, 질문 2532]. 바꾸기 쉽게 pickSuccessor 하나에 둔다.
// - 빈자리가 되는 길: (1) 해임 뒤 다시 뽑기 실패(질문 2403 답 D-582 — 해임된 사람 = 안건 칸 barredUser는 이을 수 없다), (2) 지배 플레이어 가문에 가문장이 없어짐(계정이
//   지워져 가문원 줄이 사라짐 등). 옛 빈자리(이 판 전에 생긴 것)는 해임된 사람을 몰라 그 가문의 지금 가문장을 뺀다.
// - 독재 나라는 선출이 없어 이을 사람이 없으면 그대로 둔다(예전 길).
// - 바뀜(gov-fix-2 — 질문 2532 (3) 기획 답: D-588 5 "지배가문 서열에 따라 자동 승계"에 NPC 예외가 없다): NPC 지배 가문도 같은 길을 탄다. 해임된 사람 = 그때의 NPC 지배
//   가문장 유닛(안건 칸 barredUnit — 처음엔 NPC 국가 지도자 유닛), 이을 사람 = 그 가문 가문원 가운데 서열 첫 사람(npc/cityHouses.ts successorOf — 다른 NPC 가문의
//   가문장 규칙과 같은 서열: 시장이 든 가문이면 시장 → INT + WIS → 스탯 합 → 작은 ID [임시 — 2532 (4) 기술 기본값]). NPC 가문은 후계자 칸이 없다. 세우기 = 의결 상태
//   npc_head_unit_id에 적고 NPC 런타임에 알린다(applyRuling — NPC 국가 지도자 유닛은 남지만 그 가문을 이끌지 않는다). 이은 가문장이 사라지면 틱이 다음 사람을 세운다.
//   이을 가문원이 없을 때만 예전처럼 자동 선출.
// - 바뀜(gov-fix-3 — 질문 2574 점검, D-588 5 "지배가문 서열에 따라 자동 승계"): gov-fix-2는 선출로 지배 가문이 정해지면 계승 기록(npc_head_unit_id)을 지웠다. 그러면
//   같은 NPC 가문이 다시 뽑히거나 다른 NPC 가문이 뽑혔을 때 런타임 가문장이 NPC 국가 지도자 유닛(해임된 사람)으로 돌아왔다 — 서열 계승과 어긋난다. 이제 선출은 기록을
//   지우지 않는다(기록이 있으면 그 나라 국가 지도자 유닛은 퇴임한 채다): 같은 가문이면 이은 가문장이 그대로 잇고, 다른 NPC 가문이면 그 가문의 서열 첫 사람이 이끈다
//   (cityHouses.ts headOf — 기록 유닛이 그 가문원이 아니면 서열 규칙, 다음 틱이 그 사람을 기록으로 옮겨 적는다). 해임 뒤 다시 뽑기에서 다른 NPC 가문이 이기면
//   (기록이 아직 없을 때) 해임된 가문장 유닛을 빼고 그 가문 서열 첫 사람을 세운다. 해임된 옛 NPC 지도자 유닛을 어떻게 할지는 사용자 답(2574 — 질문 8)을 기다린다.
// - 바뀜(gov-fix-4 — 사용자 결정 D-591 2532 (2) "공정하게 자율 출마 재투표"): 해임(removal)으로 빈 자리는 같은 가문이 저절로 잇지 않는다. 해임 뒤 다시 뽑기가 실패하면
//   빈자리(까닭 removal — governance_state.vacancy_cause)가 되고, 틱은 그 빈자리에 계승을 하지 않으며 누구나 나서는 선출(service.ts — gov_vacancy_election_ms, 해임된
//   가문도 나설 수 있다)로만 채운다. 죽음·떠남 등으로 가문장이 사라진 빈자리는 예전대로 지배 가문의 후계자·서열로 잇는다(D-588 5).
// - 바뀜(gov-fix-4 — D-591 2532 (1) 나 "가문 안 직위나 기여도"): 서열 = 가문 안 직위(가문장 > 가문원 — 지금 가문 직위는 둘뿐이다) → 기여도(가문 금고에 넣은 기부 합,
//   house_members.contribution — 가문세는 아직 세지 않는다 [임시 2664]) → 들어온 차례 → 계정 ID(같을 때 [임시 2665]). rankMembers 하나에 둔다.
import type { HouseKey } from "@terra/shared/governance";
import type { Database } from "../db/client.ts";
import { succeedHouseHead } from "../factionIdentity/succession.ts";
import { type GovernanceNation, type GovernancePort, parseHouseKey } from "./port.ts";
import type { AgendaPayload, GovernanceStore, HouseMemberRow, StateRow } from "./store.ts";

/** 큰 값이 앞(bigint) */
const compareDesc = (a: bigint, b: bigint): number => (b > a ? 1 : b < a ? -1 : 0);

/** 가문 안 직위의 서열(작을수록 앞 — 가문장 0, 가문원 1). 직위가 늘면 여기에 더한다(D-591 2532 (1) 나) */
const POSITION_RANK: Readonly<Record<HouseMemberRow["role"], number>> = { leader: 0, member: 1 };

/**
 * 가문 서열(D-591 2532 (1) 나 — 직위 먼저, 그다음 기여도): 직위(가문장 > 가문원) → 기여도 큰 차례(가문 금고 기부 합) → 들어온 차례 → 계정 ID 차례(같을 때 [임시 2665])
 */
export function rankMembers(members: readonly HouseMemberRow[]): HouseMemberRow[] {
  return members.toSorted(
    (a, b) =>
      POSITION_RANK[a.role] - POSITION_RANK[b.role] ||
      compareDesc(a.contribution ?? 0n, b.contribution ?? 0n) ||
      a.joinedAtMs - b.joinedAtMs ||
      (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
  );
}

/**
 * 후임 고르기(D-588 5): 이을 수 있는(excluded가 아닌) 가문원 가운데 ① 미리 정한 후계자 ② 서열(rankMembers — 직위 → 기여도, D-591). 없으면 null
 */
export function pickSuccessor(
  members: readonly HouseMemberRow[],
  heir: string | undefined,
  excluded: ReadonlySet<string>,
): string | null {
  const eligible = members.filter((member) => !excluded.has(member.userId));
  if (heir !== undefined && eligible.some((member) => member.userId === heir)) return heir;
  return rankMembers(eligible)[0]?.userId ?? null;
}

/** 후임 고르기가 보는 나라 칸 */
type SuccessionNation = Pick<GovernanceNation, "rowId" | "regime">;

/** 후임(플레이어 가문 = 계정, NPC 가문 = 유닛) */
export type Successor =
  | { readonly npc: false; readonly row: number; readonly userId: string }
  | { readonly npc: true; readonly row: number; readonly unit: number };

/** 빼는 사람(해임된 사람 — 플레이어 계정·NPC 가문장 유닛) */
export interface SuccessionExcluded {
  readonly users?: ReadonlySet<string>;
  readonly units?: ReadonlySet<number>;
}

/** NPC 가문 계승이 읽고 쓰는 NPC 런타임 몫(바뀜 gov-fix-2 — port.ts) */
export interface SuccessionNpc {
  head(houseId: number): number | undefined;
  successor(houseId: number, excluded: ReadonlySet<number>): number | undefined;
  /** 세운 가문장을 NPC 런타임에 바로 알린다(다음 틱 applyRulings도 같은 값) */
  apply?(nation: SuccessionNation, house: HouseKey, unit: number): void;
}

/** 실제 세계 포트로 NPC 가문 계승 몫을 만든다(service.ts) */
export function npcSuccessionOf(
  port: Pick<GovernancePort, "npcHouseHead" | "npcHouseSuccessor" | "applyRuling" | "nation">,
): SuccessionNpc {
  return {
    head: (houseId) => port.npcHouseHead(houseId),
    successor: (houseId, excluded) => port.npcHouseSuccessor(houseId, excluded),
    apply(nation, house, unit) {
      const full = port.nation(nation.rowId);
      if (full) port.applyRuling(full, house, unit);
    },
  };
}

/** 해임 안건 칸: NPC 지배 가문이면 해임된 사람 = 지금 그 가문장 유닛(barredUnit — 바뀜 gov-fix-2). 아니면 빈 칸 */
export function barredUnitOf(
  port: Pick<GovernancePort, "npcHouseHead">,
  barred: HouseKey | null,
): { readonly barredUnit?: number } {
  const parsed = barred === null ? undefined : parseHouseKey(barred);
  const unit = parsed?.npc === true ? port.npcHouseHead(parsed.id) : undefined;
  return unit === undefined ? {} : { barredUnit: unit };
}

export interface SuccessionDeps {
  readonly store: Pick<GovernanceStore, "houseMembersOf" | "heirOf" | "saveState">;
  /** NPC 가문 계승(없으면 NPC 가문은 잇지 못한다 — 옛 시험) */
  readonly npc?: SuccessionNpc | undefined;
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

  /** 그 가문의 후임(플레이어 가문 = 후계자·서열, NPC 가문 = 가문원 서열 — 바뀜 gov-fix-2). 없으면 null */
  const successorOf = async (
    house: HouseKey | null,
    excluded: SuccessionExcluded,
  ): Promise<Successor | null> => {
    const parsed = house === null ? undefined : parseHouseKey(house);
    if (!parsed) return null;
    if (parsed.npc) {
      const unit = d.npc?.successor(parsed.id, excluded.units ?? new Set());
      return unit === undefined ? null : { npc: true, row: parsed.id, unit };
    }
    const [members, heir] = await Promise.all([d.store.houseMembersOf(parsed.id), d.store.heirOf(parsed.id)]);
    const userId = pickSuccessor(members, heir, excluded.users ?? new Set());
    return userId === null ? null : { npc: false, row: parsed.id, userId };
  };

  /** 후임을 그 가문의 가문장으로 세우고 그 가문이 지배 가문으로 남는다(빈자리 끝). 못 세우면 그대로. 감사 기록 governance.successor */
  const install = async (
    nation: SuccessionNation,
    state: StateRow,
    house: HouseKey,
    successor: Successor,
    nowMs: number,
  ): Promise<StateRow | undefined> => {
    if (!successor.npc && !(await promote(successor.row, successor.userId, nowMs))) return undefined;
    const next: StateRow = {
      ...state,
      rulingHouseKey: house,
      vacantSinceMs: null,
      npcHeadUnit: successor.npc ? successor.unit : null,
    };
    await d.store.saveState(next, nowMs);
    if (successor.npc) d.npc?.apply?.(nation, house, successor.unit);
    await d.audit(null, "governance.successor", {
      nationId: nation.rowId,
      house,
      ...(successor.npc ? { unit: successor.unit } : { userId: successor.userId }),
    });
    return next;
  };

  /**
   * 지도자 선출을 닫은 뒤 상태 쓰기(service.ts close): 이긴 가문이 있으면 지배 가문·임기. 해임 뒤 다시 뽑기(barred)가 실패하면 빈자리(질문 2403 답 D-582) — 까닭 removal로
   * 적어 같은 가문이 저절로 잇지 않는다(바뀜 gov-fix-4 — D-591 2532 (2), 틱이 누구나 나서는 선출을 연다). 쓴 상태
   */
  const afterElection = async (
    nation: SuccessionNation,
    current: StateRow,
    payload: AgendaPayload,
    winner: HouseKey | null,
    nowMs: number,
    termMs: number,
  ): Promise<StateRow> => {
    const { barred, barredUnit } = payload;
    // 해임 뒤 다시 뽑기가 실패했다(이번에 빈자리가 된다): 같은 가문이 잇지 않는다(바뀜 gov-fix-4 — D-591 2532 (2))
    const removalFailed = winner === null && barred !== undefined && current.vacantSinceMs === null;
    const next: StateRow = {
      ...current,
      rulingHouseKey: winner ?? current.rulingHouseKey,
      // 계승한 NPC 가문장 기록은 선출로 지우지 않는다(바뀜 gov-fix-3 — 위 머리 주석, 해임된 국가 지도자 유닛이 돌아오지 않게)
      electedAtMs: winner === null ? current.electedAtMs : nowMs,
      termEndsAtMs: nowMs + termMs,
      vacantSinceMs:
        winner !== null ? null : barred ? (current.vacantSinceMs ?? nowMs) : current.vacantSinceMs,
      vacancyCause: winner !== null ? null : removalFailed ? "removal" : (current.vacancyCause ?? null),
    };
    // 해임 뒤 다시 뽑기에서 다른 NPC 가문이 이겼다(기록 없음 — 해임된 사람 = 국가 지도자 유닛): 그 유닛을 빼고 이긴 가문 서열 첫 사람(바뀜 gov-fix-3)
    if (winner !== null && barredUnit !== undefined && (next.npcHeadUnit ?? null) === null) {
      const head = await successorOf(winner, { units: new Set([barredUnit]) });
      const installed = head?.npc === true ? await install(nation, next, winner, head, nowMs) : undefined;
      if (installed) return installed;
    }
    await d.store.saveState(next, nowMs);
    return next;
  };

  /**
   * 틱(나라마다, 임기·자동 선출 앞): 빈자리면(선출이 열려 있지 않을 때) 먼저 그 가문에서 후임(옛 빈자리는 해임된 사람을 몰라 지금 가문장을 뺀다 [임시]). 가문장이 없는 지배
   * 플레이어 가문은 후임을 세우고 없으면 빈자리로(독재는 선출이 없어 그대로). NPC 지배 가문(바뀜 gov-fix-2)은 계승으로 선 가문장이 사라졌으면 다음 사람을 세운다.
   * 바뀐 상태(없으면 그대로)
   */
  const tick = async (
    nation: SuccessionNation,
    state: StateRow | undefined,
    electing: boolean,
    nowMs: number,
  ): Promise<StateRow | undefined> => {
    const house = state?.rulingHouseKey ?? null;
    const parsed = house === null ? undefined : parseHouseKey(house);
    if (!state || house === null || !parsed) return state;
    if (parsed.npc) return npcTick(nation, state, house, parsed.id, electing, nowMs);
    const members = await d.store.houseMembersOf(parsed.id);
    const head = members.find((member) => member.role === "leader")?.userId;
    if (state.vacantSinceMs !== null) {
      // 빈자리 선출이 열려 있으면 그 선출을 기다린다. 해임으로 빈 자리는 계승하지 않는다(누구나 나서는 선출로만 — gov-fix-4, D-591 2532 (2))
      if (electing || state.vacancyCause === "removal") return state;
      const successor = await successorOf(house, { users: new Set(head === undefined ? [] : [head]) });
      return (successor && (await install(nation, state, house, successor, nowMs))) ?? state;
    }
    if (head !== undefined) return state;
    // 지배 가문에 가문장이 없어졌다: 그 가문에서 잇는다
    const successor = await successorOf(house, {});
    const installed = successor ? await install(nation, state, house, successor, nowMs) : undefined;
    if (installed) return installed;
    if (nation.regime === "dictatorship") return state;
    const vacant: StateRow = { ...state, vacantSinceMs: nowMs };
    await d.store.saveState(vacant, nowMs);
    await d.audit(null, "governance.vacant", { nationId: nation.rowId, house });
    return vacant;
  };

  /** NPC 지배 가문 틱(바뀜 gov-fix-2): 빈자리면 가문원 서열로 잇고, 계승으로 선 가문장이 사라졌으면 다음 사람을 세운다(없으면 NPC 런타임 규칙 그대로) */
  const npcTick = async (
    nation: SuccessionNation,
    state: StateRow,
    house: HouseKey,
    houseId: number,
    electing: boolean,
    nowMs: number,
  ): Promise<StateRow | undefined> => {
    if (!d.npc) return state;
    if (state.vacantSinceMs !== null) {
      if (electing || state.vacancyCause === "removal") return state;
      // 옛 빈자리의 해임된 사람은 NPC 국가 지도자 유닛(가문원이 아니라 잇지 못한다) 또는 계승으로 섰던 가문장
      const before = state.npcHeadUnit ?? null;
      const successor = await successorOf(house, { units: new Set(before === null ? [] : [before]) });
      return (successor && (await install(nation, state, house, successor, nowMs))) ?? state;
    }
    const recorded = state.npcHeadUnit ?? null;
    if (recorded === null || d.npc.head(houseId) === recorded) return state;
    const successor = await successorOf(house, { units: new Set([recorded]) });
    return (successor && (await install(nation, state, house, successor, nowMs))) ?? state;
  };

  return { successorOf, install, afterElection, tick };
}

export type Succession = ReturnType<typeof createSuccession>;
