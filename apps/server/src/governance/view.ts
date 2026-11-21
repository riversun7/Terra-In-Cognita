// 나라 의결 조회(tRPC governance.view) — 내 나라(가문 소속 → 시민권)의 지배 가문·임기·열린 안건과 최근 끝난 안건, 내 자격. 읽기만 한다.
// 투표는 공개다(2365 가 — 누가 무엇을 던졌는지 보인다). 다른 나라 안건은 보이지 않는다. docs/adr/2026-11-21-governance.md 5절
import {
  AGENDA_KINDS,
  type AgendaKind,
  type GovernanceAgendaView,
  type GovernanceHouse,
  type GovernanceName,
  type GovernanceResponse,
  type HouseKey,
  isHouseKey,
} from "@terra/shared/governance";
import { type NationPreset, nationName } from "../npc/nations.ts";
import type { GovernancePort } from "./port.ts";
import type { GovernanceRules } from "./rules.ts";
import type { GovernanceService } from "./service.ts";
import type { AgendaRow, GovernanceStore } from "./store.ts";

/** 부결·취소 까닭(저장 값 → 화면 값) */
const FAIL_REASONS = ["quorum", "threshold", "tie", "no_candidates", "invalid", "regime"] as const;

/** 끝난 안건을 몇 개까지 보이나 */
const RECENT = 10;

const EMPTY: Omit<GovernanceResponse, "status"> = {
  nation: null,
  canPropose: [],
  leader: false,
  agendas: [],
  canCoup: false,
  coups: [],
  warTargets: [],
};

/** 의결 칸 올리기 목록에 넣지 않는 안건: 세율(나라 세금 명령이 연다 — 2407 가)·도시 독립(서버가 연다 — 2434 (가))·국고 지분 팔기(칸 입력은 시장 줄기 화면 — 2438) */
const NOT_LISTED: ReadonlySet<AgendaKind> = new Set([
  "tax_change",
  "city_independence",
  "treasury_share_sale",
]);
/** 끝난 쿠데타를 몇 개까지 보이나 */
const RECENT_COUPS = 3;

