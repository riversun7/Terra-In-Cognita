// 유닛·사이보그 화면 자료(조회) — tRPC units.list·cyborg.get의 응답 모양. ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)".
// 진입점은 @terra/shared/roster다. 첫 화면 묶음에 들어가지 않게 index.ts에서 내보내지 않는다(ADR 37 6·11절).
// - 실제 자료: 세계 유닛(world_units: 종류·자리·직무·피로·부상·포로)과 그 유닛의 화물(원장). 계정 이름.
// - 시안 자료(preview: true, dev·admin만): 아직 없는 시스템(사이보그 본체·인벤토리·유닛 장비·파티·경매소·랭킹)의 그럴듯한 자료.
//   항목마다 preview를 붙이고 화면이 "시험 자료"를 표시한다. 바꾸는 명령은 보내지 않는다(곧 열림).
// - 이름이 콘텐츠 팩에 있는 것(스탯·아이템·스킬·시설·유닛 종류)은 응답의 names 표에 {ko, en}으로 함께 보낸다.
// - 2차 스탯은 서버가 계산해 보낸다(게임 앱은 판정 코드 packages/sim을 가져오지 않는다, AGENTS 4장).
// - 금액·양은 최소 단위 정수 문자열이다(PLAN 4.7).

/** 1차 스탯 6개(D-414) — 화면 차례 */
export const PRIMARY_STATS = ["str", "dex", "agi", "vit", "int", "wis"] as const;
export type PrimaryStat = (typeof PRIMARY_STATS)[number];

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

/** 사이보그 본체(D-018·D-026·D-040). 아직 세계에 본체가 없어 시안에서만 온다 */
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
  readonly slots: readonly RosterSlot[];
  readonly skills: RosterSkills;
  readonly fatigue: { readonly value: number; readonly max: number };
  readonly inventory: readonly CyborgItem[];
  readonly rankings: readonly CyborgRanking[];
  readonly preview: true;
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
  /** 계정 이름(실제) */
  readonly name: string;
  /** 본체 자료(시안만, 없으면 null) */
  readonly body: CyborgBody | null;
  /** 보유 유닛 수(실제 세계 유닛, 포로로 잡힌 유닛 포함) */
  readonly unitCount: number;
  readonly names: RosterNames;
  readonly preview: boolean;
  readonly generatedAt: number;
}
