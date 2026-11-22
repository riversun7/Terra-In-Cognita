// 유닛·사이보그 화면 자료(조회) — tRPC units.list·cyborg.get의 응답 모양. ADR 2026-10-29-app-shell "구현하며 정한 것 (유닛·사이보그 화면)".
// 진입점은 @terra/shared/roster다. 첫 화면 묶음에 들어가지 않게 index.ts에서 내보내지 않는다(ADR 37 6·11절).
// - 실제 자료: 세계 유닛(world_units: 종류·자리·직무·피로·부상·포로)과 그 유닛의 화물(원장). 계정 이름.
// - 시안 자료(preview: true, dev·admin만): 아직 없는 시스템(사이보그 본체·인벤토리·유닛 장비·파티·경매소·랭킹)의 그럴듯한 자료.
//   항목마다 preview를 붙이고 화면이 "시험 자료"를 표시한다. 바꾸는 명령은 보내지 않는다(곧 열림).
// - 이름이 콘텐츠 팩에 있는 것(스탯·아이템·스킬·시설·유닛 종류)은 응답의 names 표에 {ko, en}으로 함께 보낸다.
// - 2차 스탯은 서버가 계산해 보낸다(게임 앱은 판정 코드 packages/sim을 가져오지 않는다, AGENTS 4장).
// - 금액·양은 최소 단위 정수 문자열이다(PLAN 4.7).

import type { AiTactics } from "./aiTactics.ts";
import type { CharacterLook } from "./characterLook.ts";
import type { FishWater } from "./fishWater.ts";

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
 * 유닛 종류. human·creature·android·cyborg는 기획 유닛 종류(D-416, 콘텐츠 팩 unit_kinds — 넷으로 고정, 사용자 결정 2026-11-22·기획 D-589),
 * test_unit은 지금 세계에 있는 시험 유닛(서버 world/unitKinds.ts의 관리자 시험 유닛)이다. 신격화한 휴먼(수호신, D-311)은 종류가 아니라 휴먼의
 * 상태다(행 guardian 칸). 시험 일꾼(test_worker)은 없앴다(사용자 지적 2026-11-09 "시험일꾼 다 없애라고").
 */
export const UNIT_TYPES = ["cyborg", "human", "creature", "android", "test_unit"] as const;
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

/**
 * 부상(D-521): 0 초록(정상), 1 흰, 2 노랑, 3 빨강(활동 불가). untilMs = 한 단계 내려가는 시각(UTC ms, 자연 치유는 빨강 → 노랑 → 흰 → 초록
 * 한 단계씩). greenAtMs = 초록이 되는 시각, healPm = 병원 치료 배율(‰, 치료 중일 때만)
 */
export interface RosterInjury {
  readonly stage: 0 | 1 | 2 | 3;
  readonly untilMs: number | null;
  readonly greenAtMs?: number | null | undefined;
  readonly healPm?: number | undefined;
}

/**
 * 컨디션(몸 상태 = 관리 보너스, D-534): 선호에 맞는 주거·음식으로 붙는 ±. 서버가 센 값(@terra/sim unitCondition)을 보이기만 한다.
 * total = 주거 몫 + 음식 몫을 ±cap으로 자른 값(채집 유효 스탯에 더한다), preferredGrade = 선호 주거 등급(1~3), housingGrade = 지금 숙소 등급(모르면 0)
 */
export interface RosterCondition {
  readonly total: number;
  readonly housing: number;
  readonly food: number;
  readonly cap: number;
  readonly preferredGrade: number;
  readonly housingGrade: number;
  /** 선호 주거 몫·선호 음식 몫(D-535 1151 나). 옛 서버는 없음 */
  readonly housingPrefer?: number | undefined;
  readonly foodPrefer?: number | undefined;
  /** 좋아하는 음식(식품 중분류 이름). 모르면 없음 */
  readonly favoriteFood?: LocalizedName | undefined;
  /** 선호 주거 종류: "home" = 집, 그 밖 = 생활 시설 이름. 모르면 없음 */
  readonly preferredHousing?: LocalizedName | "home" | undefined;
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
  /**
   * 행 식으로 셈한 행(개발자 모드 계산식, docs/adr/2026-11-01-formula-editor.md): 식 글과 결과 식의 항(값을 붙인 글·값,
   * 고정 소수점 1000배). 이때 terms는 비고 weighted = value − extra
   */
  readonly formula?:
    | {
        readonly source: string;
        readonly terms: readonly { readonly sign: 1 | -1; readonly text: string; readonly value: number }[];
      }
    | undefined;
}

