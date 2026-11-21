// 나라 의결(governance) — 안건·투표·선출 규칙과 화면 자료. docs/adr/2026-11-21-governance.md, 질문 docs/questions/2026-11-21-governance.md
// (2351~2365, 사용자 답 D-580·기획 대조), 기획 D-217(체제 셋)·D-5057(안건 목록, 정족수·기간은 설정값, 독재는 투표 없음, 실제 시간)·D-131(체제 전환
// 7일 유예)·D-344·D-349(독재 = 지배 가문 지분 과반, 나머지 지분은 의결권 없음)·D-574 10(나라를 누가 이끄나)·D-555 1509(NPC도 똑같이).
// 판정은 서버만 한다(서버 권위). 이 파일은 순수 셈(가결·선출·동점)과 tRPC 조회 모양만 둔다 — 게임 앱은 모양과 문구 키만 쓴다.
// - 표 셈(2353·2365 기술 기본값): 기권을 고른 표는 정족수에 들고 찬반에는 들지 않는다. 던지지 않은 표(불참)는 정족수에도 들지 않는다.
// - 가결(2354): 찬성 × 1000 > 문턱‰ × (찬성 + 반대). 문턱 500 = 과반, 666 = 2/3(설정 칸).
// - 선출(2359 가 단순 다수, 2360 동점 가 → 나 → 다): 표가 가장 많은 후보. 같으면 현직(지금 지배 가문) → 가문 판 점수 → 먼저 등록한 후보.
// - 정족수를 못 채우면 부결(현상 유지) — 선출이면 현직이 그대로다.

/**
 * 안건 종류(D-5057 가운데 만든 것). 세율 크게 바꾸기(tax_change — 질문 2407 가, 줄기 governance-2): 민주주의·자본주의 나라에서 지도자가 세율을 한 번에
 * 설정 칸 폭 이상 바꾸려 하면 안건이 된다(나라 세금 명령 nation_tax가 연다). 폭 아래·독재는 지도자가 바로 정한다
 */
export const AGENDA_KINDS = [
  "leader_election",
  "leader_removal",
  "regime_change",
  "war_declaration",
  "tax_change",
  /** 빈자리 도시 독립 투표(질문 2434 (가) 답 D-583 — 빈자리가 설정 기간을 넘으면 서버가 시작 도시가 아닌 도시마다 연다, 투표권 = 그 도시) */
  "city_independence",
  /** 국고 지분 팔기(질문 2438 답 D-583 — "도시·영토 매각" 묶음, 독재는 지배 가문장 직권) */
  "treasury_share_sale",
  /**
   * 강화(줄기 governance-5 — 질문 2452, D-5057 "전쟁·외교: 강화 수락"): 전쟁 중인 상대와 강화. 민주주의·자본주의 = 투표(전쟁 묶음 — 짧은 기간), 독재 = 직권(D-217).
   * 상대가 NPC가 이끄는 나라면 NPC 강화 규칙식이 받는다, 플레이어가 이끄는 나라면 그쪽도 같은 강화를 정해야(기다림 gov_peace_offer_ms) 맺는다 [임시]
   */
  "peace",
  /** 화폐 단계 전환(질문 2453, D-252·D-131): 공식(테일러 준칙) ↔ 지도자 손 조절 [임시]. 문턱 gov_threshold_currency_pm(2/3), 독재 = 직권 */
  "currency_stage",
  /**
   * 가문 독립 선언(질문 2454, D-300 "한 가문이 그 도시 지분 50% 이상이면 투표 없이 독립 선언"): 자본주의 나라 도시 하나 — 투표가 없어 늘 바로 집행한 기록(직권 줄)이다.
   * NPC 가문은 성향 규칙식(D-323)과 옛 나라와의 힘 비(D-585)로 고른다
   */
  "house_independence",
] as const;
export type AgendaKind = (typeof AGENDA_KINDS)[number];

/** 안건 묶음(투표 기간·정족수 설정 칸 — 2352 나): 지도자(선출·해임·체제 전환)·전쟁 */
export type AgendaGroup = "leader" | "war";
export function agendaGroupOf(kind: AgendaKind): AgendaGroup {
  // 강화도 전쟁 묶음(D-5057 "급한 전쟁·강화 안건은 짧게" — 줄기 governance-5)
  return kind === "war_declaration" || kind === "peace" ? "war" : "leader";
}

/** 나라 화폐 정책 단계(질문 2453 — formula = 중앙은행 공식 D-131, manual = 지도자가 하루 조절량을 정함 [임시]) */
export const MONETARY_MODES = ["formula", "manual"] as const;
export type MonetaryMode = (typeof MONETARY_MODES)[number];

