// 유닛·사이보그 화면 자료(조회) — tRPC units.list·cyborg.get의 응답 모양. ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)".
// 진입점은 @terra/shared/roster다. 첫 화면 묶음에 들어가지 않게 index.ts에서 내보내지 않는다(ADR 37 6·11절).
// - 실제 자료: 세계 유닛(world_units: 종류·자리·직무·피로·부상·포로)과 그 유닛의 화물(원장). 계정 이름.
// - 시안 자료(preview: true, dev·admin만): 아직 없는 시스템(사이보그 본체·인벤토리·유닛 장비·파티·경매소·랭킹)의 그럴듯한 자료.
//   항목마다 preview를 붙이고 화면이 "시험 자료"를 표시한다. 바꾸는 명령은 보내지 않는다(곧 열림).
// - 이름이 콘텐츠 팩에 있는 것(스탯·아이템·스킬·시설·유닛 종류)은 응답의 names 표에 {ko, en}으로 함께 보낸다.
// - 2차 스탯은 서버가 계산해 보낸다(게임 앱은 판정 코드 packages/sim을 가져오지 않는다, AGENTS 4장).
// - 금액·양은 최소 단위 정수 문자열이다(PLAN 4.7).

import type { CyborgAppearance } from "./cyborgLooks.ts";

/**
 * 1차 스탯 6개(D-414) — 화면 차례. 두 개씩 묶는다: STR·VIT, INT·WIS, DEX·AGI(옛 프로젝트 CHR-1 차례·색, 질문 181 기술 추천 가.
 * 기획은 묶음·색을 정하지 않았다). 판정 코드의 차례(STR·DEX·AGI·VIT·INT·WIS, packages/sim)와 다르다 — 화면만 이 차례를 쓴다.
 * 스탯 색은 styles/tokens.css의 --color-stat-<ID>
 */
export const PRIMARY_STATS = ["str", "vit", "int", "wis", "dex", "agi"] as const;
export type PrimaryStat = (typeof PRIMARY_STATS)[number];

/** 화면의 스탯 묶음(두 칸씩, PRIMARY_STATS와 같은 차례) */
export const PRIMARY_STAT_PAIRS = [
  ["str", "vit"],
  ["int", "wis"],
  ["dex", "agi"],
] as const satisfies readonly (readonly [PrimaryStat, PrimaryStat])[];

/** 판정 코드(packages/sim Primaries·가중치 열)의 1차 스탯 차례. 서버가 가중치 칸 번호를 스탯 ID로 바꿀 때 쓴다 */
export const RULE_STAT_ORDER = [
  "str",
  "dex",
  "agi",
  "vit",
  "int",
  "wis",
] as const satisfies readonly PrimaryStat[];

/** 속성 12칸(D-182·D-5011, 50 §2.1). 차례 = 판정 코드의 속성 칸(packages/sim combat/formula.ts), 계열 = ⌊칸 ÷ 2⌋(기본·강화) */
export const ELEMENT_CODES = [
  "water",
  "frost",
  "fire",
  "blaze",
  "wind",
  "lightning",
  "earth",
  "crystal",
  "light",
  "holy",
  "dark",
  "necro",
] as const;
export type ElementCode = (typeof ELEMENT_CODES)[number];

/** 두 언어 이름(콘텐츠 팩 이름 칸과 같은 모양) */
export interface LocalizedName {
  readonly ko: string;
  readonly en: string;
}

/**
 * 유닛 종류. human·creature·android·cyborg는 기획 유닛 종류(D-416, 콘텐츠 팩 unit_kinds),
 * test_worker·test_unit은 지금 세계에 있는 시험 유닛(서버 world/unitKinds.ts의 시험 일꾼·관리자 시험 유닛)이다.
 */
export const UNIT_TYPES = ["cyborg", "human", "creature", "android", "test_worker", "test_unit"] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/** 장비 칸 종류(D-422, 콘텐츠 팩 unit_kinds slots) */
export const EQUIP_SLOTS = [
  "weapon",
  "offhand",
  "head",
  "body",
  "accessory",
  "organ",
  "part",
  "saddle",
] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** 영역(D-372) */
export type RosterDomain = "space" | "sky" | "land" | "sea";

/** 직무: 시설 직무(시안, 시설 ID = 콘텐츠 팩 facilities) 또는 지금 세계의 시험 직무(정산 직무 코드) */
export type RosterJob =
  | { readonly kind: "facility"; readonly facility: string; readonly phase: "work" | "rest" }
  | { readonly kind: "test_gather" | "test_hunt"; readonly phase: "work" | "rest" };