export function createGovernanceView(o: {
  readonly port: GovernancePort;
  readonly store: GovernanceStore;
  readonly service: GovernanceService;
  readonly rules: () => GovernanceRules;
  readonly presets?: (() => readonly NationPreset[]) | undefined;
  readonly now: () => number;
}) {
  const nationNames = async (rowIds: readonly number[]): Promise<Map<number, GovernanceName | null>> => {
    const labels = await o.store.factionLabels(rowIds);
    const presets = o.presets?.() ?? [];
    return new Map(
      rowIds.map((id) => {
        const label = labels.get(id);
        const preset = label?.code ? nationName(label.code, presets) : undefined;
        const name = preset ?? (label?.name ? { ko: label.name, en: label.name } : null);
        return [id, name];
      }),
    );
  };

  return async function view(userId: string): Promise<GovernanceResponse> {
    if (!o.port.ready()) return { status: "not_ready", ...EMPTY };
    const s = await o.service.standing(userId);
    if (!s) return { status: "no_nation", ...EMPTY };
    const rules = o.rules();
    const { nation } = s;
    const agendas = await o.store.agendasOf(nation.rowId, RECENT);
    const ids = agendas.map((agenda) => agenda.id);
    const [votes, candidates] = await Promise.all([o.store.votes(ids), o.store.candidates(ids)]);
    // 이름: 가문 열쇠·주주 열쇠(사용자 → 사이보그 이름, 세력 주체 → 나라·가문 이름)
    const houseKeys = new Set<string>();
    if (s.ruling.key) houseKeys.add(s.ruling.key);
    for (const agenda of agendas) {
      if (agenda.proposerKey && isHouseKey(agenda.proposerKey)) houseKeys.add(agenda.proposerKey);
      if (agenda.payload.barred) houseKeys.add(agenda.payload.barred);
      if (agenda.result?.winner) houseKeys.add(agenda.result.winner);
    }
    for (const row of candidates) houseKeys.add(row.houseKey);
    for (const row of votes) if (isHouseKey(row.voterKey)) houseKeys.add(row.voterKey);
    const houseNames = await o.store.houseNames([...houseKeys]);
    const ownerIds = [
      ...new Set(
        votes.filter((row) => row.voterKey.startsWith("o:")).map((row) => Number(row.voterKey.slice(2))),
      ),
    ];
    const ownerInfo = new Map(ownerIds.map((id) => [id, o.port.ownerInfo(id)]));
    const userNames = await o.store.userNames(
      [...ownerInfo.values()].flatMap((info) => (info?.userId ? [info.userId] : [])),
    );
    const others = o.port.nations().filter((row) => row.rowId !== nation.rowId);
    const factionRows = [
      nation.rowId,
      ...others.map((row) => row.rowId),
      ...[...ownerInfo.values()].flatMap((info) => (info?.factionRow ? [info.factionRow] : [])),
      ...agendas.flatMap((agenda) => (agenda.payload.targetNationId ? [agenda.payload.targetNationId] : [])),
    ];
    const names = await nationNames([...new Set(factionRows)]);
    const house = (key: HouseKey | null | undefined): GovernanceHouse | null =>
      key ? { key, name: houseNames.get(key) ?? null, npc: key.startsWith("n:") } : null;
    const voterOf = (key: string): GovernanceAgendaView["votes"][number]["voter"] => {
      if (isHouseKey(key)) return house(key) ?? { key, name: null, npc: false };
      const info = ownerInfo.get(Number(key.slice(2)));
      const name = info?.userId
        ? (userNames.get(info.userId) ?? null)
        : info?.factionRow
          ? (names.get(info.factionRow)?.ko ?? null)
          : null;
      return { key, name, npc: info?.userId === null && !info.playerHouse };
    };
    const myKeys = new Set(
      s.electorate.voters.filter((voter) => voter.userId === userId).map((voter) => voter.key),
    );
    // 도시 독립 투표는 그 도시 투표권(cityVotes.ts)으로 내 자격·투표권 합을 본다
    const cityElectorates = new Map(
      await Promise.all(
        agendas
          .filter((agenda) => agenda.kind === "city_independence")
          .map(async (agenda) => [agenda.id, await o.service.electorateOf(agenda, nation)] as const),
      ),
    );
    const nowMs = o.now();
    const toView = (agenda: AgendaRow): GovernanceAgendaView => {
      const mine = votes.filter((row) => row.agendaId === agenda.id);
      const cityElectorate = cityElectorates.get(agenda.id);
      const agendaKeys = cityElectorate
        ? new Set(cityElectorate.voters.filter((voter) => voter.userId === userId).map((voter) => voter.key))
        : myKeys;
      const { shares, minPrice } = agenda.payload;
      const cands = candidates.filter((row) => row.agendaId === agenda.id);
      const open = agenda.status === "open" && agenda.closesAtMs > nowMs;
      const live = new Map<string, bigint>();
      for (const row of mine) live.set(row.choice, (live.get(row.choice) ?? 0n) + row.weight);
      const counts = agenda.result?.counts;
      const registering =
        open &&
        agenda.kind === "leader_election" &&
        (agenda.registerUntilMs === null || nowMs < agenda.registerUntilMs);
      const totals =
        agenda.kind === "leader_election"
          ? null
          : agenda.result?.yes !== undefined
            ? { yes: agenda.result.yes, no: agenda.result.no ?? "0", abstain: agenda.result.abstain }
            : {
                yes: (live.get("yes") ?? 0n).toString(),
                no: (live.get("no") ?? 0n).toString(),
                abstain: (live.get("abstain") ?? 0n).toString(),
              };
      const target = agenda.payload.targetNationId;
      return {
        id: agenda.id,
        kind: agenda.kind,
        status: agenda.status,
        regime: agenda.regime,
        targetRegime: agenda.payload.regime ?? null,
        taxes: agenda.payload.taxes ?? null,
        cityId: agenda.payload.cityId ?? null,
        shareSale: shares !== undefined && minPrice !== undefined ? { shares, minPrice } : null,
        targetNation: target === undefined ? null : { id: target, name: names.get(target) ?? null },
        byAuthority: agenda.payload.byAuthority === true,
        proposer: agenda.proposerKey && isHouseKey(agenda.proposerKey) ? house(agenda.proposerKey) : null,
        openedAtMs: agenda.openedAtMs,
        registerUntilMs: agenda.registerUntilMs,
        closesAtMs: agenda.closesAtMs,
        effectAtMs: agenda.effectAtMs,
        reason: FAIL_REASONS.find((reason) => reason === agenda.result?.reason) ?? null,
        totals,
        electorate: agenda.result?.electorate ?? (cityElectorate ?? s.electorate).total.toString(),
        quorumPm: agenda.result?.quorumPm ?? rules.quorumOf(agenda.kind),
        thresholdPm:
          agenda.result?.thresholdPm ??
          (agenda.kind === "leader_election" ? 0 : o.service.thresholdFor(agenda)),
        candidates: cands.map((row) => ({
          key: row.houseKey,
          name: houseNames.get(row.houseKey) ?? null,
          npc: row.houseKey.startsWith("n:"),
          votes:
            counts?.find((count) => count.key === row.houseKey)?.votes ??
            (live.get(row.houseKey) ?? 0n).toString(),
        })),
        barred: house(agenda.payload.barred ?? null),
        winner: house(agenda.result?.winner ?? null),
        votes: mine.map((row) => ({
          voter: voterOf(row.voterKey),
          choice: row.choice,
          weight: row.weight.toString(),
        })),
        me: {
          canVote: open && agendaKeys.size > 0,
          choice: mine.find((row) => agendaKeys.has(row.voterKey))?.choice ?? null,
          canRegister:
            registering &&
            s.ownHouse !== null &&
            s.ownHouse !== (agenda.payload.barred ?? null) &&
            !cands.some((row) => row.houseKey === s.ownHouse),
          weight: s.power.toString(),
        },
      };
    };
    // 독재 지도자: 체제 전환 직권 + 선전포고 직권(질문 2440 나 — D-217)
    const canPropose: AgendaKind[] =
      nation.regime === "dictatorship"
        ? s.leader
          ? rules.warAgenda
            ? ["regime_change", "war_declaration"]
            : ["regime_change"]
          : []
        : o.service.mayPropose(s)
          ? AGENDA_KINDS.filter(
              (kind) => !NOT_LISTED.has(kind) && (kind !== "war_declaration" || rules.warAgenda),
            )
          : [];
    // 쿠데타(질문 2433 답·D-583): 일으킬 수 있나·그 나라 쿠데타
    const coupRows = await o.service.coups.coupsOf(nation.rowId, RECENT_COUPS);
    const coupSides = new Map(
      await Promise.all(coupRows.map(async (row) => [row.id, await o.service.coups.sides(row.id)] as const)),
    );
    const coupHouses = await o.store.houseNames(coupRows.map((row) => row.houseKey));
    const gathering = coupRows.some((row) => row.status === "gathering");
    const canCoup =
      rules.coupEnabled &&
      !nation.playerHouse &&
      !gathering &&
      s.ownHouse !== null &&
      s.ownHouse !== s.ruling.key;
    return {
      status: "ready",
      nation: {
        id: nation.rowId,
        name: names.get(nation.rowId) ?? null,
        regime: nation.regime,
        rulingHouse: house(s.ruling.key),
        termEndsAtMs: nation.regime === "dictatorship" ? null : (s.state?.termEndsAtMs ?? null),
        shareVotesSuspended: s.state?.shareVotesSuspended === true,
        rulingSharePm: o.service.tools.rulingSharePm(nation, s.ruling.key),
      },
      canPropose,
      leader: s.leader,
      agendas: agendas.map(toView),
      canCoup,
      coups: coupRows.map((row) => {
        const sides = coupSides.get(row.id) ?? [];
        const mine = sides.find((side) => side.userId === userId);
        return {
          id: row.id,
          house: {
            key: row.houseKey,
            name: coupHouses.get(row.houseKey) ?? null,
            npc: row.houseKey.startsWith("n:"),
          },
          status: row.status,
          gatherUntilMs: row.gatherUntilMs,
          rebels: sides.filter((side) => side.side === "rebel").length,
          government: sides.filter((side) => side.side === "government").length,
          mySide: mine?.side ?? null,
        };
      }),
      warTargets: others
        .filter((row) => !o.port.atWar(nation, row))
        .map((row) => ({ id: row.rowId, name: names.get(row.rowId) ?? null })),
    };
  };
}

export type GovernanceView = ReturnType<typeof createGovernanceView>;