/** 정권 체제(D-217 — government.ts GovernmentRegime과 같은 값) */
export const GOVERNANCE_REGIMES = ["dictatorship", "democracy", "capitalism"] as const;
export type GovernanceRegime = (typeof GOVERNANCE_REGIMES)[number];

/** 찬반 안건의 표 */
export const VOTE_CHOICES = ["yes", "no", "abstain"] as const;
export type VoteChoice = (typeof VOTE_CHOICES)[number];

/**
 * 가문 열쇠: p:<플레이어 가문 세력 행 ID> | n:<NPC 가문 ID(npc_houses)>. 지배 가문·후보·선출 표가 이 꼴이다. 투표자 열쇠는 이것 둘(민주주의 — 가문마다
 * 한 표, 2355 가)과 o:<소유 주체 ID>(자본주의 — 지분 한 주 한 표, 2356 가)다.
 */
export type HouseKey = `p:${number}` | `n:${number}`;
export const HOUSE_KEY_PATTERN = /^[pn]:[1-9][0-9]{0,15}$/;
export function isHouseKey(value: string): value is HouseKey {
  return HOUSE_KEY_PATTERN.test(value);
}

/** 안건 상태: open 투표 중 · passed 가결(집행 기다림 — 유예) · enacted 집행함 · failed 부결 · cancelled 취소(체제가 바뀌어 투표가 없어짐 등) */
export const AGENDA_STATUSES = ["open", "passed", "enacted", "failed", "cancelled"] as const;
export type AgendaStatus = (typeof AGENDA_STATUSES)[number];

/** 부결·취소 까닭 */
export type AgendaFailReason = "quorum" | "threshold" | "tie" | "no_candidates" | "invalid" | "regime";

/** 표 하나(셈 입력) */
export interface TallyVote {
  /** yes | no | abstain, 선출이면 후보 가문 열쇠 또는 abstain */
  readonly choice: string;
  readonly weight: bigint;
}

export interface TallyRules {
  /** 정족수(‰ — 던진 표(기권 포함) ÷ 투표권 전체) */
  readonly quorumPm: number;
  /** 가결 문턱(‰ — 찬성 ÷ (찬성 + 반대)보다 커야 한다) */
  readonly thresholdPm: number;
}

export interface TallyResult {
  readonly passed: boolean;
  readonly reason: AgendaFailReason | null;
  readonly yes: bigint;
  readonly no: bigint;
  readonly abstain: bigint;
  /** 던진 표(기권 포함) */
  readonly cast: bigint;
  /** 투표권 전체 */
  readonly electorate: bigint;
}

const clampPm = (value: number): number =>
  Number.isSafeInteger(value) ? Math.min(1000, Math.max(0, value)) : 1000;

/** 정족수를 채웠나(던진 표 × 1000 ≥ 정족수‰ × 투표권 전체). 투표권이 없으면 못 채운다 */
export function quorumMet(cast: bigint, electorate: bigint, quorumPm: number): boolean {
  if (electorate <= 0n) return false;
  return cast * 1000n >= BigInt(clampPm(quorumPm)) * electorate;
}

/** 찬반 안건 셈 */
export function tallyMotion(votes: readonly TallyVote[], electorate: bigint, rules: TallyRules): TallyResult {
  let yes = 0n;
  let no = 0n;
  let abstain = 0n;
  for (const vote of votes) {
    if (vote.weight <= 0n) continue;
    if (vote.choice === "yes") yes += vote.weight;
    else if (vote.choice === "no") no += vote.weight;
    else if (vote.choice === "abstain") abstain += vote.weight;
  }
  const cast = yes + no + abstain;
  const base = { yes, no, abstain, cast, electorate };
  if (!quorumMet(cast, electorate, rules.quorumPm)) return { ...base, passed: false, reason: "quorum" };
  const passed = yes * 1000n > BigInt(clampPm(rules.thresholdPm)) * (yes + no);
  return { ...base, passed, reason: passed ? null : yes === no ? "tie" : "threshold" };
}

/** 선출 후보 */
export interface ElectionCandidate {
  readonly key: HouseKey;
  readonly registeredAtMs: number;
  /** 가문 판 점수(동점 둘째 규칙). 모르면 0 */
  readonly boardScore: number;
}

export interface ElectionResult {
  /** 이긴 가문. 정족수 미달·후보·표 없음이면 null(현직 그대로) */
  readonly winner: HouseKey | null;
  readonly reason: AgendaFailReason | null;
  /** 후보마다 표(후보 차례) */
  readonly counts: readonly { readonly key: HouseKey; readonly votes: bigint }[];
  readonly abstain: bigint;
  readonly cast: bigint;
  readonly electorate: bigint;
}