/** 부상(D-099·D-145): 0 없음, 1 경상, 2 중상, 3 중태(활동 불가). untilMs = 저절로 낫는 시각(UTC ms) */
export interface RosterInjury {
  readonly stage: 0 | 1 | 2 | 3;
  readonly untilMs: number | null;
}

/** 화물 한 줄(원장 자산 코드, 양 = 정수 문자열) */
export interface RosterCargo {
  readonly asset: string;
  readonly amount: string;
}

/** 2차 스탯·활동 수치 한 줄(행 ID = 콘텐츠 팩 stat_rows). 확률 모양의 값은 ‰ */
export interface RosterStat {
  readonly id: string;
  readonly shape: "quantity" | "probability";
  readonly value: number;
}

/** 2차 스탯 풀이의 한 항: 1차 스탯(보너스 포함) × 가중치‰. milli = value × weightPm(÷ 1000이 그 항의 몫) */
export interface RosterStatTerm {
  readonly stat: PrimaryStat;
  readonly value: number;
  readonly weightPm: number;
  readonly milli: number;
}

/**
 * 2차 스탯 한 줄의 풀이 — 서버가 팩 stat_rows 식(48 §3.1)으로 계산해 보낸다. 기기는 다시 계산하지 않고 보이기만 한다.
 * 양: value = base + weighted + extra / 확률: score = weighted + extra, value = ⌊cap × score ÷ (score + halfConstant)⌋(score ≤ 0이면 0).
 * weighted = ⌊Σ milli ÷ 1000⌋. extra = 장비(무기·방어구 수치)와 양 모양의 버프
 */
export interface RosterStatBreakdown {
  readonly id: string;
  readonly shape: "quantity" | "probability";
  /** 양 모양의 기본(확률 모양은 0) */
  readonly base: number;
  /** 가중치가 0이 아닌 항(화면 차례 PRIMARY_STATS) */
  readonly terms: readonly RosterStatTerm[];
  readonly weighted: number;
  readonly extra: number;
  /** 확률 모양의 점수(양 모양은 base + weighted + extra와 같은 value) */
  readonly score: number;
  /** 확률 모양: 점근선(‰)과 반감 상수. 양 모양은 null */
  readonly cap: number | null;
  readonly halfConstant: number | null;
  readonly value: number;
}

/** 1차 스탯 하나: 성장값 + 장신구·인공장기·부품 보너스(D-417·D-423) */
export interface RosterPrimary {
  readonly base: number;
  readonly bonus: number;
}

/** 스탯 묶음. source: computed = 저장된 입력으로 계산, baseline = [임시] 유닛 스탯을 저장하기 전의 기본값으로 계산 */
export interface RosterStats {
  readonly source: "computed" | "baseline";
  readonly primaries: Readonly<Record<PrimaryStat, RosterPrimary>>;
  readonly secondary: readonly RosterStat[];
}

/** 장비 칸 하나. item = 아이템 ID(names.items), values = 만들 때 정해진 스탯 값 */
export interface RosterSlot {
  readonly slot: EquipSlot;
  readonly item: {
    readonly id: string;
    readonly values: readonly { readonly stat: string; readonly value: number }[];
  } | null;
}

/** 스킬: 칸 수(D-427)와 쓰는 스킬(고유 먼저, 그다음 장비 스킬, D-426) */
export interface RosterSkills {
  readonly slots: number;
  readonly list: readonly { readonly id: string; readonly source: "innate" | "equipment" }[];
}

/** 파티 역할(D-179: 스탯·장비로 자동 판정). 판정은 규칙 줄기가 정한다 — 지금은 시안 자료만 갖는다 */
export type PartyRole = "tank" | "dealer" | "support" | "control";

