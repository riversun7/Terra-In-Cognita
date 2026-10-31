// 세력 화면(/faction) 전송 타입·고정 목록 — 기획 46(세력·사회), D-439(세력 화면은 기술이 46 규칙으로 먼저 만들고 기획이 고친다).
// 진입점은 @terra/shared/faction이다. 첫 화면 묶음에 들어가지 않게 index.ts에서 내보내지 않는다(ADR 37 11절).
// - 실제 자료(소유 주체·세력 소속·원장 잔고)와 시안 자료가 같은 모양이다. 규칙 세션(R4b)이 도시·외교·전쟁 자료를 만들면
//   서버가 같은 모양으로 갈아 끼운다(기기는 그대로).
// - 판정은 서버가 한다. 띠 이름·민심 단계·잠금 결과도 서버가 정해 보낸다. 기기는 그리기만 한다.
// - 시안 자료(preview)는 보기 전용이다. 판정·잔고·소유에 쓰지 않는다(D-439, 서버 권위).
// [임시] 표시가 있는 값은 기획에 값이 없어 기술이 정한 기본안이다(docs/questions/2026-10-31-ui-faction-mail.md, 질문 153~162).
// 기획 답 D-443(2026-10-31)이 기본안(가)을 받았다. 수치는 설정값(49)이고, 값이 없는 것만 [임시]로 남긴다.

/** 사람이 지은 이름이 아닌 것(아이템 등)의 두 언어 이름 — 콘텐츠 팩 이름과 같은 모양 */
export interface LocalizedName {
  readonly ko: string;
  readonly en: string;
}

/** 정권 체제(46 §1.3, D-217) */
export const REGIMES = ["dictatorship", "democracy", "capitalism"] as const;
export type Regime = (typeof REGIMES)[number];

/** 체제마다 정하는 방식(46 §1.3): 독재 = 장 혼자, 민주주의 = 가문마다 한 표, 자본주의 = 지분만큼 */
export const VOTING_RULES = {
  dictatorship: "leader",
  democracy: "per_family",
  capitalism: "by_shares",
} as const satisfies Record<Regime, string>;
export type VotingRule = (typeof VOTING_RULES)[Regime];

/** 세력의 단계(D-213, D-5055). 등급이 아니라 부르는 이름이다: 개인 → 가문·세력(도시 없음) → 국가(도시 1개 이상) */
export const FACTION_STAGES = ["individual", "faction", "nation"] as const;
export type FactionStage = (typeof FACTION_STAGES)[number];

/** 세력 종류(DB factions.kind) */
export type FactionKind = "npc" | "player";

/** 공식 상태 3가지(46 §4.1). 기본은 중립 */
export const OFFICIAL_STATES = ["alliance", "neutral", "war"] as const;
export type OfficialState = (typeof OFFICIAL_STATES)[number];

/** 조약 카드(46 §4.1 + D-5060 확정 넷). 🟡 후보 카드는 넣지 않는다 */
export const TREATY_KINDS = [
  "trade",
  "non_aggression",
  "alliance",
  "protection",
  "territory_transfer",
  "ceasefire",
  "vision_share",
  "military_access",
  "joint_purification",
  "exchange",
] as const;
export type TreatyKind = (typeof TREATY_KINDS)[number];

/** 조약 카드마다 정하는 칸(D-444 167, 데이터) */
export interface TreatyCardRule {
  /** 독재가 아닌 나라에서 투표 안건이다(D-5057). false면 지도자가 바로 맺는다(D-221 일상 결정) */
  readonly needsVote: boolean;
  /** 짧은 투표(급한 안건, VoteRow.urgent. 휴전·강화 — D-5057 "급한 전쟁·강화 안건은 짧게") */
  readonly shortVote: boolean;
}

