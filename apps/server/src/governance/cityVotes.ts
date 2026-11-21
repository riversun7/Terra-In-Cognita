// 빈자리 도시 독립 투표 — 사용자 답 D-583(질문 2434 (가) 가): 지도자 빈자리(governance_state.vacant_since_ms, 2403 답 D-582)가 설정 칸 gov_vacancy_split_ms를 넘으면
// 시작 도시가 아닌 도시마다(D-341 — 시작 도시는 빼다) 독립 투표가 저절로 열린다. 체제는 D-302 모양: 민주주의 = 그 도시 가문마다 한 표·과반, 자본주의 = 그 도시
// 지분 한 주 한 표(국고 지분은 D-581 비례 나눔)·문턱 = 세력·사회 independencePassPm. 가결되면 그 도시가 새 도시국가가 된다(체제는 옛 나라 체제 [임시] —
// portCoup.ts cityIndependence → @terra/sim society.cityIndependence).
// - 투표권: 그 도시만 든 나라 모양(cityElectorateNation)으로 셈한다. 민주주의의 플레이어 가문은 그 나라 소속 가문 모두가 든다 [임시 — 도시마다 플레이어 가문을 가를
//   기록이 없다, 질문 2451].
// - 한 빈자리 동안 도시마다 한 번만 연다(그 빈자리가 시작된 뒤 연 같은 도시 안건이 있으면 열지 않는다). 기간·정족수 = 지도자 묶음 설정 칸.
// - NPC 표(npcVote.ts): 그 가문 도시가 만족하지 않을수록 찬성(신앙은 남는 쪽).
import type { GovernanceNation, GovernancePort } from "./port.ts";
import type { GovernanceRules } from "./rules.ts";
import type { AgendaRow, GovernanceStore, StateRow } from "./store.ts";

/** 도시 독립 투표면 그 도시만 든 나라 모양(투표권 셈), 아니면 그 나라 */
export function cityElectorateNation(agenda: Pick<AgendaRow, "kind" | "payload">, nation: GovernanceNation) {
  const cityId = agenda.payload.cityId;
  return agenda.kind === "city_independence" && cityId !== undefined
    ? { ...nation, cities: [cityId] }
    : nation;
}

/** 이 빈자리 동안 열 도시(시작 도시·이미 연 도시 빼고) — 순수 함수 */
export function citiesToVote(
  nation: GovernanceNation,
  vacantSinceMs: number,
  agendas: readonly Pick<AgendaRow, "kind" | "payload" | "openedAtMs">[],
  isStart: (cityId: number) => boolean,
): number[] {
  const done = new Set(
    agendas
      .filter((row) => row.kind === "city_independence" && row.openedAtMs >= vacantSinceMs)
      .flatMap((row) => (row.payload.cityId === undefined ? [] : [row.payload.cityId])),
  );
  return nation.cities.filter((cityId) => !isStart(cityId) && !done.has(cityId));
}

export interface CityVoteDeps {
  readonly port: Pick<GovernancePort, "isStartCity">;
  readonly store: Pick<GovernanceStore, "agendasOf" | "insertAgenda">;
  readonly rules: () => GovernanceRules;
  readonly audit: (action: string, after: Record<string, unknown>) => Promise<void>;
}

/** 빈자리가 기간을 넘은 나라의 도시 독립 투표를 연다(틱마다, 멱등) */
export async function openCityVotes(
  d: CityVoteDeps,
  nations: Iterable<GovernanceNation>,
  states: ReadonlyMap<number, StateRow>,
  nowMs: number,
): Promise<void> {
  const rules = d.rules();
  for (const nation of nations) {
    const since = states.get(nation.rowId)?.vacantSinceMs ?? null;
    if (since === null || nation.regime === "dictatorship" || nowMs < since + rules.vacancySplitMs) continue;
    const agendas = await d.store.agendasOf(nation.rowId, 200);
    const cities = citiesToVote(nation, since, agendas, (cityId) => d.port.isStartCity(cityId));
    for (const cityId of cities) {
      const agenda = await d.store.insertAgenda({
        nationId: nation.rowId,
        kind: "city_independence",
        regime: nation.regime,
        proposerKey: null,
        proposerUser: null,
        payload: { cityId },
        openedAtMs: nowMs,
        registerUntilMs: null,
        closesAtMs: nowMs + rules.periodOf("city_independence"),
      });
      await d.audit("governance.city_vote_opened", { nationId: nation.rowId, cityId, agendaId: agenda.id });
    }
  }
}