/**
 * 1차 스탯 한 칸의 출처 하나(서버가 계산해 보낸다). item = 장비 칸의 아이템(slot "organ"이면 인공장기, "part"면 부품, 보석 몫 포함),
 * effect = 걸린 효과(아이템 1차 스탯 버프 D-501, 고정값만 — docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07 …)")
 */
export type RosterPrimarySource =
  | { readonly kind: "body"; readonly value: number }
  | { readonly kind: "initial"; readonly value: number }
  | { readonly kind: "growth"; readonly value: number; readonly kPm: number }
  | { readonly kind: "item"; readonly slot: EquipSlot; readonly item: string; readonly value: number }
  | { readonly kind: "effect"; readonly id: string; readonly value: number };

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
  /** 수호신 상태인 휴먼(D-311·D-589 — 그 도시에 머물고 일하지 않는다). 아니면 없음 */
  readonly guardian?: boolean | undefined;
  readonly moving: boolean;
  readonly cargo: readonly RosterCargo[];
  /** 만족도(휴먼, D-219·D-253 = 충성도). 0~100. 없으면 null */
  readonly satisfaction: number | null;
  /** 컨디션(관리 보너스, D-534 — 만족도와 따로). 서버가 모르면(시안·옛 서버·띄운 2차맵 밖) 없음 */
  readonly condition?: RosterCondition | undefined;
  /** 파티 ID(시안만) */
  readonly party: string | null;
  /**
   * AI 작전(D-5039·D-5040, 유닛 화면 [AI 작전] 판). 판단하는 세계 유닛(휴먼·사이보그 유닛)만 칸이 있고, 저장한 적이 없으면 null(기본 프리셋 —
   * aiTactics.ts DEFAULT_PLAYER_PRESET). 시안·옛 서버는 칸이 없다
   */
  readonly tactics?: AiTactics | null | undefined;
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

/**
 * 파티 진형 자유 배치 범위(사각형, 2차맵·전투맵 배치 칸 1칸 ≈ 1m 단위).
 * - 가로 폭(x): 좌익 -4 ~ 중앙 0 ~ 우익 +4 (총 9칸, 홀수 폭이라 정중앙 0 열에 V자·역V자 꼭짓점을 둘 수 있다)
 * - 전후 깊이(y): 최전방 0 ~ 최후방 5 (총 6칸, 전투맵 중앙 전선에서 4~9칸 거리로 최소 32×32 전투맵에서도 퇴각 구역과 겹치지 않는다)
 */
export const FORMATION_X_MIN = -4;
export const FORMATION_X_MAX = 4;
export const FORMATION_WIDTH = 9;
export const FORMATION_Y_MIN = 0;
export const FORMATION_Y_MAX = 5;
export const FORMATION_DEPTH = 6;
/** 전투맵 중앙선에서 최전방(y = 0)까지의 기본 거리(배치 칸) */
export const FORMATION_FRONT_DISTANCE = 4;

/** 파티원 한 명의 진형 시작 좌표(x: 좌우 -4..+4, y: 전후 깊이 0..5) */
export interface FormationPoint {
  readonly x: number;
  readonly y: number;
}

/** 기본 진형 프리셋 ID */
export const FORMATION_PRESET_IDS = [
  "two_row",
  "three_row",
  "v_wing",
  "wedge",
  "phalanx",
  "wide_line",
] as const;
export type FormationPresetId = (typeof FORMATION_PRESET_IDS)[number];

export interface FormationPresetSpec {
  readonly id: FormationPresetId;
  readonly name: LocalizedName;
  readonly shortName: LocalizedName;
  readonly desc: LocalizedName;
  /** 최대 6명의 시작 좌표(차례 0~5) */
  readonly points: readonly FormationPoint[];
}