/**
 * 조약 카드 기본값(D-444 167): 동맹·보호·속국(protection 카드가 보호·속국)·영토 이전·휴전·강화(ceasefire 카드가 휴전·강화) =
 * 투표, 휴전·강화는 짧은 투표. 교역 협정·불가침·시야·핀 공유·군대 통행권·공동 정화·교환 = 지도자가 바로 맺음
 */
export const TREATY_CARD_RULES = {
  trade: { needsVote: false, shortVote: false },
  non_aggression: { needsVote: false, shortVote: false },
  alliance: { needsVote: true, shortVote: false },
  protection: { needsVote: true, shortVote: false },
  territory_transfer: { needsVote: true, shortVote: false },
  ceasefire: { needsVote: true, shortVote: true },
  vision_share: { needsVote: false, shortVote: false },
  military_access: { needsVote: false, shortVote: false },
  joint_purification: { needsVote: false, shortVote: false },
  exchange: { needsVote: false, shortVote: false },
} as const satisfies Record<TreatyKind, TreatyCardRule>;

/** 조약을 맺는 길: 투표(vote) · 짧은 투표(short_vote) · 지도자가 바로(leader) */
export type TreatyDecision = "vote" | "short_vote" | "leader";

/**
 * 그 체제에서 조약 카드를 맺는 길(D-444 167). 독재는 투표가 없다(D-217). 체제를 모르면(null) 투표 쪽으로 본다
 * (바로 맺는 것처럼 보이지 않게)
 */
export function treatyDecision(kind: TreatyKind, regime: Regime | null): TreatyDecision {
  const rule: TreatyCardRule = TREATY_CARD_RULES[kind];
  if (regime === "dictatorship" || !rule.needsVote) return "leader";
  return rule.shortVote ? "short_vote" : "vote";
}

/** 선전포고 명분(46 §4.2). none = 명분 없음(관계 점수 크게 하락 + 국고 비용, S3) */
export const CASUS_BELLI = [
  "territory_dispute",
  "raid_retaliation",
  "liberation",
  "suzerainty",
  "sanction",
  "none",
] as const;
export type CasusBelli = (typeof CASUS_BELLI)[number];

/**
 * 투표 안건(D-5057). 목록은 열려 있다(데이터로 더한다). 시장 임명은 독재가 아니면 투표 안건이다
 * (46 §2.1 해석, 기획 세력 화면 검토 C4, 2026-11-01)
 */
export const AGENDA_KINDS = [
  "leader_election",
  "leader_removal",
  "regime_change",
  "declare_war",
  "accept_peace",
  "alliance_treaty",
  "protection_treaty",
  "currency_stage",
  "tax_change",
  "bond_issue",
  "city_sale",
  "independence",
  "accept_vassal",
  "mayor_appointment",
] as const;
export type AgendaKind = (typeof AGENDA_KINDS)[number];

/**
 * 관계 점수(호감) 띠 6단계(46 §4.1, 질문 154 기본안 → D-443). 이름은 적대·경고·보통·호감·우호·굳건이다. 옛 6단계
 * (동맹·우호·중립·경고·적대·전쟁)는 동맹·중립·전쟁이 공식 상태(D-255)와 겹쳐 쓰지 않는다. 문턱은 기본안 값이다(설정값).
 * 호감은 세력 쌍마다, 세력 신뢰는 세력마다 하나이고 모두가 본다(D-255, D-443 해석). 개인 신뢰도(D-315)와 다른 값이다.
 * 점수는 −100~100. 줄마다 [띠, 이 점수 이상]이고 위에서부터 맞는 첫 줄이다
 */
export const RELATION_BANDS = ["hostile", "wary", "neutral", "cordial", "friendly", "trusted"] as const;
export type RelationBand = (typeof RELATION_BANDS)[number];
export const RELATION_SCORE_MIN = -100;
export const RELATION_SCORE_MAX = 100;
const RELATION_FLOORS: readonly (readonly [RelationBand, number])[] = [
  ["trusted", 80],
  ["friendly", 50],
  ["cordial", 20],
  ["neutral", -19],
  ["wary", -59],
  ["hostile", RELATION_SCORE_MIN],
];

