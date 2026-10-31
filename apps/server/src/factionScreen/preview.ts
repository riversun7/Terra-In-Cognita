// 세력 화면 시안 자료 — dev·admin이 화면을 볼 때 쓰는 보기 전용 자료(ADR 37 6절 "시안 자료", D-439). 판정·잔고·소유에 쓰지 않는다.
// 권한 home: preview(dev·admin)를 프로시저가 확인한 뒤에만 부른다. 플레이어에게는 늘 실제 자료만 보인다.
// - 기획 46의 예시를 따라 한 장면을 만든다: 자본주의 나라 Solace(도시 4, 하나는 막 점령), 동맹 Kestrel League(민주주의),
//   전쟁 상대 Tidecrown, 명분 없이 선포한 Ashen Pact, 고정 NPC 국가 Hanul. 모든 칸(체제·투표·지분·독립 투표·점령 처리 다섯)과
//   민심 네 단계(안정·태업 조짐·반란 예고·반란 중, D-443)가 보이게 한다.
// - 이름은 사람이 지은 이름이라 두 언어에서 같은 글자다(D-6046). ID는 preview_로 시작한다(실제 ID와 겹치지 않게).
// - 시각은 지금(now) 기준이다: 지난 일은 과거, 마감·공성은 미래. 방어 시각 기한 = 공성 선포 + 24시간(D-200).
// - 공물·민심 문턱은 실제 화면과 같은 팩 설정값(tuning.ts, S33·S26·N35)을 쓴다. 인구·만족도·금액 같은 수는 화면을 채우려는
//   값이다(규칙 값 아님).
// - 복원 모금의 받을 지분은 규칙 함수(@terra/sim allocateShares, 가장 큰 나머지)로 계산한다. 배당은 지분 비례 내림(D-304,
//   sim payCityProfit와 같은 셈).
import {
  type CityRow,
  type CityShareRow,
  DIVIDEND_BY_REGIME,
  type DiplomacyRow,
  type FactionRef,
  type FactionSummary,
  INDEPENDENCE_BY_REGIME,
  type OccupationRow,
  type RegimeView,
  SHARES_PER_CITY,
  SIEGE_DEFENSE_WINDOW_MS,
  VOTING_RULES,
  type WarRow,
  relationBand,
  unrestLevel,
} from "@terra/shared/faction";
import { allocateShares } from "@terra/sim";
import type { FactionScreenRules } from "./tuning.ts";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 시안 장면의 세력들 */
export const PREVIEW_FACTIONS = {
  solace: { id: "preview_faction_solace", name: "Solace", tag: "SOL", kind: "player" },
  kestrel: { id: "preview_faction_kestrel", name: "Kestrel League", tag: "KSL", kind: "player" },
  tidecrown: { id: "preview_faction_tidecrown", name: "Tidecrown", tag: "TDC", kind: "player" },
  ashen: { id: "preview_faction_ashen", name: "Ashen Pact", tag: "ASH", kind: "player" },
  hanul: { id: "preview_faction_hanul", name: "Hanul", tag: "HNL", kind: "npc" },
  driftwood: { id: "preview_faction_driftwood", name: "Driftwood", tag: "DRW", kind: "player" },
} as const satisfies Record<string, FactionRef>;

const SOL_CURRENCY = { code: "preview_sol_mark", name: "Sol" };

/** 내 세력 요약(나라 Solace, 내 가문 Beacon) */
export function previewFaction(now: number, rules: FactionScreenRules): FactionSummary {
  return {
    ...PREVIEW_FACTIONS.solace,
    stage: "nation",
    regime: "capitalism",
    fixed: false,
    leader: "Aster",
    memberCount: 14,
    cityCount: 4,
    joinedAt: now - 23 * DAY,
    family: { name: "Beacon", memberCount: 3, head: true },
    overlord: null,
    vassals: [{ faction: PREVIEW_FACTIONS.driftwood, tributePm: rules.tributePm }],
    currency: { code: SOL_CURRENCY.code, name: SOL_CURRENCY.name, issued: "4800000" },
    treasury: [{ asset: SOL_CURRENCY.code, name: SOL_CURRENCY.name, amount: "1250000" }],
    preview: true,
  };
}

type CityInput = Omit<CityRow, "unrest" | "rebellionThreshold" | "rebellionWarning">;