/** 선출 셈(단순 다수 — 2359 가, 동점 2360 가 → 나 → 다) */
export function tallyElection(
  votes: readonly TallyVote[],
  candidates: readonly ElectionCandidate[],
  electorate: bigint,
  quorumPm: number,
  incumbent: HouseKey | null,
): ElectionResult {
  const counts = new Map<string, bigint>(candidates.map((candidate) => [candidate.key, 0n]));
  let abstain = 0n;
  for (const vote of votes) {
    if (vote.weight <= 0n) continue;
    const before = counts.get(vote.choice);
    if (before !== undefined) counts.set(vote.choice, before + vote.weight);
    // 후보가 아닌 표(물러난 후보 등)는 기권으로 센다 — 던진 표라 정족수에는 든다
    else abstain += vote.weight;
  }
  const list = candidates.map((candidate) => ({
    key: candidate.key,
    votes: counts.get(candidate.key) ?? 0n,
  }));
  const cast = list.reduce((sum, row) => sum + row.votes, 0n) + abstain;
  const base = { counts: list, abstain, cast, electorate };
  if (candidates.length === 0) return { ...base, winner: null, reason: "no_candidates" };
  if (!quorumMet(cast, electorate, quorumPm)) return { ...base, winner: null, reason: "quorum" };
  const top = list.reduce((best, row) => (row.votes > best ? row.votes : best), 0n);
  if (top === 0n) return { ...base, winner: null, reason: "quorum" };
  const leaders = candidates.filter((candidate) => counts.get(candidate.key) === top);
  if (leaders.length === 1) return { ...base, winner: leaders[0]?.key ?? null, reason: null };
  // 동점: 현직 → 가문 판 점수 → 먼저 등록
  const sitting = leaders.find((candidate) => candidate.key === incumbent);
  if (sitting) return { ...base, winner: sitting.key, reason: "tie" };
  const picked = leaders.toSorted(
    (a, b) => b.boardScore - a.boardScore || a.registeredAtMs - b.registeredAtMs || (a.key < b.key ? -1 : 1),
  )[0];
  return { ...base, winner: picked?.key ?? null, reason: "tie" };
}

// ---------- tRPC 조회 모양(governance.view) ----------

/** 세율 안건 값(나라 세금 한 줄 — 소득세 bp·주민세 ‰·주민세 주기 일·주민세 국세 몫 ‰, null = 정하지 않음) */
export interface GovernanceTaxes {
  readonly incomeTaxBp: number | null;
  readonly residentTaxPm: number | null;
  readonly residentEveryDays: number | null;
  readonly residentNationPm: number | null;
  /** 거래세(만분율 — 줄기 governance-5, 질문 2460). 없으면(옛 안건·옛 기기) 바꾸지 않는다 */
  readonly tradeTaxBp?: number | null | undefined;
}

/** 나라 이름(팩 국가 프리셋 두 언어 — 플레이어 가문 나라는 두 언어 같은 글자) */
export interface GovernanceName {
  readonly ko: string;
  readonly en: string;
}

/** 이름 붙은 가문(화면 — NPC 가문은 성 하나라 화면이 "{이름} 가문"으로 적는다) */
export interface GovernanceHouse {
  readonly key: HouseKey;
  /** 이름(번역 안 함). 모르면 null */
  readonly name: string | null;
  readonly npc: boolean;
}

export interface GovernanceVoteRow {
  /** 표를 던진 쪽(공개 투표 — 2365 가): 가문 또는 주주 */
  readonly voter:
    | GovernanceHouse
    | { readonly key: string; readonly name: string | null; readonly npc: boolean };
  readonly choice: string;
  /** 표 무게(10진 문자열 — 민주주의 1, 자본주의 주 수) */
  readonly weight: string;
}