/** 관계 점수 → 띠(서버가 보낼 때 쓴다). 범위 밖은 끝으로 자른다 */
export function relationBand(score: number): RelationBand {
  const clamped = Math.max(RELATION_SCORE_MIN, Math.min(RELATION_SCORE_MAX, Math.trunc(score)));
  for (const [band, floor] of RELATION_FLOORS) if (clamped >= floor) return band;
  return "hostile";
}

/**
 * 도시 민심 단계(46 §2.4, 질문 155 → D-443): 안정 · 태업 조짐 · 반란 예고(반란 문턱 바로 위 구간) · 반란 중.
 * 반란 문턱(S26) 이하는 이미 반란이 일어나는 상태다(D-253). 이름·문턱은 규칙 @terra/sim `unrestBand`와 같다
 * (stable·sabotage·warning·rebellion). 기기는 sim을 가져오지 않으므로 같은 셈을 여기에 둔다(서버 시험이 같은지 본다)
 */
export const UNREST_LEVELS = ["stable", "sabotage", "warning", "rebellion"] as const;
export type UnrestLevel = (typeof UNREST_LEVELS)[number];
/** 반란 문턱 예시값(S26 "예시 40") */
export const REBELLION_THRESHOLD_EXAMPLE = 40;

/** 민심 표 문턱(설정값: 반란 S26, 예고·태업 N35 — 팩 tuning). 셋 다 "이 값 이하"다. 서버가 팩 값을 넘긴다 */
export interface UnrestBands {
  /** 반란 문턱(S26 `s26_rebellion`): 도시 평균 만족도가 이 값 이하면 반란 중 */
  readonly rebellionThreshold: number;
  /** 반란 예고 문턱(N35 `n35_rebellion_warning`): 이 값 이하면 반란 예고 */
  readonly warningAt: number;
  /** 태업 조짐 문턱(N35 `n35_sabotage`): 이 값 이하면 태업 조짐 */
  readonly sabotageAt: number;
}

/** 만족도(0~100) → 민심 단계. 반란 문턱 이하 = 반란 중, 예고 문턱 이하 = 반란 예고, 태업 문턱 이하 = 태업 조짐 */
export function unrestLevel(satisfaction: number, bands: UnrestBands): UnrestLevel {
  if (satisfaction <= bands.rebellionThreshold) return "rebellion";
  if (satisfaction <= bands.warningAt) return "warning";
  return satisfaction <= bands.sabotageAt ? "sabotage" : "stable";
}

/** 도시 발전도 7요소(D-254). 발전도 = Σ(요소 점수 × 가중치), 가중치는 설정값 */
export const DEVELOPMENT_FACTORS = [
  "population",
  "buildings",
  "economy",
  "culture_faith",
  "education",
  "health",
  "environment",
] as const;
export type DevelopmentFactor = (typeof DEVELOPMENT_FACTORS)[number];

/** 시장·관리인 자동 운영 방침(D-5062) */
export const CITY_POLICIES = ["growth", "defense", "production", "balance"] as const;
export type CityPolicy = (typeof CITY_POLICIES)[number];

/** 잠긴 메뉴(D-5055, S32): 기능마다 조건 목록. 조건 값은 설정값이다(질문 156 → D-443) */
export const LOCKABLE_FEATURES = ["currency_issue", "tax_rate", "national_bond"] as const;
export type LockableFeature = (typeof LOCKABLE_FEATURES)[number];
/** 조건 종류. 신용도 조건은 값이 정해지면 더한다(질문 156) */
export type LockRequirementKind = "cities_min";

/** 도시 주식 수(D-130) */
export const SHARES_PER_CITY = 1000;

