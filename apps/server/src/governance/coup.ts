// 군사 쿠데타(서버 권위) — 줄기 governance-3. 기획 D-582(2401 답: 성공하면 그 가문이 독재 지배 가문, 다른 모든 주주 지분 몰수, 충성도 크게 떨어짐)·질문 2433
// 기술 기본값(가 군사력 = 가문 유닛 전투력 D-576, 다 비용·라 쿨타임 = 설정 칸, 마 NPC 결정 = D-323 성향 규칙식 D-555 1509)·사용자 답 D-583(2433 나 가: 혁명군
// (일으킨 가문) 대 정부군(지배 가문원 + 수도 경비대), 누구나 어느 편이든 든다, 이긴 편 참가자는 공훈·신용 보상 — 크기는 설정 칸).
// - 켬: 설정 칸 gov_coup_enabled(출발값 0 = 끔). 끄면 명령은 coup_disabled, NPC는 일으키지 않는다(참가 받는 중인 쿠데타는 그대로 끝난다).
// - 일으키기: 그 나라 소속 플레이어 가문의 장(gov_coup — 지배 가문이 아닐 때) 또는 NPC 가문(틱 — 출마 점수와 같은 성향 규칙식 npcRunScore ≥ gov_coup_npc_score
//   이고 가문 힘 ≥ 정부군 힘 × gov_coup_npc_power_pm ÷ 1000). 가문마다 쿨타임 gov_coup_cooldown_ms, 나라마다 한 번에 하나. 플레이어 가문 나라는 빼다(그 나라가
//   곧 그 가문이다 [임시]).
// - 참가 받기(gov_coup_gather_ms): 플레이어는 누구나 gov_coup_join으로 편을 든다(그 사람 유닛이 그 편으로 싸운다). NPC 가문은 틱마다 성향 규칙식으로 든다(점수 ≥
//   문턱 → 혁명군, ≤ −문턱 → 정부군, 사이는 안 든다).
// - 전투(참가 받기 끝): 반란 전투 틀(D-256 — @terra/sim runCoupBattle, portCoup.ts). 혁명군 = 일으킨 가문 유닛 + 혁명군 참가자 유닛, 정부군 = 지배 가문 유닛 + 수도
//   경비대 + 정부군 참가자 유닛.
// - 이기면: 그 가문이 지배 가문(선출 기록 자리 governance_state — 임기 없음·빈자리 끝), 체제 = 독재, 그 나라 모든 도시의 다른 주주 지분 → 그 가문 계정(국고 포함),
//   지배 쪽 지분 가문 기록 = 그 가문(국고 지분 남김 없음), 나라 휴먼 만족도 − gov_coup_satisfaction_drop. 지면: 일으킨 가문만 비용(금고 → 나라 국고, 있는 만큼 —
//   gov_coup_fail_cost) + 그 가문 유닛 만족도 − gov_coup_fail_satisfaction_drop.
// - 보상(이긴 편 플레이어 참가자): 나라 명성 gov_coup_merit_renown(공훈 — D-326 명성), 신용 gov_coup_credit_reward는 신용 체계 줄기가 붙을 고리(rewardCredit)만 —
//   TODO(신용 줄기 work/credit이 main에 오면 잇는다).
// 감사 기록 governance.coup_started·coup_won·coup_lost·coup_cancelled.
// 바뀜(줄기 governance-5 — 질문 2455·2456·2457·2458 답, 사용자 답 D-585):
// - 일으키기: 어느 가문이든(D-585 — "군사력 1위" 조건 없음). 지배 가문이 바뀐 뒤 gov_coup_protect_ms 동안은 막는다(출발값 0 = 막지 않음, coup_protected).
// - 참전 = 병력을 데려온다(2455 답 D-583): 플레이어 참가자의 병력 = 수도에 있는 그 사람 유닛(unitIds를 주면 그 가운데 고른 것). 병력 없이 편만 들면 보상이 없다.
//   데려온 유닛 ID를 참가 줄에 적고(units), 전투 때 그 가운데 아직 그 사람 것인 유닛만 싸운다. NPC 가문은 가문원.
// - 이기면(D-585): 쿠데타 가문이 차지한 도시만 새 나라로 떨어져 나가고 옛 나라는 남는다. 차지한 도시 = 쿠데타 가문의 자리 도시(NPC 가문 = 그 가문 도시, 플레이어 가문 =
//   소속 도시 house_homes)로 읽었다(아래 바뀜 gov-coup이 대신한다 — 싸운 도시). 새 나라 = 독재(D-582), 지배 가문 = 쿠데타 가문, 그 도시 다른 주주 지분 → 그 가문 계정, 그 도시 휴먼 만족도 벌칙.
//   그 도시가 시작 도시(D-341 — 떨어져 나가지 못함)이거나 자리 도시를 모르면 예전처럼 옛 나라 전체를 차지한다(아래 바뀜 gov-coup — [임시 2542]).
// - 신용(D-584): 혁명군에 들면 신용이 내린다(credit_coup_join), 이긴 편 참가자는 새 나라 신용을 gov_coup_credit_reward만큼 높게 시작한다(새 나라가 없으면 지금 나라에 더함).
// - 전투 결과(2456 가): 반란 전투 틀 빨리감기 — 거울 세계 유닛 부상만, 포로 없음(내전). 실패 벌칙(2458 가)은 그대로(가문 금고 → 국고, 만족도).
// 바뀜(줄기 gov-coup — 사용자 결정 D-588 2492 가 "쿠데타 전투는 모든 도시에서 누구나 가능하다"): 수도 반란 틀(D-256) 대신 일으킨 도시에서 싸운다.
// - 도시: 플레이어는 gov_coup cityId로 그 나라 도시 아무 곳이나 고른다(없으면 내 가문 자리 도시 house_homes → 수도). NPC 가문은 그 가문 도시에서 일으킨다(같은 길 — open).
//   쿠데타 줄에 도시를 적는다(governance_coups.city_id, 옛 줄 = 수도).
// - 병력·방어(그 도시에 있는 것만): 혁명군 = 일으킨 가문 유닛 + 혁명군 참가자 병력, 정부군 = 지배 가문 유닛 + 그 도시 경비대 + 정부군 참가자 병력. 플레이어 병력 = 그 도시에 있는
//   내 유닛(unitIds로 고름). NPC 일으키기 힘 비도 그 도시 안 힘으로 본다.
// - 이기면: 그 도시가 새 독재 나라로 떨어져 나간다(D-585 — 지배 가문 = 쿠데타 가문). 그 도시가 시작 도시(D-341 — 떨어져 나가지 못함, 수도 포함)면 옛 나라 전체를 차지한다
//   [임시 — 질문 2542].
// - "누구나"(기존 진입 규칙을 그대로 — 질문 2544): 일으키기 = 그 나라에 속한 플레이어 가문의 장(어느 가문이든, 지배 가문 빼고 — 이기면 그 가문이 새 나라 지배 가문) 또는
//   NPC 가문, 편 들기 = 누구나. 비용·쿨타임·보호 기간·나라마다 하나·플레이어 가문 나라 빼기는 그대로.
// 바뀜(gov-fix-2 — 기획 답 2542·2545·2549, 아래가 위를 대신한다):
// - 2542(D-585 8 "도시만"): 시작 도시(수도 포함)에서 이겨도 그 도시만 새 나라로 떨어져 나간다(D-341 예외 — society.cityIndependence coup). "옛 나라 전체" 길은 없앴다.
//   수도를 잃은 옛 나라는 점령으로 수도를 잃을 때와 같은 길로 수도를 옮긴다(npc/capitals.ts capitalOf가 남은 도시에서 바로 다시 고르고, 하루 끝 review가 적고 지도자를
//   옮긴다 — D-528). 떼어 내지 못하면(세계 준비 안 됨 등) 이겨도 아무것도 바뀌지 않는다(결과 reason no_split).
// - 2545(D-585 1 "누구든 가능하다"·D-588 6): 플레이어 가문 나라도 쿠데타 대상이다 — 그 나라에 속한 다른 플레이어 가문의 장이 일으킨다(그 나라에는 NPC 가문이 없다).
//   정부군의 지배 가문 유닛 = 그 나라(= 그 가문) 소유 주체의 유닛. 이기면 싸운 도시가 새 독재 나라(지배 가문 = 쿠데타 가문)로 떨어져 나간다.
// - 2549(D-583 "누구나 참전가능. 정부군 vs 혁명군"): 정부군도 혁명군과 같은 참전 길이다 — 편을 든 쪽은 병력을 어디에 있든 보낸다(그 도시에 이미 있는 유닛으로 막지 않는다).
//   혁명군 = 일으킨 가문 유닛 + 혁명군 참가자 병력, 정부군 = 지배 가문 유닛 + 그 도시 경비대 + 정부군 참가자 병력. 플레이어 병력 = 고른 유닛(unitIds), 고르지 않으면 내
//   유닛 모두 [임시 — 질문 2571]. NPC 가문 = 가문원. 경비대만 그 도시 것이다. 빨리감기 전투라 보내는 이동 시간은 없다 [임시 — 질문 2571].
// 바뀜(줄기 no-teleport — 사용자 결정 D-591 "어떠한 경우에도 순간이동은 없다 파견으로 실제로 이동해서 참전한다", 위 2549의 "이동 시간 없음"을 대신한다 —
// coupDispatch.ts): 병력은 실제로 쿠데타 도시로 걸어가 그 도시 2차맵에 닿아야 싸운다. 전투(참가 받기 끝)에는 그때 그 도시 2차맵에 도착한 유닛만 든다 — 혁명군·정부군
// 모두(일으킨 가문·지배 가문·참가자·경비대, 플레이어·NPC). 플레이어 참가자는 고른 유닛을 이동 서비스로 보내고(고르지 않으면 이미 그 도시에 있는 내 유닛만),
// 일으킨 사람도 처음에는 그 도시에 있는 내 유닛만 든다(더 보내려면 혁명군 참가로 고른다). NPC 유닛은 2차맵 사이로 보내는 길이 없어 그 도시에 있는 것만 [임시 — 질문 2651].
// 늦게 닿는 유닛은 싸우지 않는다 [임시 — 질문 2652]. NPC 일으키기·참가의 힘 비도 그 도시에 있는 힘으로 본다.
import type { HouseKey } from "@terra/shared/governance";
import { arrivedIn, dispatchTroops } from "./coupDispatch.ts";
import type { CoupRow, CoupSide, CoupStore } from "./coupStore.ts";
import type { ElectorateTools } from "./electorate.ts";
import { npcRunScore } from "./npcVote.ts";
import type { GovernanceNation, GovernancePort } from "./port.ts";
import type { GovernanceRules } from "./rules.ts";
import type { GovernanceResult, Standing } from "./service.ts";
import type { LeaderStore } from "./leaderStore.ts";
import type { GovernanceStore, StateRow } from "./store.ts";