/** 도시 한 줄: 민심 단계는 만족도와 민심 표 문턱(팩 S26·N35, tuning.ts)에서 정한다 */
function city(row: CityInput, rules: FactionScreenRules): CityRow {
  return {
    ...row,
    rebellionThreshold: rules.unrest.rebellionThreshold,
    rebellionWarning: rules.unrest.warningAt,
    unrest: unrestLevel(row.satisfaction, rules.unrest),
  };
}

/** 발전도 7요소 내역(D-254, 가중치를 곱한 점수). 합이 발전도다 */
function parts(
  population: number,
  buildings: number,
  economy: number,
  cultureFaith: number,
  education: number,
  health: number,
  environment: number,
): NonNullable<CityRow["developmentParts"]> {
  return {
    population,
    buildings,
    economy,
    culture_faith: cultureFaith,
    education,
    health,
    environment,
  };
}

/** 외교 한 줄: 띠는 점수에서 정한다 */
function relation(r: Omit<DiplomacyRow, "band">): DiplomacyRow {
  return { ...r, band: relationBand(r.score) };
}

/** 도시 넷: 안정·반란 예고·반란 중(막 점령)·태업 조짐(팩 출발값 문턱 40·50·60 기준) */
export function previewCities(rules: FactionScreenRules): CityRow[] {
  const rows: CityInput[] = [
    {
      id: "preview_city_nova",
      name: "Nova",
      mayor: "Mora",
      actingDeputy: null,
      population: 128,
      satisfaction: 72,
      development: 340,
      developmentParts: parts(96, 72, 70, 30, 28, 26, 18),
      taxRatePm: 80,
      policy: "growth",
      dailyBudget: "20000",
      startCity: false,
      occupied: false,
    },
    {
      id: "preview_city_vega",
      name: "Vega",
      mayor: null,
      actingDeputy: "Pell",
      population: 64,
      satisfaction: 46,
      development: 180,
      developmentParts: parts(48, 40, 34, 18, 14, 16, 10),
      taxRatePm: 120,
      policy: "defense",
      dailyBudget: "8000",
      startCity: false,
      occupied: false,
    },
    {
      id: "preview_city_sandport",
      name: "Sandport",
      mayor: null,
      actingDeputy: null,
      population: 41,
      satisfaction: 31,
      development: 95,
      developmentParts: parts(30, 22, 18, 8, 6, 7, 4),
      taxRatePm: 60,
      policy: "balance",
      dailyBudget: "3000",
      startCity: false,
      occupied: true,
    },
    {
      id: "preview_city_millbrook",
      name: "Millbrook",
      mayor: "Juniper",
      actingDeputy: null,
      population: 52,
      satisfaction: 56,
      development: 150,
      developmentParts: parts(40, 30, 32, 14, 12, 12, 10),
      taxRatePm: 100,
      policy: "production",
      dailyBudget: "6000",
      startCity: false,
      occupied: false,
    },
  ];
  return rows.map((row) => city(row, rules));
}

/** 외교 표: 동맹·적대(전쟁)·고정 NPC 이웃·명분 없이 선포한 세력 */
export function previewDiplomacy(now: number): DiplomacyRow[] {
  return [
    relation({
      faction: PREVIEW_FACTIONS.kestrel,
      score: 64,
      trust: 70,
      state: "alliance",
      fixed: false,
      treaties: [
        {
          id: "preview_treaty_1",
          kind: "alliance",
          since: now - 12 * DAY,
          expiresAt: null,
          terms: { autoJoin: 1 },
        },
        { id: "preview_treaty_2", kind: "vision_share", since: now - 12 * DAY, expiresAt: null, terms: {} },
        {
          id: "preview_treaty_3",
          kind: "trade",
          since: now - 20 * DAY,
          expiresAt: null,
          terms: { tariffFromPm: 100, tariffToPm: 30 },
        },
      ],
    }),
    relation({
      faction: PREVIEW_FACTIONS.hanul,
      score: 12,
      trust: 35,
      state: "neutral",
      fixed: true,
      treaties: [
        {
          id: "preview_treaty_4",
          kind: "non_aggression",
          since: now - 5 * DAY,
          expiresAt: now + 9 * DAY,
          terms: {},
        },
      ],
    }),
    relation({
      faction: PREVIEW_FACTIONS.ashen,
      score: -41,
      trust: -20,
      state: "war",
      fixed: false,
      treaties: [],
    }),
    relation({
      faction: PREVIEW_FACTIONS.tidecrown,
      score: -72,
      trust: -55,
      state: "war",
      fixed: false,
      treaties: [],
    }),
  ];
}