/** 도시가 독립하는 길(46 §3.2). none_start_city = 기본 NPC 국가의 시작 도시(독립 투표 없음, D-341) */
export const INDEPENDENCE_PATHS = ["share_vote", "family_vote", "rebellion_only", "none_start_city"] as const;
export type IndependencePath = (typeof INDEPENDENCE_PATHS)[number];

/** 체제 → 그 나라 도시의 독립 길(46 §3.2). 시작 도시는 따로 none_start_city */
export const INDEPENDENCE_BY_REGIME = {
  capitalism: "share_vote",
  democracy: "family_vote",
  dictatorship: "rebellion_only",
} as const satisfies Record<Regime, IndependencePath>;

/** 점령 처리 다섯(46 §5.1). 차례도 이 순서다 */
export const OCCUPATION_STEPS = [
  "loot_or_integrate",
  "regime",
  "shares",
  "incorporation",
  "restoration",
] as const;
export type OccupationStep = (typeof OCCUPATION_STEPS)[number];
export type StepState = "done" | "pending" | "skipped";

/** 공성 공격 변(D-233): 공격 쪽이 선포할 때 고르고, 방어자는 이것을 보고 공성 시각을 고른다 */
export const SIEGE_SIDES = ["north", "east", "south", "west"] as const;
export type SiegeSide = (typeof SIEGE_SIDES)[number];
/** 방어자가 공성 시각을 고르는 기한 = 공성 선포 + 실제 1일(D-200). 고르지 않으면 이 시각에 공성이 열린다 */
export const SIEGE_DEFENSE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 도시 남은 이익이 가는 곳(D-304·D-338, 규칙 sim `payCityProfit`): 자본주의 = 지분대로(국고가 가진 몫은 국고에),
 * 독재 = 지분대로 나누되 국고가 가진 몫은 지배 가문 금고로, 민주주의 = 모두 국고(배당 없음)
 */
export const DIVIDEND_RECIPIENTS = ["shareholders", "treasury", "ruling_family"] as const;
export type DividendRecipient = (typeof DIVIDEND_RECIPIENTS)[number];
export const DIVIDEND_BY_REGIME = {
  capitalism: "shareholders",
  democracy: "treasury",
  dictatorship: "ruling_family",
} as const satisfies Record<Regime, DividendRecipient>;

/** 전쟁의 지금 단계(46 §4.2~4.4, 45 §10.2) */
export const WAR_STAGES = ["declared", "defense_time_pending", "siege_scheduled", "peace_talks"] as const;
export type WarStage = (typeof WAR_STAGES)[number];

/** 편입 제안 상태(46 §5.1 ④): 기한이 지나면 거부로 본다 */
export type OfferState = "pending" | "accepted" | "refused" | "expired";

// ── 전송 타입 ───────────────────────────────────────────────────────────────

/** 자산 잔고. amount는 최소 단위 정수의 10진 글자다(JSON에 BigInt가 없다) */
export interface AssetBalance {
  /** 원장 자산 코드(예: s3_test_credit, 세력 화폐 코드) */
  readonly asset: string;
  /** 사람이 지은 이름(세력 화폐)이면 두 언어에서 같은 글자. 없으면 기기가 아는 이름이나 코드를 쓴다 */
  readonly name: string | null;
  readonly amount: string;
}

/** 다른 세력을 가리키는 값 */
export interface FactionRef {
  readonly id: string;
  /** 사람이 지은 이름(번역하지 않는다, D-6046) */
  readonly name: string;
  /** 태그 2~4자(S20). 없으면 null */
  readonly tag: string | null;
  readonly kind: FactionKind;
}

/** 내 몫(로그인한 사용자의 소유 주체, S3 world_owners) — 늘 실제 자료다 */
export interface MySummary {
  /** 세계에 내 소유 주체가 있는지(2차맵에 처음 들어가면 생긴다) */
  readonly hasOwner: boolean;
  readonly units: number;
  readonly buildings: number;
  /** 내 원장 잔고(위치 없는 계정만, 0 아닌 것) */
  readonly balances: readonly AssetBalance[];
}