/** 쿠데타 신용 고리(D-584 — governance/attach.ts가 credit/로 잇는다) */
export interface CoupCredit {
  /** 혁명군에 들었다(신용 내림) */
  joined(userId: string, nowMs: number): void;
  /** 이긴 편 참가자: 새 나라(소유 주체 ID — 없으면 지금 나라) 신용을 amount만큼 높게 시작 */
  won(userId: string, nationOwnerId: number | undefined, amount: number, nowMs: number): void;
}

/** 쿠데타가 쓰는 포트 몫(시험이 가짜로 채운다 — coup.test.ts) */
export type CoupPort = Pick<
  GovernancePort,
  | "addRenown"
  | "applyRuling"
  | "capitalOf"
  | "cityGuards"
  | "cityPlace"
  | "cityIndependence"
  | "citySatisfaction"
  | "confiscateToHouse"
  | "coupBattle"
  | "dropSatisfaction"
  | "houseUnits"
  | "nation"
  | "nationUnits"
  | "npcHousesOf"
  | "payCoupCost"
  | "powerOf"
  | "ready"
  | "sendTroop"
  | "setRegime"
  | "unitMapOf"
  | "userTroops"
>;

export interface CoupDeps {
  readonly port: CoupPort;
  readonly store: Pick<GovernanceStore, "saveState" | "states">;
  readonly leader: Pick<LeaderStore, "houseHomes">;
  readonly coups: Pick<
    CoupStore,
    "coup" | "finishCoup" | "gathering" | "insertCoup" | "join" | "lastCoupOf" | "saveShareHouse" | "sides"
  >;
  readonly tools: Pick<ElectorateTools, "ruling">;
  readonly rules: () => GovernanceRules;
  readonly now: () => number;
  readonly standing: (userId: string) => Promise<Standing | undefined>;
  readonly audit: (userId: string | null, action: string, after: Record<string, unknown>) => Promise<void>;
  /** 쿠데타 신용(D-584). 없으면 신용을 바꾸지 않는다 */
  readonly credit?: CoupCredit | undefined;
}