/** 기본 진형 프리셋 6종(2열, 3열, V자 학익진, 역V 쐐기진, 방진·호위, 횡대 산개) */
export const FORMATION_PRESETS: readonly FormationPresetSpec[] = [
  {
    id: "two_row",
    name: { ko: "2열 기본진", en: "2-Row Standard" },
    shortName: { ko: "2열", en: "2-Row" },
    desc: {
      ko: "전열 3명(y=1) · 후열 3명(y=4) 표준 밸런스 진형",
      en: "Standard balanced line with 3 front (y=1) and 3 rear (y=4)",
    },
    points: [
      { x: -2, y: 1 },
      { x: 0, y: 1 },
      { x: 2, y: 1 },
      { x: -2, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 4 },
    ],
  },
  {
    id: "three_row",
    name: { ko: "3열 종심진", en: "3-Row Depth" },
    shortName: { ko: "3열", en: "3-Row" },
    desc: {
      ko: "선봉 2명(y=0) · 중위 2명(y=2) · 후위 2명(y=4) 3단 종심 진형",
      en: "3-row depth with 2 vanguard (y=0), 2 mid (y=2), and 2 rear (y=4)",
    },
    points: [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: -2, y: 2 },
      { x: 2, y: 2 },
      { x: -1, y: 4 },
      { x: 1, y: 4 },
    ],
  },
  {
    id: "v_wing",
    name: { ko: "V자 학익진", en: "V-Wing (Crane)" },
    shortName: { ko: "V자", en: "V-Wing" },
    desc: {
      ko: "양 날개 전진(y=0·2) + 중앙 본대 후방(y=4) 포위 사격 진형",
      en: "Enveloping V-shape with forward wings (y=0·2) and rear center (y=4)",
    },
    points: [
      { x: -4, y: 0 },
      { x: 4, y: 0 },
      { x: -2, y: 2 },
      { x: 2, y: 2 },
      { x: -1, y: 4 },
      { x: 1, y: 4 },
    ],
  },
  {
    id: "wedge",
    name: { ko: "역V 쐐기진", en: "Wedge (Arrow)" },
    shortName: { ko: "역V", en: "Wedge" },
    desc: {
      ko: "중앙 선봉 돌파(0,0) + 좌우 날개 계단식(y=1·3) 돌격 진형",
      en: "Assault wedge led by center point (0,0) with stepped wings (y=1·3)",
    },
    points: [
      { x: 0, y: 0 },
      { x: -2, y: 1 },
      { x: 2, y: 1 },
      { x: 0, y: 3 },
      { x: -4, y: 3 },
      { x: 4, y: 3 },
    ],
  },
  {
    id: "phalanx",
    name: { ko: "방진 · 호위진", en: "Box Escort" },
    shortName: { ko: "방진", en: "Box" },
    desc: {
      ko: "중앙 핵심(0,2)을 전방·좌우·후방에서 감싸 보호하는 호위 진형",
      en: "Protective box surrounding the center unit (0,2) on all sides",
    },
    points: [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: -3, y: 2 },
      { x: 3, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 4 },
    ],
  },
  {
    id: "wide_line",
    name: { ko: "횡대 산개진", en: "Wide Skirmish" },
    shortName: { ko: "산개", en: "Wide" },
    desc: {
      ko: "광역 스킬 피해 분산을 위해 좌우 폭(-4~+4)으로 넓게 벌린 진형",
      en: "Wide lateral spread (-4..+4) to minimize area-of-effect damage",
    },
    points: [
      { x: -3, y: 0 },
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: -4, y: 3 },
      { x: 0, y: 3 },
      { x: 4, y: 3 },
    ],
  },
];

export function isValidFormationPoint(point: FormationPoint): boolean {
  return (
    Number.isInteger(point.x) &&
    point.x >= FORMATION_X_MIN &&
    point.x <= FORMATION_X_MAX &&
    Number.isInteger(point.y) &&
    point.y >= FORMATION_Y_MIN &&
    point.y <= FORMATION_Y_MAX
  );
}

/** 전후 깊이 y(0..5) → 전열·중열·후열 분류 */
export function rowFromFormationY(y: number): "front" | "middle" | "back" {
  return y <= 1 ? "front" : y <= 3 ? "middle" : "back";
}