/** 세력 요약(46 §1) */
export interface FactionSummary {
  readonly id: string;
  readonly name: string;
  readonly tag: string | null;
  readonly kind: FactionKind;
  readonly stage: Exclude<FactionStage, "individual">;
  /** 체제(D-217). 모르면 null(실제 자료는 DB factions.regime) */
  readonly regime: Regime | null;
  /** 고정 세력(D-324: 기본 NPC 국가, 멸망하지 않는다) */
  readonly fixed: boolean;
  readonly leader: string | null;
  readonly memberCount: number;
  readonly cityCount: number;
  /** 내가 들어온 시각(서버 ms) */
  readonly joinedAt: number;
  /** 나라 안의 내 가문(46 §1.1). 없으면 null */
  readonly family: { readonly name: string; readonly memberCount: number; readonly head: boolean } | null;
  /** 이 세력이 종속국(봉신)이면 상위 세력과 공물 비율(주기마다 국고의 ‰, S33 설정값 D-443. 주기는 rules. 모르면 null) */
  readonly overlord: { readonly faction: FactionRef; readonly tributePm: number | null } | null;
  /** 이 세력의 종속국들(공물 비율은 위와 같은 뜻) */
  readonly vassals: readonly { readonly faction: FactionRef; readonly tributePm: number }[];
  /** 세력 화폐(도시 없는 세력은 발행하지 못한다, D-299). 발행량은 최소 단위 정수 글자 */
  readonly currency: { readonly code: string; readonly name: string; readonly issued: string } | null;
  /** 국고 잔고 */
  readonly treasury: readonly AssetBalance[];
  readonly preview?: true;
}

/** 잠긴 메뉴 하나(D-5055) — 열렸는지와 조건마다 지금 값 */
export interface LockedFeature {
  readonly feature: LockableFeature;
  readonly open: boolean;
  readonly requirements: readonly {
    readonly kind: LockRequirementKind;
    readonly need: number;
    readonly current: number;
    readonly met: boolean;
  }[];
}

/** 도시 한 줄(46 §2 내정) */
export interface CityRow {
  readonly id: string;
  readonly name: string;
  /** 시장(D-252). null이면 공석, actingDeputy가 있으면 부시장 대행(D-105) */
  readonly mayor: string | null;
  readonly actingDeputy: string | null;
  readonly population: number;
  /** 도시 평균 만족도 0~100(D-219, D-253 충성도와 같은 값) */
  readonly satisfaction: number;
  readonly unrest: UnrestLevel;
  /** 반란 문턱(S26): 이 값 이하면 반란 중 */
  readonly rebellionThreshold: number;
  /** 반란 예고 문턱(S26 + N35): 이 값 이하면 반란 예고 */
  readonly rebellionWarning: number;
  /** 발전도 점수(D-254, 42 §2.3) */
  readonly development: number;
  /** 발전도 7요소 내역(요소마다 가중치를 곱한 점수, 합 = development). 모르면 null */
  readonly developmentParts: Readonly<Record<DevelopmentFactor, number>> | null;
  /** 도시 세율 ‰(시장이 정한다, 상한 없음 D-128) */
  readonly taxRatePm: number;
  /** 자동 운영 방침과 하루 예산 한도(D-5062, 화폐 최소 단위 글자) */
  readonly policy: CityPolicy;
  readonly dailyBudget: string;
  /** 기본 NPC 국가의 시작 도시(주인이 바뀌지 않음, D-325·D-341) */
  readonly startCity: boolean;
  /** 점령한 지 얼마 안 됐다(점령 처리 중, 46 §5.1) */
  readonly occupied: boolean;
}