/** 유닛 한 줄(목록·상세가 같은 자료를 쓴다) */
export interface RosterUnit {
  /** "w<세계 유닛 ID>" 또는 시안 "p<번호>" */
  readonly id: string;
  /** 유저가 지은 이름(시안은 사람 이름처럼 두 언어 같은 글자). 실제 유닛은 아직 이름이 없다 → null */
  readonly name: string | null;
  readonly type: UnitType;
  /** 레벨(안드로이드·시험 유닛은 null, D-416) */
  readonly level: number | null;
  readonly rebirths: number;
  /** 있는 곳. 거점 이름은 시안만 있다 */
  readonly place: {
    readonly planetId: string;
    readonly mapKey: string;
    readonly domain: RosterDomain;
    readonly base: string | null;
  } | null;
  readonly job: RosterJob | null;
  /** 피로(사람·크리쳐) 또는 배터리(안드로이드, D-416). value/max */
  readonly energy: { readonly kind: "fatigue" | "battery"; readonly value: number; readonly max: number };
  readonly injury: RosterInjury;
  /** 다른 주체에게 포로로 잡혀 있다(D-187, 주인은 그대로) */
  readonly captive: boolean;
  readonly moving: boolean;
  readonly cargo: readonly RosterCargo[];
  /** 만족도(휴먼, D-219·D-253 = 충성도). 0~100. 없으면 null */
  readonly satisfaction: number | null;
  /** 파티 ID(시안만) */
  readonly party: string | null;
  readonly stats: RosterStats;
  readonly slots: readonly RosterSlot[];
  readonly skills: RosterSkills;
  readonly preview: boolean;
}

/** 내가 잡고 있는 포로 한 줄(D-244 몸값·처형·회유). 원래 주인 이름은 시안만 있다 */
export interface RosterPrisoner {
  readonly id: string;
  readonly type: UnitType;
  readonly name: string | null;
  readonly owner: string | null;
  readonly injury: RosterInjury;
  /** 시장가치(몸값 범위의 기준, D-269). 모르면 null */
  readonly marketValue: string | null;
  readonly preview: boolean;
}

/** 파티(D-179: 최대 6, 진형 저장). 시안만 */
export interface RosterParty {
  readonly id: string;
  readonly name: string;
  /** 칸 = 진형 자리(앞줄 3 · 뒷줄 3, 0~5). unit = RosterUnit.id */
  readonly members: readonly { readonly unit: string; readonly role: PartyRole; readonly spot: number }[];
  readonly preview: boolean;
}

/** 직무 프리셋(D-6016): 유닛 → 직무 배치를 이름 붙여 저장. 시안만 */
export interface RosterJobPreset {
  readonly id: string;
  readonly name: string;
  readonly assignments: number;
  readonly preview: boolean;
}

/** 거점과 휴먼 관리인(D-246: 태수처럼 자동 운영). 시안만 */
export interface RosterBase {
  readonly id: string;
  readonly name: string;
  /** 관리인 유닛 ID(없으면 null) */
  readonly manager: string | null;
  readonly preview: boolean;
}

/** 경매소 매물(D-242·D-271: 종류별 경매 + 즉시 구매가). 시안만 */
export interface RosterAuctionLot {
  readonly id: string;
  readonly house: "human" | "creature" | "android" | "part" | "vehicle";
  readonly name: string;
  readonly level: number | null;
  readonly bid: string;
  /** 즉시 구매가(없으면 null) */
  readonly buyout: string | null;
  readonly endsAtMs: number;
  readonly preview: boolean;
}

/** 사용하는 이름 표(콘텐츠 팩). 응답에 나온 ID만 */
export interface RosterNames {
  readonly stats: Readonly<Record<string, LocalizedName>>;
  readonly items: Readonly<Record<string, LocalizedName>>;
  readonly skills: Readonly<Record<string, LocalizedName>>;
  readonly facilities: Readonly<Record<string, LocalizedName>>;
  readonly planets: Readonly<Record<string, LocalizedName>>;
}

/** units.list 응답 */
export interface UnitsListResponse {
  readonly units: readonly RosterUnit[];
  readonly prisoners: readonly RosterPrisoner[];
  readonly parties: readonly RosterParty[];
  readonly presets: readonly RosterJobPreset[];
  readonly bases: readonly RosterBase[];
  readonly auction: readonly RosterAuctionLot[];
  readonly names: RosterNames;
  /** 시안 자료를 섞었는지 */
  readonly preview: boolean;
  /** 서버 시각(UTC ms) — 남은 시간 글의 기준 */
  readonly generatedAt: number;
}

/** 인벤토리 한 줄(아이템 ID = names.items, 양 = 정수 문자열) */
export interface CyborgItem {
  readonly id: string;
  readonly amount: string;
}

/** 경로 랭킹 한 줄(D-040·D-041: 경로별, 백분위 등급). 경로 이름은 [임시] 서버가 보낸다(경로 목록이 팩에 들어오면 팩 이름) */
export interface CyborgRanking {
  readonly path: string;
  readonly name: LocalizedName;
  readonly rank: number;
  /** 상위 몇 %(백분위 등급 1·5·20·50, 없으면 100) */
  readonly tierPercent: number;
  readonly score: number;
}