const fail = (code: Extract<GovernanceResult, { ok: false }>["code"]): GovernanceResult => ({
  ok: false,
  code,
});

/** NPC 가문 하나의 쿠데타 점수(출마 점수와 같은 성향 규칙식 — D-323) */
const npcScore = (
  d: CoupDeps,
  nation: GovernanceNation,
  house: { readonly id: number; readonly cityId: number },
): number =>
  npcRunScore(
    {
      key: `n:${house.id}`,
      id: house.id,
      satisfaction: d.port.citySatisfaction(house.cityId),
      traits: nation.traits,
    },
    d.rules(),
  );

export function createCoupService(d: CoupDeps) {
  /** 쿠데타 전투 도시(쿠데타 줄 도시 — 옛 줄은 수도) */
  const battleCityOf = (coup: CoupRow, nation: GovernanceNation): number | undefined =>
    coup.cityId ?? d.port.capitalOf(nation);

  /** 쿠데타 도시 자리(파견 목표·도착 판정 — D-591) */
  const placeOf = (city: number | undefined) => (city === undefined ? undefined : d.port.cityPlace(city));
  /** 그 도시 2차맵에 도착해 있는 유닛만(D-591 — 순간이동 없음) */
  const here = (ids: readonly number[], city: number | undefined): number[] =>
    arrivedIn(d.port, [...new Set(ids)], placeOf(city));

  /** 정부군 유닛(지배 가문 유닛 + 그 도시 경비대) 가운데 그 도시에 도착해 있는 것(D-591) */
  const governmentUnits = (
    nation: GovernanceNation,
    ruling: HouseKey | null,
    city: number | undefined,
  ): number[] =>
    here([...(ruling ? d.port.houseUnits(nation, ruling) : []), ...d.port.cityGuards(nation, city)], city);

  /** 가문 자리 도시(NPC = 그 가문 도시, 플레이어 = 소속 도시 house_homes). 그 나라 도시가 아니면 undefined */
  const seatCityOf = async (nation: GovernanceNation, key: HouseKey): Promise<number | undefined> => {
    const id = Number(key.slice(2));
    const city = key.startsWith("n:")
      ? d.port.npcHousesOf(nation).find((house) => house.id === id)?.cityId
      : (await d.leader.houseHomes([id])).get(id);
    return city !== undefined && nation.cities.includes(city) ? city : undefined;
  };

  const cooledDown = async (key: HouseKey, nowMs: number): Promise<boolean> => {
    const last = await d.coups.lastCoupOf(key);
    return last === undefined || nowMs >= last + d.rules().coupCooldownMs;
  };

  /** 지배 가문이 바뀐 뒤 보호 기간인가(gov_coup_protect_ms — 2457, 출발값 0) */
  const protectedNow = (state: StateRow | undefined, nowMs: number): boolean => {
    const protect = d.rules().coupProtectMs;
    return (
      protect > 0 &&
      state?.electedAtMs !== null &&
      state?.electedAtMs !== undefined &&
      nowMs < state.electedAtMs + protect
    );
  };

  /** 쿠데타를 연다(플레이어·NPC 같은 길): 그 도시에서 참가 받기 */
  const open = async (
    nation: GovernanceNation,
    key: HouseKey,
    userId: string | null,
    city: number | undefined,
    nowMs: number,
  ): Promise<CoupRow> => {
    const coup = await d.coups.insertCoup({
      nationId: nation.rowId,
      houseKey: key,
      userId,
      openedAtMs: nowMs,
      gatherUntilMs: nowMs + d.rules().coupGatherMs,
      cityId: city ?? null,
    });
    if (userId) {
      // 일으킨 사람: 그 도시에 이미 있는 내 유닛만(보내지 않는다 — 더 보내려면 혁명군 참가로 고른다, D-591)
      const units = await dispatchTroops(d.port, userId, placeOf(city));
      await d.coups.join({
        coupId: coup.id,
        joinerKey: `u:${userId}`,
        userId,
        side: "rebel",
        power: d.port.powerOf(units, nowMs),
        joinedAtMs: nowMs,
        units,
      });
      d.credit?.joined(userId, nowMs);
    }
    await d.audit(userId, "governance.coup_started", {
      nationId: nation.rowId,
      coupId: coup.id,
      house: key,
      city: city ?? null,
    });
    return coup;
  };

  /** 플레이어 가문장이 일으킨다(gov_coup) — 어느 가문이든(D-585), 그 나라 어느 도시에서든(D-588 2492 가 — 없으면 가문 자리 도시 → 수도) */
  const launch = async (userId: string, cityId?: number): Promise<GovernanceResult> => {
    if (!d.port.ready()) return fail("busy");
    if (!d.rules().coupEnabled) return fail("coup_disabled");
    const s = await d.standing(userId);
    if (!s) return fail("no_nation");
    // 플레이어 가문 나라도 대상이다(2545 — 바뀜 gov-fix-2)
    if (s.ownHouse === null || s.ownHouse === s.ruling.key) return fail("not_eligible");
    if (cityId !== undefined && !s.nation.cities.includes(cityId)) return fail("invalid_choice");
    const city = cityId ?? (await seatCityOf(s.nation, s.ownHouse)) ?? d.port.capitalOf(s.nation);
    const nowMs = d.now();
    if ((await d.coups.gathering()).some((row) => row.nationId === s.nation.rowId)) return fail("coup_open");
    if (protectedNow(s.state, nowMs)) return fail("coup_protected");
    if (!(await cooledDown(s.ownHouse, nowMs))) return fail("coup_cooldown");
    const coup = await open(s.nation, s.ownHouse, userId, city, nowMs);
    return { ok: true, agendaId: coup.id, action: "coup_started" };
  };

  /** 누구나 편을 든다(gov_coup_join — D-583 2433 나 가). 병력 = 고른 내 유닛을 쿠데타 도시로 실제로 보낸다(D-591 — coupDispatch.ts) */
  const join = async (
    userId: string,
    coupId: number,
    side: CoupSide,
    unitIds?: readonly number[],
  ): Promise<GovernanceResult> => {
    if (!d.port.ready()) return fail("busy");
    const coup = await d.coups.coup(coupId);
    const nowMs = d.now();
    if (!coup || coup.status !== "gathering" || nowMs >= coup.gatherUntilMs) return fail("unknown_coup");
    // 일으킨 사람은 혁명군에서 빠질 수 없다
    if (coup.userId === userId && side !== "rebel") return fail("invalid_choice");
    const nation = d.port.nation(coup.nationId);
    const units = nation
      ? await dispatchTroops(d.port, userId, placeOf(battleCityOf(coup, nation)), unitIds)
      : [];
    const before = (await d.coups.sides(coupId)).find((row) => row.joinerKey === `u:${userId}`);
    await d.coups.join({
      coupId,
      joinerKey: `u:${userId}`,
      userId,
      side,
      power: d.port.powerOf(units, nowMs),
      joinedAtMs: nowMs,
      units,
    });
    if (side === "rebel" && before?.side !== "rebel") d.credit?.joined(userId, nowMs);
    return { ok: true, agendaId: coupId, action: "coup_joined" };
  };

  /** NPC 가문이 일으킨다(나라마다 많아야 하나 — 점수 높은 가문, 어느 가문이든 D-585). 그 가문 도시에서(D-588 2492 가), 힘 비 = 양쪽이 보낼 병력(2549) */
  const npcLaunch = async (
    nation: GovernanceNation,
    ruling: HouseKey | null,
    nowMs: number,
  ): Promise<void> => {
    const rules = d.rules();
    const picks: { key: HouseKey; id: number; city: number; score: number }[] = [];
    for (const house of d.port.npcHousesOf(nation)) {
      const key: HouseKey = `n:${house.id}`;
      if (key === ruling) continue;
      const score = npcScore(d, nation, house);
      if (score < rules.coupNpcScore) continue;
      const defense = d.port.powerOf(governmentUnits(nation, ruling, house.cityId), nowMs);
      const power = d.port.powerOf(here(d.port.houseUnits(nation, key), house.cityId), nowMs);
      if (power <= 0 || power * 1000 < defense * rules.coupNpcPowerPm) continue;
      if (!(await cooledDown(key, nowMs))) continue;
      picks.push({ key, id: house.id, city: house.cityId, score });
    }
    const best = picks.toSorted((a, b) => b.score - a.score || a.id - b.id)[0];
    if (best) await open(nation, best.key, null, best.city, nowMs);
  };

  /** NPC 가문이 편을 든다(성향 규칙식 — 가문원 가운데 그 도시에 있는 것, D-591) */
  const npcJoin = async (coup: CoupRow, nation: GovernanceNation, ruling: HouseKey | null, nowMs: number) => {
    const rules = d.rules();
    const city = battleCityOf(coup, nation);
    const joined = new Set((await d.coups.sides(coup.id)).map((row) => row.joinerKey));
    for (const house of d.port.npcHousesOf(nation)) {
      const key: HouseKey = `n:${house.id}`;
      if (key === coup.houseKey || key === ruling || joined.has(key)) continue;
      const score = npcScore(d, nation, house);
      const side: CoupSide | null =
        score >= rules.coupNpcScore ? "rebel" : score <= -rules.coupNpcScore ? "government" : null;
      if (!side) continue;
      await d.coups.join({
        coupId: coup.id,
        joinerKey: key,
        userId: null,
        side,
        power: d.port.powerOf(here(d.port.houseUnits(nation, key), city), nowMs),
        joinedAtMs: nowMs,
      });
    }
  };

  /** 쿠데타가 차지할 도시 = 싸운 도시(D-588 2492 가 — 시작 도시·수도도, 2542). 옛 나라 도시가 아니거나 모르면 undefined */
  const seizedCityOf = (coup: CoupRow, nation: GovernanceNation): number | undefined => {
    const city = coup.cityId ?? d.port.capitalOf(nation);
    return city !== undefined && nation.cities.includes(city) ? city : undefined;
  };

  /** 이긴 쿠데타: 싸운 도시만 새 독재 나라로(D-585·D-588, 2542 — 옛 나라 전체는 없다). 새 나라 소유 주체 ID(못 떼면 undefined) */
  const seize = async (
    coup: CoupRow,
    nation: GovernanceNation,
    nowMs: number,
    result: Record<string, unknown>,
  ): Promise<number | undefined> => {
    const rules = d.rules();
    const city = seizedCityOf(coup, nation);
    const child = city === undefined ? undefined : await d.port.cityIndependence(nation, city, nowMs, true);
    const target = child === undefined ? undefined : d.port.nation(child);
    result.city = city ?? null;
    result.newNationId = target?.rowId ?? null;
    if (!target) {
      result.seized = "0";
      result.reason = "no_split";
      return undefined;
    }
    await d.store.saveState(
      {
        nationId: target.rowId,
        rulingHouseKey: coup.houseKey,
        electedAtMs: nowMs,
        termEndsAtMs: null,
        shareVotesSuspended: false,
        vacantSinceMs: null,
        npcHeadUnit: null,
      },
      nowMs,
    );
    if (target.regime !== "dictatorship") d.port.setRegime(target, "dictatorship");
    const seized = d.port.confiscateToHouse(target, coup.houseKey, nowMs);
    await d.coups.saveShareHouse(
      { nationId: target.rowId, houseKey: coup.houseKey, treasuryKept: false },
      nowMs,
    );
    d.port.dropSatisfaction(d.port.nationUnits(target), rules.coupSatisfactionDrop);
    if (!target.playerHouse) d.port.applyRuling(target, coup.houseKey);
    result.seized = seized.toString();
    return target.ownerId;
  };

  /** 참가 받기가 끝난 쿠데타의 전투와 결과 */
  const resolve = async (
    coup: CoupRow,
    nation: GovernanceNation | undefined,
    state: StateRow | undefined,
    nowMs: number,
  ): Promise<void> => {
    if (!nation) {
      await d.coups.finishCoup(coup.id, "cancelled", { reason: "no_nation" }, nowMs);
      return;
    }
    const ruling = (await d.tools.ruling(nation, state)).key;
    if (ruling === coup.houseKey) {
      await d.coups.finishCoup(coup.id, "cancelled", { reason: "already_ruling" }, nowMs);
      await d.audit(coup.userId, "governance.coup_cancelled", { nationId: nation.rowId, coupId: coup.id });
      return;
    }
    const rules = d.rules();
    const sides = await d.coups.sides(coup.id);
    const city = battleCityOf(coup, nation);
    /** 참가 줄의 병력(보낸 것 — 도착 여부는 아래 here): 플레이어 = 보낸 유닛 가운데 아직 그 사람 것(옛 줄은 그 사람 유닛 모두), NPC 가문 = 가문원 */
    const unitsOf = (row: (typeof sides)[number]): readonly number[] => {
      if (row.joinerKey.startsWith("u:")) {
        const owned = d.port.userTroops(row.joinerKey.slice(2)).map((troop) => troop.id);
        if (row.units === null || row.units === undefined) return owned;
        const still = new Set(owned);
        return row.units.filter((id) => still.has(id));
      }
      return row.joinerKey.startsWith("n:")
        ? d.port.houseUnits(nation, `n:${Number(row.joinerKey.slice(2))}`)
        : [];
    };
    // 그 도시 2차맵에 도착한 유닛만 싸운다(D-591 — 순간이동 없음, 늦게 닿는 유닛은 빠진다 [임시 2652])
    const rebels = here(
      [
        ...d.port.houseUnits(nation, coup.houseKey),
        ...sides.filter((row) => row.side === "rebel").flatMap(unitsOf),
      ],
      city,
    );
    const loyal = [
      ...new Set([
        ...governmentUnits(nation, ruling, city),
        ...here(sides.filter((row) => row.side === "government").flatMap(unitsOf), city),
      ]),
    ];
    // 반란 전투 틀 빨리감기: 거울 세계 유닛 부상만, 포로 없음(내전 — 2456 가, D-099·D-187)
    const won = d.port.coupBattle(nation, rebels, loyal, nowMs, { unitsPerSide: rules.coupBattleUnits });
    const result: Record<string, unknown> = {
      ruling,
      battleCity: city ?? null,
      rebelUnits: rebels.length,
      governmentUnits: loyal.length,
      rebelPower: d.port.powerOf(rebels, nowMs),
      governmentPower: d.port.powerOf(loyal, nowMs),
      rebels: sides.filter((row) => row.side === "rebel").map((row) => row.joinerKey),
      government: sides.filter((row) => row.side === "government").map((row) => row.joinerKey),
    };
    let newNationOwner: number | undefined;
    if (won) newNationOwner = await seize(coup, nation, nowMs, result);
    else {
      const paid = d.port.payCoupCost(nation, coup.houseKey, rules.coupFailCost, nowMs);
      d.port.dropSatisfaction(d.port.houseUnits(nation, coup.houseKey), rules.coupFailSatisfactionDrop);
      result.paid = paid.toString();
    }
    // 이긴 편 플레이어 참가자 보상(공훈 = 나라 명성, 신용 = 새 나라 시작 가산). 병력 없이 편만 든 사람·병력이 전투 전에 닿지 못한 사람은 받지 않는다(2455, D-591)
    const winners = sides.filter(
      (row) =>
        row.side === (won ? "rebel" : "government") &&
        row.userId !== null &&
        (row.units === null || row.units === undefined || here(unitsOf(row), city).length > 0),
    );
    for (const row of winners) {
      if (row.userId === null) continue;
      d.port.addRenown(row.userId, nation.rowId, rules.coupMeritRenown, nowMs);
      if (rules.coupCreditReward > 0)
        d.credit?.won(row.userId, won ? newNationOwner : undefined, rules.coupCreditReward, nowMs);
    }
    result.rewarded = winners.length;
    await d.coups.finishCoup(coup.id, won ? "won" : "lost", result, nowMs);
    await d.audit(coup.userId, won ? "governance.coup_won" : "governance.coup_lost", {
      nationId: nation.rowId,
      coupId: coup.id,
      house: coup.houseKey,
      ...result,
    });
  };

  /** 틱: 끝난 참가 받기 → 전투, NPC 참가, NPC 일으키기 */
  const tick = async (
    nations: ReadonlyMap<number, GovernanceNation>,
    states: ReadonlyMap<number, StateRow>,
    nowMs: number,
  ): Promise<void> => {
    const gathering = await d.coups.gathering();
    for (const coup of gathering) {
      const nation = nations.get(coup.nationId);
      const state = states.get(coup.nationId);
      if (nowMs >= coup.gatherUntilMs) await resolve(coup, nation, state, nowMs);
      else if (nation) await npcJoin(coup, nation, (await d.tools.ruling(nation, state)).key, nowMs);
    }
    if (!d.rules().coupEnabled) return;
    const busy = new Set(gathering.map((row) => row.nationId));
    for (const nation of nations.values()) {
      if (busy.has(nation.rowId) || protectedNow(states.get(nation.rowId), nowMs)) continue;
      await npcLaunch(nation, (await d.tools.ruling(nation, states.get(nation.rowId))).key, nowMs);
    }
  };

  return { launch, join, tick };
}

export type CoupService = ReturnType<typeof createCoupService>;
