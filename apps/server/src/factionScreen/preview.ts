// 세력 화면 시안 자료 — dev·admin이 화면을 볼 때 쓰는 보기 전용 자료(ADR 37 6절 "시안 자료", D-439). 판정·잔고·소유에 쓰지 않는다.
// 권한 home: preview(dev·admin)를 프로시저가 확인한 뒤에만 부른다. 플레이어에게는 늘 실제 자료만 보인다.
// - 기획 46의 예시를 따라 한 장면을 만든다: 자본주의 나라 Solace(도시 3, 하나는 막 점령), 동맹 Kestrel League, 전쟁 상대
//   Tidecrown, 명분 없이 선포한 Ashen Pact, 고정 NPC 국가 Hanul. 모든 칸(체제·투표·지분·독립 투표·점령 처리 다섯)이 보이게 한다.
// - 이름은 사람이 지은 이름이라 두 언어에서 같은 글자다(D-6046). ID는 preview_로 시작한다(실제 ID와 겹치지 않게).
// - 시각은 지금(now) 기준이다: 지난 일은 과거, 마감·공성은 미래.
// - 수치([임시] 공물 10%·태업 문턱 등)는 화면을 채우려는 값이다. 규칙 값이 아니다.
import {
  type CityRow,
  type CityShareRow,
  type DiplomacyRow,
  type FactionRef,
  type FactionSummary,
  INDEPENDENCE_BY_REGIME,
  type OccupationRow,
  REBELLION_THRESHOLD_EXAMPLE,
  type RegimeView,
  SHARES_PER_CITY,
  VOTING_RULES,
  type WarRow,
  relationBand,
  unrestLevel,
} from "@terra/shared/faction";

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
export function previewFaction(now: number): FactionSummary {
  return {
    ...PREVIEW_FACTIONS.solace,
    stage: "nation",
    regime: "capitalism",
    leader: "Aster",
    memberCount: 14,
    cityCount: 3,
    joinedAt: now - 23 * DAY,
    family: { name: "Beacon", memberCount: 3, head: true },
    overlord: null,
    vassals: [{ faction: PREVIEW_FACTIONS.driftwood, tributePm: 100 }],
    currency: { code: SOL_CURRENCY.code, name: SOL_CURRENCY.name, issued: "4800000" },
    treasury: [{ asset: SOL_CURRENCY.code, name: SOL_CURRENCY.name, amount: "1250000" }],
    preview: true,
  };
}

/** 도시 한 줄: 민심 단계는 만족도와 반란 문턱(S26 예시)에서 정한다 */
function city(row: Omit<CityRow, "unrest" | "rebellionThreshold">): CityRow {
  return {
    ...row,
    rebellionThreshold: REBELLION_THRESHOLD_EXAMPLE,
    unrest: unrestLevel(row.satisfaction, REBELLION_THRESHOLD_EXAMPLE),
  };
}

/** 외교 한 줄: 띠는 점수에서 정한다 */
function relation(r: Omit<DiplomacyRow, "band">): DiplomacyRow {
  return { ...r, band: relationBand(r.score) };
}

/** 도시 셋: 안정·태업·반란 문턱 아래(막 점령) */
export function previewCities(): CityRow[] {
  return [
    city({
      id: "preview_city_nova",
      name: "Nova",
      mayor: "Mora",
      actingDeputy: null,
      population: 128,
      satisfaction: 72,
      development: 340,
      taxRatePm: 80,
      policy: "growth",
      dailyBudget: "20000",
      startCity: false,
      occupied: false,
    }),
    city({
      id: "preview_city_vega",
      name: "Vega",
      mayor: null,
      actingDeputy: "Pell",
      population: 64,
      satisfaction: 46,
      development: 180,
      taxRatePm: 120,
      policy: "defense",
      dailyBudget: "8000",
      startCity: false,
      occupied: false,
    }),
    city({
      id: "preview_city_sandport",
      name: "Sandport",
      mayor: null,
      actingDeputy: null,
      population: 41,
      satisfaction: 31,
      development: 95,
      taxRatePm: 60,
      policy: "balance",
      dailyBudget: "3000",
      startCity: false,
      occupied: true,
    }),
  ];
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

/** 전쟁 둘: 우리가 약탈 보복으로 선포(공성 시각 정함, 동맹 합류), 상대가 명분 없이 선포(방어 시각을 고를 기한) */
export function previewWars(now: number): WarRow[] {
  return [
    {
      id: "preview_war_1",
      opponent: PREVIEW_FACTIONS.tidecrown,
      attacker: true,
      casusBelli: "raid_retaliation",
      declaredAt: now - 2 * DAY,
      stage: "siege_scheduled",
      targetCity: "Saltmarsh",
      siegeAt: now + 20 * HOUR,
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
      siegeAt: null,
      deadlineAt: now + 26 * HOUR,
      allies: [],
    },
  ];
}

/** 정권·투표: 자본주의(지분만큼 표). 급한 강화 안건, 세율 안건(내 표 반대), 끝난 종속국 받기 */
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

/** 도시 지분: 상장 둘(하나는 독립 투표 중), 막 점령해 주식을 고르는 중인 도시 하나 */
export function previewShares(now: number): CityShareRow[] {
  const path = INDEPENDENCE_BY_REGIME.capitalism;
  return [
    {
      cityId: "preview_city_nova",
      cityName: "Nova",
      listed: true,
      myShares: 180,
      top: { holder: "Beacon", shares: 410 },
      path,
      independenceVote: null,
    },
    {
      cityId: "preview_city_vega",
      cityName: "Vega",
      listed: true,
      myShares: 0,
      top: { holder: "Driftwood", shares: 230 },
      path,
      independenceVote: { openedBy: "Driftwood", yesPm: 310, thresholdPm: 500, closesAt: now + 1 * DAY },
    },
    {
      cityId: "preview_city_sandport",
      cityName: "Sandport",
      listed: true,
      myShares: 0,
      // 주식을 고르기 전: 옛 통치자 지분이 그대로다(지분 유지를 고르면 국고로 몰수, 46 §5.1 ③)
      top: { holder: PREVIEW_FACTIONS.tidecrown.name, shares: SHARES_PER_CITY - 480 },
      path,
      independenceVote: null,
    },
  ];
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
      restoration: { raised: "42000", goal: "120000", currency: SOL_CURRENCY.name },
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