/**
 * 전쟁 둘: 우리가 약탈 보복으로 선포하고 Saltmarsh에 공성 선포(남쪽 변, 상대가 시각을 골랐다, 동맹 합류),
 * 상대가 명분 없이 선포하고 Vega에 공성 선포(동쪽 변, 방어 시각을 고를 기한 = 공성 선포 + 24시간 D-200)
 */
export function previewWars(now: number): WarRow[] {
  const vegaSiegeDeclared = now - 2 * HOUR;
  return [
    {
      id: "preview_war_1",
      opponent: PREVIEW_FACTIONS.tidecrown,
      attacker: true,
      casusBelli: "raid_retaliation",
      declaredAt: now - 2 * DAY,
      stage: "siege_scheduled",
      targetCity: "Saltmarsh",
      siegeDeclaredAt: now - 5 * HOUR,
      attackSide: "south",
      // 방어자가 고른 시각: 공성 선포 뒤 23시간(기한 24시간 안)
      siegeAt: now + 18 * HOUR,
      deadlineAt: null,
      allies: [PREVIEW_FACTIONS.kestrel],
    },
    {
      id: "preview_war_2",
      opponent: PREVIEW_FACTIONS.ashen,
      attacker: false,
      casusBelli: "none",
      declaredAt: now - 3 * HOUR,
      stage: "defense_time_pending",
      targetCity: "Vega",
      siegeDeclaredAt: vegaSiegeDeclared,
      attackSide: "east",
      siegeAt: null,
      deadlineAt: vegaSiegeDeclared + SIEGE_DEFENSE_WINDOW_MS,
      allies: [],
    },
  ];
}

/** 정권·투표: 자본주의(지분만큼 표). 급한 강화 안건, 세율 안건(내 표 반대), 시장 임명 안건(C4), 끝난 종속국 받기 */
export function previewRegime(now: number): RegimeView {
  return {
    regime: "capitalism",
    rule: VOTING_RULES.capitalism,
    leader: "Aster",
    votes: [
      {
        id: "preview_vote_1",
        agenda: "accept_peace",
        params: { faction: PREVIEW_FACTIONS.tidecrown.name },
        opensAt: now - 1 * HOUR,
        closesAt: now + 3 * HOUR,
        urgent: true,
        quorumPm: 500,
        yesPm: 380,
        noPm: 120,
        myVote: null,
        result: null,
      },
      {
        id: "preview_vote_2",
        agenda: "tax_change",
        params: { city: "Nova", fromPm: 80, toPm: 120 },
        opensAt: now - 1 * DAY,
        closesAt: now + 2 * DAY,
        urgent: false,
        quorumPm: 400,
        yesPm: 220,
        noPm: 300,
        myVote: "no",
        result: null,
      },
      {
        id: "preview_vote_4",
        agenda: "mayor_appointment",
        params: { city: "Vega", candidate: "Pell" },
        opensAt: now - 5 * HOUR,
        closesAt: now + 1 * DAY,
        urgent: false,
        quorumPm: 400,
        yesPm: 290,
        noPm: 40,
        myVote: "yes",
        result: null,
      },
      {
        id: "preview_vote_3",
        agenda: "accept_vassal",
        params: { faction: PREVIEW_FACTIONS.driftwood.name },
        opensAt: now - 6 * DAY,
        closesAt: now - 4 * DAY,
        urgent: false,
        quorumPm: 400,
        yesPm: 610,
        noPm: 90,
        myVote: "yes",
        result: "passed",
      },
    ],
  };
}

/** 지분 비례 내림(D-304 "남은 이익을 지분대로", 규칙 sim payDividends와 같은 셈) */
function shareOf(total: bigint, shares: number): string {
  return ((total * BigInt(shares)) / BigInt(SHARES_PER_CITY)).toString();
}

/** 최근 배당 한 번(지분대로 나누는 도시만. 남은 이익 total을 지분대로) */
function lastDividend(now: number, daysAgo: number, total: bigint, myShares: number) {
  return {
    paidAt: now - daysAgo * DAY,
    mine: shareOf(total, myShares),
    total: total.toString(),
    currency: SOL_CURRENCY.name,
  };
}

/**
 * 도시 지분: 우리 나라 상장 둘(하나는 독립 투표 중), 막 점령해 주식을 고르는 중인 도시 하나,
 * 동맹 Kestrel League(민주주의)의 도시 하나(남은 이익은 국고로 가서 배당 없음, D-304)
 */