/** 조약 카드 하나 */
export interface TreatyCard {
  readonly id: string;
  readonly kind: TreatyKind;
  readonly since: number;
  /** 기한(불가침 등). 없으면 null */
  readonly expiresAt: number | null;
  /** 카드 조항 값(예: 관세 tariffFromPm·tariffToPm, 자동 합류 autoJoin 1) */
  readonly terms: Readonly<Record<string, number>>;
}

/** 외교 표 한 줄(46 §4.1 세 층) */
export interface DiplomacyRow {
  readonly faction: FactionRef;
  /** 관계 점수(호감) −100~100과 띠 */
  readonly score: number;
  readonly band: RelationBand;
  /** 그 세력의 세력 신뢰 −100~100. 세력마다 하나이고 모두가 같은 값을 본다(조약을 어기면 떨어진다, D-255·D-443) */
  readonly trust: number;
  readonly state: OfficialState;
  readonly treaties: readonly TreatyCard[];
  /** 고정 NPC 세력(시작 도시는 선포 대상이 아니다, D-325) */
  readonly fixed: boolean;
}

/** 전쟁 한 줄(46 §4.2~4.4) */
export interface WarRow {
  readonly id: string;
  readonly opponent: FactionRef;
  /** 우리가 선포했는지 */
  readonly attacker: boolean;
  readonly casusBelli: CasusBelli;
  readonly declaredAt: number;
  readonly stage: WarStage;
  /** 공성 대상 도시 이름 */
  readonly targetCity: string | null;
  /** 공성 선포 시각(선전포고와 다르다. 공성을 선포하지 않았으면 null) */
  readonly siegeDeclaredAt: number | null;
  /** 공격 변(D-233). 공성을 선포할 때 정한다 */
  readonly attackSide: SiegeSide | null;
  /** 공성 시각(정해졌으면) 또는 방어 시각을 고를 기한(defense_time_pending, = 공성 선포 + 24시간 D-200) */
  readonly siegeAt: number | null;
  readonly deadlineAt: number | null;
  /** 우리 편 참가자(동맹 합류, D-291) */
  readonly allies: readonly FactionRef[];
}

/** 투표 하나(D-5057). 비율은 ‰ */
export interface VoteRow {
  readonly id: string;
  readonly agenda: AgendaKind;
  /** 안건 값(예: tax_change의 city·fromPm·toPm). 글자는 사람이 지은 이름이다 */
  readonly params: Readonly<Record<string, string | number>>;
  readonly opensAt: number;
  readonly closesAt: number;
  /** 급한 안건(전쟁·강화)은 기간이 짧다 */
  readonly urgent: boolean;
  readonly quorumPm: number;
  readonly yesPm: number;
  readonly noPm: number;
  readonly myVote: "yes" | "no" | null;
  /** 끝났으면 결과 */
  readonly result: "passed" | "rejected" | null;
}

/** 정권·투표(46 §1.3) */
export interface RegimeView {
  readonly regime: Regime;
  readonly rule: VotingRule;
  readonly leader: string;
  /** 독재는 투표가 없다 → 빈 목록 */
  readonly votes: readonly VoteRow[];
}

/** 도시 지분 한 줄(46 §3, D-130). 주식 수는 SHARES_PER_CITY */
export interface CityShareRow {
  readonly cityId: string;
  readonly cityName: string;
  /** 그 도시를 가진 세력(도시 주식은 누구나 산다 D-130, 다른 나라 도시일 수 있다) */
  readonly owner: FactionRef;
  /** 상장폐지(46 §5.1 ③)면 false — 주식이 없다 */
  readonly listed: boolean;
  readonly myShares: number;
  readonly top: { readonly holder: string; readonly shares: number } | null;
  readonly path: IndependencePath;
  /**
   * 배당(D-304·D-338): 도시 세금에서 발행 이자 소각 → 운영비 → 남은 이익을 체제대로 나눈다(to). 주기는 설정값.
   * last = 최근 배당(지분대로 나눴을 때만, 내 몫·전체). 민주주의는 국고로 가서 배당이 없다
   */
  readonly dividend: {
    readonly to: DividendRecipient;
    readonly last: {
      readonly paidAt: number;
      readonly mine: string;
      readonly total: string;
      readonly currency: string;
    } | null;
  };
  /** 열려 있는 독립 투표(자본주의 = 찬성 지분 ‰, 민주주의 = 찬성 가문 ‰). 문턱은 S27 */
  readonly independenceVote: {
    readonly openedBy: string;
    readonly yesPm: number;
    readonly thresholdPm: number;
    readonly closesAt: number;
  } | null;
}