/** 전열·중열·후열 + 같은 줄 순번 → 기본 시작 좌표(x, y) */
export function formationPointFromRow(row: "front" | "middle" | "back", indexInRow: number): FormationPoint {
  const y = row === "front" ? 0 : row === "middle" ? 3 : 5;
  const offsets = [0, -2, 2, -4, 4, -1, 1, -3, 3];
  const x = offsets[indexInRow] ?? 0;
  return { x, y };
}

/** 프리셋에서 순번(0~5)의 기본 좌표를 돌려준다 */
export function presetFormationPoint(index: number, presetId: FormationPresetId = "two_row"): FormationPoint {
  const preset = FORMATION_PRESETS.find((entry) => entry.id === presetId) ?? FORMATION_PRESETS[0]!;
  return preset.points[index % preset.points.length] ?? { x: 0, y: 0 };
}

/** 파티원 하나(유닛·역할·순번·시작 좌표) */
export interface RosterPartyMember {
  readonly unit: string;
  readonly role: PartyRole;
  /** 편성 순번(0~5) */
  readonly spot: number;
  /** 시작 좌표(배치 사각형 안: x = -4..+4, y = 0..5) */
  readonly x?: number | undefined;
  readonly y?: number | undefined;
}

/** 파티(D-179: 최대 6, 진형 저장). 시안만 */
export interface RosterParty {
  readonly id: string;
  readonly name: string;
  /** 기본 진형 프리셋 ID */
  readonly preset?: FormationPresetId | undefined;
  readonly members: readonly RosterPartyMember[];
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

/** 무기 몫 하나의 적정 비율(D-502): 보는 1차 스탯·무기 적정(밀리점, 0 = 없음 → 100%, 맨손 DEX·AGI는 레벨 식)·비율(‰, 상한 N10) */
export interface RosterWeaponPart {
  readonly stat: number;
  readonly appropriateMilli: number;
  readonly ratioPm: number;
}

/**
 * 판정에 들어가는 공격 값(서버가 전투 사양 specFromStats와 같은 함수로 셈해 보낸다, 기기는 보이기만). 입은 장비(굴린 값·무기 사양,
 * 내구도 > 0만)가 든 몸이고 걸린 효과(버프)는 뺀 기본이다 — 버프 몫은 CyborgBody.buffs(docs/adr/2026-11-03-item-holdings.md
 * "바뀜 (2026-11-07, 입은 장비·버프 → 스탯·전투)", "바뀜 (2026-11-07, 사이보그 판 버프 몫 …)").
 * 공격력 = 스탯 공격력 + 무기 공격력 × 비율(STR·INT), 명중·크리 = 무기 값 × 비율(DEX), 간격 = 무기 간격 ÷ 비율(AGI)(D-502),
 * 스태미나 회복 = 행 값 × min(2, STA 점수 ÷ 적정 STA)(D-511 real_stamina_regen)
 */
/** 판정이 쓴 계산식 하나(사용자 결정 D-556): 식 ID와 그 식을 다시 읽을 수 있는 글(설명 뺀 plain 글, @terra/shared/formulaText) */
export interface RosterFormulaSource {
  readonly id: string;
  readonly source: string;
}

export interface RosterCombat {
  /**
   * 줄마다 판정이 쓴 계산식(사용자 결정 D-556 "공식이 안써있고 … 공식이 뭐냐?" — 화면이 같은 식을 글로 풀어 보인다). 맨손이면 맨손 칸
   * (bare_hit·bare_crit·bare_interval). 옛 서버는 없음(화면은 옛 문구)
   */
  readonly formulas?:
    | {
        readonly attack: RosterFormulaSource;
        readonly hit: RosterFormulaSource;
        readonly crit: RosterFormulaSource;
        readonly interval: RosterFormulaSource;
        readonly staminaRegen: RosterFormulaSource;
      }
    | undefined;
  /** 든 무기 아이템 ID(names.items). 맨손이면 null(D-490: 맨손 스킬만) */
  readonly weapon: string | null;
  readonly attack: {
    readonly kind: "physical" | "elemental";
    readonly statAttack: number;
    readonly weaponAttack: number;
    readonly part: RosterWeaponPart;
    readonly real: number;
  };
  readonly hit: {
    readonly weaponPm: number;
    readonly part: RosterWeaponPart;
    readonly real: number;
    /** 맨손 자료로 셈했나(맨손 식 bare_hit, 기본 늘 1000‰ — 사용자 결정 2026-11-12 "맨손 항상 100%"). 없으면 무기 틀 */
    readonly bare?: boolean | undefined;
  };
  readonly crit: {
    readonly weaponPm: number;
    readonly part: RosterWeaponPart;
    readonly real: number;
    /**
     * 맨손 자료로 셈했나(맨손 식 bare_crit, 사용자 결정 2026-11-12): 있으면 크리 = AGI + DEX ‰(기본 식)이고 part.stat = DEX,
     * agi = AGI다. 없으면 무기 틀(무기 크리 × 비율). 옛 서버는 없음
     */
    readonly bare?: { readonly agi: number } | undefined;
  };
  readonly interval: {
    readonly weaponMs: number;
    readonly part: RosterWeaponPart;
    readonly real: number;
    /** 맨손 기본 공격 간격(맨손 식 bare_interval, 사용자 답 1252 — 기본 2,000 ÷ (AGI ÷ 레벨 기준 AGI)², 0.25~5초). part.stat = AGI. 없으면 무기 틀 */
    readonly bare?: boolean | undefined;
  };
  readonly staminaRegen: {
    /** 2차 스탯 행 stamina_regen 값(적정 STA에서의 분당 회복) */
    readonly row: number;
    readonly score: number;
    readonly appropriateMilli: number;
    /** 실제 분당 회복(판정 값) */
    readonly real: number;
  };
}

/**
 * 이동 속도(사이보그 판 기동 묶음, 사용자 요청 2026-11-12 "기동에 이동속도가 왜 없는가?"). 걷기 속도 = 계산식 walk_speed(실효 AGI)
 * (사용자 결정 D-540 "걷기만 AGI 반영" — 기본 + AGI × 가중치, 상한). 차·배는 수단 속도(D-5052). 전투맵 걸음은 유닛 데이터(D-223).
 * 서버가 실제로 쓰는 값을 그대로 보낸다(@terra/sim walkSpeedOf·CELL_UNITS, 전투 사양의 걸음 간격). 전투 수치 버프 move_speed 몫은
 * RosterBuffs.moveSpeedPm(전투맵만)
 */
export interface RosterMove {
  /** 2차맵 걷기 빠르기(단위/초) — 서버 유닛 speed(계산식 walk_speed, 실효 AGI) */
  readonly walk: number;
  /** 걷기 속도에 든 실효 AGI(성장값 + 장비·버프 − 부상, 전투와 같은 값). 옛 서버는 없음 */
  readonly agi?: number | undefined;
  /** 계산식 walk_speed의 AGI 0 값(기본, 단위/초). 옛 서버는 없음 */
  readonly walkBase?: number | undefined;
  /** 계산식 walk_speed의 상한(아주 큰 AGI의 값, 단위/초). 옛 서버는 없음 */
  readonly walkCap?: number | undefined;
  /** 배치 칸 한 칸의 단위 수(1024) */
  readonly cellUnits: number;
  /** 2차맵 한 변의 배치 칸 수(256, 한 장을 건너는 시간 셈) */
  readonly mapCells: number;
  /** 전투맵 한 칸 걷는 간격(ms, 버프 전) */
  readonly battleMs: number;
}

/**
 * 원자재 하나의 채집 예상(사이보그 판 효율 묶음, 사용자 요청 2026-11-12 "효율에 스탯에 따른 원자재별 티어구간이나 최적 작업을 보여줌").
 * 서버가 판정과 같은 함수로 셈한다(@terra/sim workerEffects — 유효 스탯·해금 티어·진행·수확량·성공 확률, @terra/shared/gatherMath
 * gatherBandIndex — 팩 gather_tiers 구간). 시설 레벨은 일하는 채집 시설이면 그 레벨, 아니면 1. 최적 작업 = 시간당 기대 금액(D-562 1569)
 */
export interface RosterGather {
  /** 채집 시설 ID(팩 facilities)와 이름 */
  readonly facility: string;
  readonly name: LocalizedName;
  /** 주 중분류(ore·wood·herb·crop·livestock_product·fish, 그림 고르기)와 이름 */
  readonly subcategory: string;
  readonly material: LocalizedName;
  /** roll = 확률표 추첨, select = 해금 티어에서 고름(농장·목장) */
  readonly mode: "roll" | "select";
  readonly primary: PrimaryStat;
  readonly secondary: PrimaryStat;
  /** 1차 값(몸 + 장비·버프) */
  readonly primaryValue: number;
  readonly secondaryValue: number;
  /** 컨디션(관리 보너스, 상한으로 자른 값, 모르면 0) */
  readonly condition: number;
  /** 추첨 유효 스탯 = 주 + 보조 + 컨디션(시설 레벨 1) */
  readonly stat: number;
  /** 유효 스탯이 든 구간의 시작과 다음 구간 시작(마지막이면 null) */
  readonly bandFrom: number;
  readonly bandNext: number | null;
  /** T0~T9 확률(‰, 합 1000). select는 기르는 티어 한 칸 1000 */
  readonly tierPm: readonly number[];
  /** 건물 채집소(select)가 기르는 티어 = 그 레벨의 최고 티어(2 × 레벨 − 1, 기획 D-566 1721). select가 아니면 쓰지 않는다 */
  readonly selectTier: number;
  /**
   * 건물 채집소 수확 배율(‰ — 권장 스탯 미달 효율 × 면적 모듈, D-566 1721·D-567)과 그 티어의 권장 스탯 합(20 × 티어)·셈한 면적 모듈 수.
   * select만, 옛 서버면 없음
   */
  readonly yieldPm?: number | undefined;
  readonly recommendedStat?: number | undefined;
  readonly plots?: number | undefined;
  /** 진행 속도(틱마다)·한 번 캘 때 개수 */
  readonly progress: number;
  readonly yieldPerLot: number;
  /** 한 번 시도의 성공 ‰(낚시터). 없으면 늘 성공 */
  readonly catchPm?: number | undefined;
  /**
   * 낚시터 물 종류마다(얕은 것부터) 범위와 그 범위로 접은 T0~T9 확률(‰, 기획 D-542 질문 1365 나 — @terra/shared/fishWater foldTierPm).
   * 어류 시설만, 옛 서버면 없음
   */
  readonly waters?:
    | readonly {
        readonly water: FishWater;
        readonly min: number;
        readonly max: number;
        readonly tierPm: readonly number[];
      }[]
    | undefined;
  /** 셈에 쓴 시설 레벨(일하는 채집 시설이면 그 레벨, 아니면 1 — 기획 D-556 1255). 옛 서버면 없음 */
  readonly level?: number | undefined;
  /**
   * 시간당 기대 금액(최소 단위 정수 문자열, 기획 D-556 1256·D-562 1569): 확률 × 그 티어 아이템 시세 × 개수 ÷ 걸리는 시간. 시세 = 그 유닛이
   * 있는 도시 거래소의 마지막 체결가(priceSource market), 없으면 시작 시세(start). 옛 서버면 없음
   */
  readonly valuePerHour?: string | undefined;
  readonly priceSource?: "market" | "start" | undefined;
  /** 그 도시 화폐 코드(모르면 없음) */
  readonly currency?: string | undefined;
  /** 이 유닛의 최적 작업(시간당 기대 금액이 가장 큰 일 — 금액이 없으면 주 + 보조가 가장 큰 1차 생산) */
  readonly best: boolean;
}

/**
 * 버프·디버프가 바꾸는 전투 수치(효과 사전 stat 가운데 1차 스탯이 아닌 것). @terra/content EFFECT_COMBAT_STATS·@terra/sim ModifierStat과
 * 같은 목록이다(이 꾸러미는 다른 내부 꾸러미를 가져오지 않는다 — 서버 시험이 둘이 같은지 본다)
 */
export const ROSTER_MODIFIER_STATS = [
  "attack",
  "defense_rate",
  "evade",
  "penetration",
  "crit_multiplier",
  "move_speed",
  "shield_regen",
] as const;
export type RosterModifierStat = (typeof ROSTER_MODIFIER_STATS)[number];

/**
 * 사이보그 판의 버프 몫(질문 354 → 기획 D-515: 기본값과 버프를 나눠 보인다, D-448). 서버가 판정과 같은 함수로 셈해 보낸다.
 * 줄 값(CyborgBody.breakdown·combat = 걸린 효과를 뺀 기본) + 이 몫 = 판정에 들어가는 값. 1차 스탯 줄은 primarySources의 effect가 몫이다.
 * 걸린 효과: 1차 스탯 버프(고정값, 성장값 뒤에 더함 48 §2.3 → 가중치로 2차 행을 바꾼다)와 전투 수치 버프(전투 시작 때 판정의 걸린 효과로
 * 드는 공격 ‰·방어율·회피·관통·크리 배율·이동 속도·쉴드 재생 — docs/adr/2026-11-03-item-holdings.md "바뀜 (2026-11-07, 사이보그 판 버프 몫 …)")
 */
export interface RosterBuffs {
  /**
   * 2차 행 ID → 몫(행 단위, 0이 아닌 행만): 1차 스탯 버프가 바꾼 몫 + 그 행을 바꾸는 전투 수치 버프(방어율·회피·크리 배율 = ‰ 더하기,
   * 쉴드 재생 = ‰ 배율. 판정 withDefenseModifiers·withAttackModifiers·shieldRegenPerMinute와 같은 셈)
   */
  readonly rows: Readonly<Record<string, number>>;
  /** 판정 값 줄의 몫: 실제 공격력(공격 ‰ 배율까지 — 피해에 곱하는 버프 항을 공격력 단위로), 명중·크리(‰), 간격(ms), 실제 스태미나 회복 */
  readonly attack: number;
  readonly hit: number;
  readonly crit: number;
  readonly interval: number;
  readonly staminaRegen: number;
  /** 관통(‰): 기본(장비, 2차 행이 없다)과 버프 몫 */
  readonly penetration: { readonly basePm: number; readonly buffPm: number };
  /** 이동 속도 몫(‰, 기본 1000 = 100%. 판정 moveIntervalMs와 같은 하한을 넣은 값) */
  readonly moveSpeedPm: number;
  /** 전투 수치 버프 합(‰, 판정 modifiersOf와 같은 합: 버프 +, 디버프 −) — 펼친 줄의 풀이 */
  readonly modifiers: Readonly<Record<RosterModifierStat, number>>;
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
   * 신앙도(D-451: 쌓이는 점수, 환생 조건의 문턱이고 쓰지 않는다. 환생하면 0, 개종하면 0). 0~100(규칙 sim UnitFaith.faith).
   * 얻는 길은 REL-1 종교 활동(기도·헌금·의식·종교 의뢰, 신앙 시설 46 §7)이고 아직 없다
   */
  readonly faith: number;
  /** 종교 코드(신앙 콘텐츠 ID, D-451). 없으면 null(지금은 종교를 고르는 길이 없어 늘 null) */
  readonly religion: string | null;
  /** 신앙 포인트(D-451: 그 종교의 특수 시스템·버프·아이템에 쓰는 잔고, 개종하면 0) */
  readonly faithPoints: number;
  /**
   * 생활비(D-453: 유닛 유지비 D-150을 본체도 낸다). unpaid = 마지막 유지비를 못 냄 → 효율 efficiencyPm(N38 ‰)으로 돈다(멈추지 않음).
   * 보유 유닛 수(주거 상한 D-153)에는 세지 않는다
   */
  readonly living: { readonly unpaid: boolean; readonly efficiencyPm: number };
  /** 컨디션(관리 보너스, D-534). 시안·옛 서버·세계 준비 전이면 없음 */
  readonly condition?: RosterCondition | undefined;
  readonly stats: RosterStats;
  /**
   * 2차 스탯 풀이(stats.secondary와 같은 행, 상세 전투 스펙의 펼친 줄). 값은 걸린 효과를 뺀 기본이다: 버프가 없으면 stats.secondary와 같고,
   * 있으면 기본 + buffs.rows가 판정 값이다(1차 스탯 버프는 stats.secondary에 이미 들어 있다)
   */
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
   * 1차 스탯마다 합쳐진 값의 출처(핵심 사양 막대를 누르거나 올리면 보이는 상세, ADR 2026-11-01-ui-visibility "바뀜"). 더하면
   * stats.primaries의 base + bonus와 같다. 몸 값은 평소 하나(body), K가 보이는 곳(만렙, D-449)에서는 처음 값(initial)·레벨 성장(growth, K‰)
   */
  readonly primarySources: Readonly<Record<PrimaryStat, readonly RosterPrimarySource[]>>;
  /**
   * 속성값 12칸(0~10, D-182, 차례 = ELEMENT_CODES). 출처는 생성·환생 분배(4원소, 종교 환생 빛·어둠), 인공장기·장비, 신앙(D-450)이고
   * 칸마다 10에서 자른다(@terra/shared cyborgElements sumElementSources). 지금 출처는 저장된 생성·환생 값 하나다(장비·신앙 출처는
   * 데이터 고리). 분배가 없는 옛 사이보그는 모두 0(다음 접속 때 한 번 나눈다)
   */
  readonly elements: readonly number[];
  readonly slots: readonly RosterSlot[];
  readonly skills: RosterSkills;
  /** 스킬 칸 최대(팩 unit_kinds skillSlots.max)와 아직 닫힌 칸이 열리는 환생 횟수(칸마다, 오름차순) */
  readonly skillSlotsMax: number;
  readonly skillSlotUnlocks: readonly number[];
  readonly fatigue: { readonly value: number; readonly max: number };
  /**
   * 판정에 들어가는 공격·스태미나 회복 값(만든 사이보그만, 시안·옛 서버는 없음 → 화면은 2차 스탯 행만 보인다). 걸린 효과를 뺀 기본이고,
   * 버프 몫은 buffs
   */
  readonly combat?: RosterCombat | undefined;
  /** 버프 몫(만든 사이보그만, 걸린 효과가 없으면 0들). 없으면(시안·옛 서버) 화면은 몫을 보이지 않는다 */
  readonly buffs?: RosterBuffs | undefined;
  /** 이동 속도(기동 묶음 줄, 사용자 요청 2026-11-12). 없으면(옛 서버) 버프 몫이 있을 때만 줄을 보인다 */
  readonly move?: RosterMove | undefined;
  /** 원자재별 채집(효율 묶음 줄, 사용자 요청 2026-11-12, 팩 차례). 없으면(채집 시설 표가 없는 서버·옛 서버) 줄 없음 */
  readonly gather?: readonly RosterGather[] | undefined;
  readonly inventory: readonly CyborgItem[];
  readonly rankings: readonly CyborgRanking[];
  /** 시안 자료인지(만든 사이보그면 false) */
  readonly preview: boolean;
}

/**
 * 사이보그 환생 조건·비용(D-440·D-441·D-444·D-451, 팩 tuning 설정값 — 본체가 없어도 규칙이라 늘 보낸다).
 * 최고 레벨(N7 `n7_max_level`), 신앙도 문턱(N34 `n34_rebirth_faith`, 0~100 척도, 쓰지 않고 환생하면 0 — D-451), 화폐(N34
 * `n34_rebirth_currency`, 환생 시설이 있는 도시 화폐의 최소 단위 정수 글자), 분포 다시 굴리기 횟수(N9 `n9_initial_rerolls`, 생성과 같은
 * 값 — D-444 164). 진로별 종교 아이템(빛·어둠 갈래 또는 종교 특수 스킬, D-452)은 고르는 칸이라 여기에 없다
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
  /**
   * 3D 외형(만든 사이보그만, 없으면 null — docs/adr/2026-11-11-character-3d.md 5절. 옛 2D만 있던 사이보그는 서버가 넘겨 채웠다). 옛 2D 칸
   * appearance는 뺐다(기획 D-560 1421)
   */
  readonly look: CharacterLook | null;
  /**
   * 3D 외형을 한 번 고를 수 있다(질문 961 나): 서버가 옛 2D 외형에서 넘겨 채운 사이보그. 고르면(WebSocket cyborg_look)
   * false가 되고 다시 true가 되지 않는다. 시안·옛 서버면 없음(= 못 고름)
   */
  readonly lookPick?: boolean;
  /** 본체 자료(만든 사이보그 또는 시안, 없으면 null) */
  readonly body: CyborgBody | null;
  /** 보유 유닛 수(실제 세계 유닛, 포로로 잡힌 유닛 포함) */
  readonly unitCount: number;
  readonly names: RosterNames;
  readonly preview: boolean;
  readonly generatedAt: number;
}