/** 사이보그 본체(D-018·D-026·D-040). 만든 사이보그(첫 접속, docs/adr/2026-11-01-first-login-cyborg.md)나 dev·admin 시안에서 온다 */
export interface CyborgBody {
  readonly level: number;
  readonly maxLevel: number;
  /** 이번 레벨 안 경험치 / 다음 레벨까지 */
  readonly exp: { readonly into: number; readonly span: number };
  readonly rebirths: number;
  /** 스킬 최대 등급 = 3 + 환생(D-031) */
  readonly skillGradeCap: number;
  /**
   * 신앙도(D-441: 사이보그 환생 비용의 하나, 써서 줄어든다). 0~100(규칙 sim CyborgProgress.faith). 얻는 길은 REL-1 종교 활동
   * (기도·헌금·의식·종교 의뢰, 신앙 시설 46 §7)이고 아직 없다(D-444 165)
   */
  readonly faith: number;
  readonly stats: RosterStats;
  /** 2차 스탯 풀이(stats.secondary와 같은 행·같은 값, 상세 전투 스펙의 펼친 줄) */
  readonly breakdown: readonly RosterStatBreakdown[];
  /**
   * 처음 값과 성장 K(‰, 800~1200) — K가 보이는 곳에서만 보낸다(D-449: 환생 시설·생명공학 시설·만렙). cyborg.get은 만렙(N7)일 때만,
   * 그 밖에는 null(K·처음 값 숨김, D-417)
   */
  readonly growth: {
    readonly initial: Readonly<Record<PrimaryStat, number>>;
    readonly kPm: Readonly<Record<PrimaryStat, number>>;
  } | null;
  /**
   * 속성값 12칸(0~10, D-182, 차례 = ELEMENT_CODES). 출처는 생성·환생 분배, 인공장기·장비, 신앙(D-450)이고 칸마다 10에서 자른다.
   * 그 저장·규칙이 들어오기 전에는 0이다
   */
  readonly elements: readonly number[];
  readonly slots: readonly RosterSlot[];
  readonly skills: RosterSkills;
  /** 스킬 칸 최대(팩 unit_kinds skillSlots.max)와 아직 닫힌 칸이 열리는 환생 횟수(칸마다, 오름차순) */
  readonly skillSlotsMax: number;
  readonly skillSlotUnlocks: readonly number[];
  readonly fatigue: { readonly value: number; readonly max: number };
  readonly inventory: readonly CyborgItem[];
  readonly rankings: readonly CyborgRanking[];
  /** 시안 자료인지(만든 사이보그면 false) */
  readonly preview: boolean;
}

/**
 * 사이보그 환생 조건·비용(D-440·D-441·D-444, 팩 tuning 설정값 — 본체가 없어도 규칙이라 늘 보낸다).
 * 최고 레벨(N7 `n7_max_level`), 신앙도(N34 `n34_rebirth_faith`, 0~100 척도, 써서 줄어든다), 화폐(N34 `n34_rebirth_currency`,
 * 환생 시설이 있는 도시 화폐의 최소 단위 정수 글자), 분포 다시 굴리기 횟수(N9 `n9_initial_rerolls`, 생성과 같은 값 — D-444 164).
 * 진로별 종교 아이템은 추가 조건이라 여기에 없다
 */
export interface CyborgRebirthRule {
  readonly maxLevel: number;
  readonly faith: number;
  readonly currency: string;
  readonly rerolls: number;
}

/** cyborg.get 응답 */
export interface CyborgGetResponse {
  /** 환생 조건·비용(설정값) */
  readonly rebirth: CyborgRebirthRule;
  /** 사이보그 이름(만들었으면, 서버 고유 D-134). 아직 없으면 계정 이름 */
  readonly name: string;
  /** 외형(만든 사이보그만, D-6040) */
  readonly appearance: CyborgAppearance | null;
  /** 본체 자료(만든 사이보그 또는 시안, 없으면 null) */
  readonly body: CyborgBody | null;
  /** 보유 유닛 수(실제 세계 유닛, 포로로 잡힌 유닛 포함) */
  readonly unitCount: number;
  readonly names: RosterNames;
  readonly preview: boolean;
  readonly generatedAt: number;
}