/** 점령 처리 한 줄(46 §5.1). side: 우리가 점령했는지(as_occupier), 내 자산이 있는 도시가 점령됐는지(offer_to_me) */
export interface OccupationRow {
  readonly id: string;
  readonly side: "as_occupier" | "offer_to_me";
  readonly cityName: string;
  /** 상대(우리가 점령했으면 옛 주인, 편입 제안이면 점령자) */
  readonly other: FactionRef;
  readonly occurredAt: number;
  /** 다섯 처리의 상태(OCCUPATION_STEPS 순서) */
  readonly steps: Readonly<Record<OccupationStep, StepState>>;
  /** ① 고른 것 */
  readonly lootChoice: "loot" | "integrate" | null;
  /** ③ 도시 주식: 고른 것(null = 아직) */
  readonly shareChoice: "delist" | "keep" | null;
  /** ④ 편입 제안: 기한(S30)과 답 수(as_occupier) 또는 내 상태(offer_to_me) */
  readonly offers: {
    readonly deadlineAt: number;
    readonly accepted: number;
    readonly refused: number;
    readonly pending: number;
    readonly mine: OfferState | null;
    /** offer_to_me: 그 도시 안 내 건물 수(답할 때까지 동결) */
    readonly myBuildings: number;
  };
  /**
   * ⑤ 복원 모금(누구나 낸다, D-343). 낸 돈만큼 도시 지분을 받는다(D-339, 도시마다 SHARES_PER_CITY주).
   * 금액은 화폐 최소 단위 글자. mine = 내가 낸 돈, expectedShares = 목표를 채우면 내가 받을 지분(서버가 규칙 함수로 계산)
   */
  readonly restoration: {
    readonly raised: string;
    readonly goal: string;
    readonly currency: string;
    readonly mine: string;
    readonly expectedShares: number;
  } | null;
}

/** 아직 자료가 없는 칸은 not_ready(화면은 "곧 열림"). 시안 자료면 preview */
export type FactionSection<T> =
  | { readonly status: "not_ready" }
  | { readonly status: "ready"; readonly data: T; readonly preview?: true };

/** 화면 문구에 쓰는 규칙 설정값(팩 tuning): 공물 주기(`d443_tribute_every`), 배당 주기(`d130_dividend_every`) */
export interface FactionRules {
  readonly tributeEveryMs: number;
  readonly dividendEveryMs: number;
}

/** faction.overview 응답 */
export interface FactionOverviewResponse {
  /** 만든 서버 시각(남은 시간의 기준) */
  readonly generatedAt: number;
  /** 규칙 설정값(실제 자료든 시안이든 같은 팩 값) */
  readonly rules: FactionRules;
  /** 시안 자료가 든 응답인지(dev·admin이 켰을 때) */
  readonly preview: boolean;
  readonly stage: FactionStage;
  readonly me: MySummary;
  readonly faction: FactionSummary | null;
  readonly locks: readonly LockedFeature[];
  readonly cities: FactionSection<readonly CityRow[]>;
  readonly diplomacy: FactionSection<readonly DiplomacyRow[]>;
  readonly wars: FactionSection<readonly WarRow[]>;
  readonly regime: FactionSection<RegimeView>;
  readonly shares: FactionSection<readonly CityShareRow[]>;
  readonly occupations: FactionSection<readonly OccupationRow[]>;
}