export interface GovernanceAgendaView {
  readonly id: number;
  readonly kind: AgendaKind;
  readonly status: AgendaStatus;
  /** 열 때 체제 */
  readonly regime: GovernanceRegime;
  /** 체제 전환 목표(체제 전환만) */
  readonly targetRegime: GovernanceRegime | null;
  /** 세율 안건이 바꾸려는 나라 세금(세율 안건만 — 칸마다 null = 정하지 않음으로 되돌림) */
  readonly taxes: GovernanceTaxes | null;
  /** 도시 독립 투표·국고 지분 팔기의 도시(세력 화면 도시 ID). 없으면 null */
  readonly cityId: number | null;
  /** 국고 지분 팔기: 주 수·한 주 가장 낮은 값(10진 글자). 아니면 null */
  readonly shareSale: { readonly shares: string; readonly minPrice: string } | null;
  /** 선전포고·강화 상대 나라(세력 행 ID·이름 — 선전포고·강화만) */
  readonly targetNation: { readonly id: number; readonly name: GovernanceName | null } | null;
  /** 화폐 단계 전환의 목표 단계·하루 조절(만분율 — 화폐 단계 안건만) */
  readonly monetary: { readonly mode: MonetaryMode; readonly rateBp: number } | null;
  /** 직권 결정(독재 지도자·지분 과반 — 투표 없음) */
  readonly byAuthority: boolean;
  /** 올린 쪽(시스템 = 임기 끝 자동 선출) */
  readonly proposer: GovernanceHouse | null;
  readonly openedAtMs: number;
  /** 후보 등록 끝(선출만 — 그 뒤 NPC가 표를 낸다) */
  readonly registerUntilMs: number | null;
  readonly closesAtMs: number;
  /** 집행 시각(가결 뒤 유예 — D-131) */
  readonly effectAtMs: number | null;
  readonly reason: AgendaFailReason | null;
  /** 찬반 합(10진 문자열) — 선출이면 null */
  readonly totals: { readonly yes: string; readonly no: string; readonly abstain: string } | null;
  /** 투표권 전체·정족수 몫(‰)·가결 문턱(‰) */
  readonly electorate: string;
  readonly quorumPm: number;
  readonly thresholdPm: number;
  /** 선출 후보와 표(선출만) */
  readonly candidates: readonly (GovernanceHouse & { readonly votes: string })[];
  /** 해임 뒤 다시 뽑기에서 후보로 나설 수 없는 가문 */
  readonly barred: GovernanceHouse | null;
  /** 이긴 가문(선출) */
  readonly winner: GovernanceHouse | null;
  readonly votes: readonly GovernanceVoteRow[];
  /** 보는 사람: 던질 수 있나·이미 던진 표·후보로 나설 수 있나 */
  readonly me: {
    readonly canVote: boolean;
    readonly choice: string | null;
    readonly canRegister: boolean;
    readonly weight: string;
  };
}

export type GovernanceStatus = "ready" | "not_ready" | "no_nation";

/** 군사 쿠데타 하나(질문 2433 답·D-583 — 참가 받는 중이거나 최근 끝남) */
export interface GovernanceCoupView {
  readonly id: number;
  /** 일으킨 가문(혁명군) */
  readonly house: GovernanceHouse;
  readonly status: "gathering" | "won" | "lost" | "cancelled";
  /** 참가 받기 끝 = 전투 시각 */
  readonly gatherUntilMs: number;
  /** 편마다 참가자 수(일으킨 가문·지배 가문 빼고) */
  readonly rebels: number;
  readonly government: number;
  /** 보는 사람이 든 편(없으면 null) */
  readonly mySide: "rebel" | "government" | null;
  /** 쿠데타 전투 도시(줄기 gov-coup — D-588 2492 가 "모든 도시에서"). 옛 줄·모르면 null */
  readonly city?: { readonly id: number; readonly name: string | null } | null | undefined;
}

export interface GovernanceResponse {
  readonly status: GovernanceStatus;
  readonly nation: {
    readonly id: number;
    readonly name: GovernanceName | null;
    readonly regime: GovernanceRegime;
    /** 지금 지배 가문(D-574 10 — 선출되면 바뀐다, 2358 가) */
    readonly rulingHouse: GovernanceHouse | null;
    /** 임기 끝(민주주의·자본주의만 — 2357). 독재는 null */
    readonly termEndsAtMs: number | null;
    /** 독재로 바뀌며 의결권을 잃은 지분이 있나(D-349) */
    readonly shareVotesSuspended: boolean;
    /** 지배 쪽 지분 몫(‰ — D-344 과반 길) */
    readonly rulingSharePm: number;
    /** 지도자 신임도(0~1000 — D-585, 오르내림 D-588 2493). 지배 가문이 없거나 아직 셈하지 않았으면 null */
    readonly approval?: number | null | undefined;
  } | null;
  /** 보는 사람이 올릴 수 있는 안건(체제·자격 — 2351 가) */
  readonly canPropose: readonly AgendaKind[];
  /** 보는 사람이 그 나라 지도자(지배 가문의 장)인가 */
  readonly leader: boolean;
  /** 열린 안건과 최근 끝난 안건(새것부터) */
  readonly agendas: readonly GovernanceAgendaView[];
  /** 보는 사람이 쿠데타를 일으킬 수 있나(설정 칸 gov_coup_enabled·지배 가문이 아닌 소속 가문의 장) */
  readonly canCoup: boolean;
  /** 그 나라 쿠데타(참가 받는 중 + 최근 끝난 것) */
  readonly coups: readonly GovernanceCoupView[];
  /** 쿠데타를 일으킬 수 있는 도시(그 나라 도시 — 줄기 gov-coup, D-588 2492 가). canCoup이 아니면 빈 목록 */
  readonly coupCities?: readonly { readonly id: number; readonly name: string | null }[] | undefined;
  /** 선전포고 상대로 고를 수 있는 나라 */
  readonly warTargets: readonly { readonly id: number; readonly name: GovernanceName | null }[];
}