export function previewShares(now: number): CityShareRow[] {
  const path = INDEPENDENCE_BY_REGIME.capitalism;
  const ours = DIVIDEND_BY_REGIME.capitalism;
  return [
    {
      cityId: "preview_city_nova",
      cityName: "Nova",
      owner: PREVIEW_FACTIONS.solace,
      listed: true,
      myShares: 180,
      top: { holder: "Beacon", shares: 410 },
      path,
      dividend: { to: ours, last: lastDividend(now, 3, 36_000n, 180) },
      independenceVote: null,
    },
    {
      cityId: "preview_city_vega",
      cityName: "Vega",
      owner: PREVIEW_FACTIONS.solace,
      listed: true,
      myShares: 0,
      top: { holder: "Driftwood", shares: 230 },
      path,
      dividend: { to: ours, last: lastDividend(now, 3, 9_500n, 0) },
      independenceVote: { openedBy: "Driftwood", yesPm: 310, thresholdPm: 500, closesAt: now + 1 * DAY },
    },
    {
      cityId: "preview_city_sandport",
      cityName: "Sandport",
      owner: PREVIEW_FACTIONS.solace,
      listed: true,
      myShares: 0,
      // 주식을 고르기 전: 옛 통치자 지분이 그대로다(지분 유지를 고르면 국고로 몰수, 46 §5.1 ③). 점령 뒤 배당은 아직 없다
      top: { holder: PREVIEW_FACTIONS.tidecrown.name, shares: SHARES_PER_CITY - 480 },
      path,
      dividend: { to: ours, last: null },
      independenceVote: null,
    },
    {
      cityId: "preview_city_larkspur",
      cityName: "Larkspur",
      owner: PREVIEW_FACTIONS.kestrel,
      listed: true,
      myShares: 40,
      top: { holder: "Rook", shares: 120 },
      path: INDEPENDENCE_BY_REGIME.democracy,
      dividend: { to: DIVIDEND_BY_REGIME.democracy, last: null },
      independenceVote: null,
    },
  ];
}

/** 복원 모금: 목표를 채우면 내가 받을 지분(내 돈 / 목표 비율, 가장 큰 나머지 — 규칙 allocateShares) */
function restoration(raised: bigint, goal: bigint, mine: bigint): NonNullable<OccupationRow["restoration"]> {
  const others = goal > mine ? goal - mine : 0n;
  const allocation = allocateShares(
    [
      { owner: 1, amount: mine },
      { owner: 2, amount: others },
    ],
    BigInt(SHARES_PER_CITY),
  );
  const expected = allocation.find((entry) => entry.owner === 1)?.amount ?? 0n;
  return {
    raised: raised.toString(),
    goal: goal.toString(),
    currency: SOL_CURRENCY.name,
    mine: mine.toString(),
    expectedShares: Number(expected),
  };
}

/** 점령 처리: 우리가 점령한 Sandport(주식·편입 제안·모금 진행), 내 건물이 있는 Cinderfall을 Ashen Pact가 점령(나에게 온 제안) */
export function previewOccupations(now: number): OccupationRow[] {
  return [
    {
      id: "preview_occupation_1",
      side: "as_occupier",
      cityName: "Sandport",
      other: PREVIEW_FACTIONS.tidecrown,
      occurredAt: now - 6 * HOUR,
      steps: {
        loot_or_integrate: "done",
        regime: "done",
        shares: "pending",
        incorporation: "pending",
        restoration: "pending",
      },
      lootChoice: "integrate",
      shareChoice: null,
      offers: { deadlineAt: now + 3 * DAY, accepted: 2, refused: 1, pending: 2, mine: null, myBuildings: 0 },
      restoration: restoration(42_000n, 120_000n, 6_000n),
    },
    {
      id: "preview_occupation_2",
      side: "offer_to_me",
      cityName: "Cinderfall",
      other: PREVIEW_FACTIONS.ashen,
      occurredAt: now - 50 * MINUTE,
      steps: {
        loot_or_integrate: "done",
        regime: "done",
        shares: "done",
        incorporation: "pending",
        restoration: "skipped",
      },
      lootChoice: "loot",
      shareChoice: "keep",
      offers: {
        deadlineAt: now + 2 * DAY + 20 * HOUR,
        accepted: 0,
        refused: 0,
        pending: 0,
        mine: "pending",
        myBuildings: 2,
      },
      restoration: null,
    },
  ];
}
