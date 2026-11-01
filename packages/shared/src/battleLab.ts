// 밸런스·전투 실험실(/dev/balance [전투 실험실] 탭) 공용 자료 모양 — docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)"
// 서버(tRPC battleLab.*, apps/server/src/battleLab/)와 화면(apps/game/src/editor/balance/lab/)이 같이 쓴다. 계산은 서버만 한다
// (기기는 판정 코드를 받지 않는다). 1차 스탯 키는 roster의 PrimaryStat, 속성 칸 차례는 ELEMENT_CODES(12칸)다.
// 수치 칸의 범위는 실험 도구의 입력 범위(넘침·비용 방지)이지 게임 규칙이 아니다.
import type { LocalizedName, PrimaryStat } from "./roster.ts";
import { hasUnstorableText } from "./settings.ts";

/** 1차 스탯 6개 */
export type LabPrimaries = Readonly<Record<PrimaryStat, number>>;

/** 진형 줄(전열·중열·후열): 전열이 적에게 가장 가깝다 */
export const LAB_ROWS = ["front", "middle", "back"] as const;
export type LabRow = (typeof LAB_ROWS)[number];

/** 입력 범위(서버 검사·화면 같이) */
export const LAB_LIMITS = {
  levelMin: 1,
  /** 레벨 상한(만렙 설정 칸 N7의 팩 범위 끝과 같다) */
  levelMax: 999,
  rebirthsMax: 50,
  primaryMin: 0,
  primaryMax: 10_000,
  /** K(‰). 생성 범위(N6)는 화면이 따로 보인다 */
  kMin: 0,
  kMax: 10_000,
  elementMax: 10,
  skillGradeMin: 1,
  skillGradeMax: 10,
  /** 무기·장비 직접 값 한 칸의 절댓값 상한 */
  valueMax: 1_000_000,
  /** 관통·저항(‰) */
  pmMax: 1000,
  /** 파티 인원(49 C6 구조 값 6) */
  partyMax: 6,
  /** 유닛 표시 이름(화면에서만) */
  labelMax: 40,
  /** 프리셋 이름(ko·en 따로) */
  nameMax: 40,
  /** 팀이 만든 프리셋 수 상한 */
  presetsMax: 200,
  /** 한 판 제한 시간(초) */
  limitSecMin: 30,
  limitSecMax: 600,
  /** 몬테카를로 판 수(짝수: 편을 반씩 바꾼다) */
  runsMin: 2,
  runsMax: 200,
  /** 몬테카를로 판 수 × 제한 시간(초) 상한(NAS 부담) */
  runSecondsMax: 12_000,
  /** 퇴각 기준선(파티 HP %, ⑦). 0 = 쓰지 않음 */
  retreatMax: 99,
  /** 한 판 사건 기록 줄 상한 */
  logMax: 400,
} as const;

/** 무기 공격력 칸 하나(D-465) */
export interface LabWeaponField {
  readonly attack: number;
  readonly appropriate: number;
}

/** 직접 만든 무기(D-465 물리·속성 칸, basic = 기본 공격 칸). 속성 옵션 계수는 12칸 ‰ */
export interface LabCustomWeapon {
  readonly physical: LabWeaponField | null;
  readonly elemental: LabWeaponField | null;
  readonly basic: "physical" | "elemental";
  readonly hitPm: number;
  readonly hitAppropriate: number;
  readonly critPm: number;
  readonly critAppropriate: number;
  readonly intervalMs: number;
  readonly speedAppropriate: number;
  readonly range: number;
  readonly arc: boolean;
  readonly staminaCost: number;
  readonly mpCost: number;
  readonly elementsPm: readonly number[];
}

/** 무기: 유닛 종류의 타고난 무기, 팩 무기 아이템, 직접 값 */
export type LabWeapon =
  | { readonly kind: "natural" }
  | { readonly kind: "item"; readonly id: string; readonly pm: number }
  | { readonly kind: "custom"; readonly spec: LabCustomWeapon };

/** 장비 칸 하나: 유닛 종류 칸 번호(팩 unit_kinds slots 차례), 팩 장비 ID, 범위 안 자리(‰, 0 = 최소 ~ 1000 = 최대) */
export interface LabEquip {
  readonly slot: number;
  readonly item: string;
  readonly pm: number;
}

/** 장비 직접 값(장비 모델 그대로): 2차 행 더하기(공격력 두 행 제외 D-438), 고정 방어, 관통‰, 속성별 저항‰ 12칸, 1차 보너스 */
export interface LabGear {
  readonly rows: readonly { readonly id: string; readonly value: number }[];
  readonly defenseFlat: number;
  readonly penetrationPm: number;
  readonly resistPm: readonly number[];
  readonly primaries: LabPrimaries;
}

export interface LabSkill {
  readonly id: string;
  readonly grade: number;
}

/** 실험 유닛 하나 */
export interface LabUnit {
  /** 화면 표시 이름(빈 글이면 종류 이름) */
  readonly label: string;
  /** 팩 unit_kinds ID */
  readonly kind: string;
  readonly level: number;
  /** 환생 횟수(스킬 칸 수 = 종 기본 + 환생, 상한) */
  readonly rebirths: number;
  readonly initial: LabPrimaries;
  readonly kPm: LabPrimaries;
  /** 속성값 12칸(0~10, ELEMENT_CODES 차례) */
  readonly elements: readonly number[];
  readonly weapon: LabWeapon;
  readonly equipment: readonly LabEquip[];
  readonly gear: LabGear;
  /** 스킬(목록 차례 = AI 우선순위, 전투 코어 [임시] 규칙). 칸 수를 넘는 것은 쓰지 않는다 */
  readonly skills: readonly LabSkill[];
  readonly row: LabRow;
}

/** 파티 하나(편마다 하나) */
export interface LabParty {
  readonly units: readonly LabUnit[];
  /** 퇴각 기준선(⑦, 파티 HP %). 0이면 쓰지 않는다 */
  readonly retreatHpPct: number;
}

export const LAB_TEAMS = ["a", "b"] as const;
export type LabTeam = (typeof LAB_TEAMS)[number];

const zeros12 = (): number[] => Array.from({ length: 12 }, () => 0);
const flat = (value: number): LabPrimaries => ({
  str: value,
  vit: value,
  int: value,
  wis: value,
  dex: value,
  agi: value,
});

/** 빈 장비 직접 값 */
export function emptyLabGear(): LabGear {
  return { rows: [], defenseFlat: 0, penetrationPm: 0, resistPm: zeros12(), primaries: flat(0) };
}

/** 새 유닛 기본값(새 사이보그 평균: 1차 모두 10·K 1000·레벨 1·맨손 — 서버 BASELINE_PRIMARY와 같다). 종류는 부르는 쪽이 준다 */
export function newLabUnit(kind: string): LabUnit {
  return {
    label: "",
    kind,
    level: 1,
    rebirths: 0,
    initial: flat(10),
    kPm: flat(1000),
    elements: zeros12(),
    weapon: { kind: "natural" },
    equipment: [],
    gear: emptyLabGear(),
    skills: [],
    row: "front",
  };
}

/** 사이보그 생성 규칙(D-450): 4원소(물·불·바람·땅 = 칸 0·2·4·6) 가운데 두 칸 이하에 합 10, 나머지 칸 0 */
export const LAB_BASIC_ELEMENTS = [0, 2, 4, 6] as const;

/** 속성값이 생성 규칙에 맞나(실험 도구는 막지 않고 보이기만 한다) */
export function labElementsFitCreation(elements: readonly number[], points = 10, cells = 2): boolean {
  let sum = 0;
  let used = 0;
  for (let i = 0; i < 12; i++) {
    const value = elements[i] ?? 0;
    if (value === 0) continue;
    if (!(LAB_BASIC_ELEMENTS as readonly number[]).includes(i)) return false;
    sum += value;
    used += 1;
  }
  return sum === points && used <= cells;
}

/** 계열 값(D-457: 같은 계열 두 칸 1:1 합, 최대 20) 6개 */
export function labFamilyValues(elements: readonly number[]): number[] {
  return Array.from(
    { length: 6 },
    (_, family) => (elements[family * 2] ?? 0) + (elements[family * 2 + 1] ?? 0),
  );
}

function codePointLength(text: string): number {
  let length = 0;
  for (const _ of text) length += 1;
  return length;
}

/** 제어 문자(줄바꿈·탭 포함, C0·DEL·C1)가 있나 */
function hasControl(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return true;
  }
  return false;
}

/** 프리셋 이름 정리(앞뒤 공백 자름). 1~40자·제어 문자 없음·jsonb에 넣을 수 있는 글이면 그 이름, 아니면 null */
export function normalizeLabName(raw: unknown, max: number = LAB_LIMITS.nameMax): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  const length = codePointLength(name);
  if (length === 0 || length > max) return null;
  if (hasControl(name) || hasUnstorableText({ name })) return null;
  return name;
}

/** 프리셋 종류 */
export type LabPresetKind = "unit" | "party";

/** 프리셋 출처: 코드의 샘플(읽기 전용, 수치 [임시]) 또는 팀이 만든 것(DB) */
export type LabPresetSource = "sample" | "team";

interface LabPresetBase {
  readonly id: string;
  readonly name: LocalizedName;
  readonly source: LabPresetSource;
  /** 줄 판(팀 프리셋 동시 편집 충돌, 샘플은 0) */
  readonly version: number;
  readonly updatedBy: string | null;
  readonly updatedAtMs: number | null;
}

export type LabPresetView =
  | (LabPresetBase & { readonly kind: "unit"; readonly data: LabUnit })
  | (LabPresetBase & { readonly kind: "party"; readonly data: LabParty });

export interface LabPresetListResponse {
  readonly presets: readonly LabPresetView[];
  /** DB 줄 가운데 지금 규칙에 맞지 않아 빼고 보인 수 */
  readonly invalid: number;
  /** 쓸 수 있나(DB가 있고 쓰기 권한) */
  readonly writable: boolean;
}

/** 저장 입력: id 없으면 새로 만든다(복제도 이것), 있으면 그 판만 바꾼다 */
export type LabPresetSaveInput =
  | {
      readonly id?: string | undefined;
      readonly expectedVersion?: number | undefined;
      readonly kind: "unit";
      readonly name: LocalizedName;
      readonly data: LabUnit;
    }
  | {
      readonly id?: string | undefined;
      readonly expectedVersion?: number | undefined;
      readonly kind: "party";
      readonly name: LocalizedName;
      readonly data: LabParty;
    };

/** 서버가 받지 않은 까닭(오류 data.reason) */
export const LAB_REASONS = [
  "invalid_unit",
  "invalid_settings",
  "unknown_terrain",
  "busy",
  "rate_limited",
  "timeout",
  "failed",
  "invalid_preset",
  "unknown_preset",
  "preset_conflict",
  "too_many_presets",
  "sample_read_only",
  "replay_unavailable",
] as const;
export type LabReason = (typeof LAB_REASONS)[number];

/** 사양을 만들 때 뺀 참조(팩이 바뀌었거나 칸이 맞지 않음). 화면이 경고로 보인다 */
export interface LabDropped {
  readonly kind: "skill" | "item" | "weapon" | "slot" | "gear_row";
  readonly id: string;
}

/** 무기 목록 한 줄(팩 무기 아이템) */
export interface LabWeaponView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly physical: LabWeaponField | null;
  readonly elemental: LabWeaponField | null;
  readonly basic: "physical" | "elemental";
  readonly range: number;
  readonly intervalMs: number;
}

export interface LabUnitKindView {
  readonly id: string;
  readonly name: LocalizedName;
  /** 장비 칸 종류(차례 = 칸 번호) */
  readonly slots: readonly string[];
  readonly skillSlots: { readonly base: number; readonly perRebirth: number; readonly max: number };
  /** 레벨·K 성장(안드로이드는 없음 D-416) */
  readonly growth: boolean;
  /** 타고난 무기(직접 값 편집의 출발값) */
  readonly natural: LabCustomWeapon;
}

export interface LabEquipmentView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly slot: string;
  readonly stats: readonly { readonly stat: string; readonly min: number; readonly max: number }[];
  readonly skills: readonly string[];
  readonly weapon: boolean;
}

export interface LabSkillView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly trigger: "active" | "passive";
  readonly resource: "stamina" | "mp";
  readonly base: "physical" | "elemental";
  readonly damage: "physical" | "elemental" | "none";
  readonly target: "enemy" | "self" | "ally";
  readonly cost: number;
  readonly castMs: number;
  readonly cooldownMs: number;
  readonly range: number;
  readonly radius: number;
}

export interface LabStatRowView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly shape: "quantity" | "probability";
  /** 장비 직접 값으로 더할 수 있나(공격력 두 행은 못 함 D-438) */
  readonly gear: boolean;
}

/** 전투장 지형 */
export interface LabTerrainView {
  readonly id: string;
  /** flat = 빈 평지, test = S1 시험 2차맵, preset = 시험 자리 종류(river·coast·lake·mountain·forest) */
  readonly kind: "flat" | "test" | "preset";
  readonly preset: string | null;
}

export interface LabCatalogResponse {
  readonly contentVersion: string;
  /** 세계 설정 판(실효 값이 바뀌면 오른다) */
  readonly revision: number;
  readonly unitKinds: readonly LabUnitKindView[];
  readonly weapons: readonly LabWeaponView[];
  readonly equipment: readonly LabEquipmentView[];
  readonly skills: readonly LabSkillView[];
  readonly statRows: readonly LabStatRowView[];
  /** 성장 실효 값: 성장률(N5)·K 생성 범위(N6)·만렙(N7) */
  readonly growth: {
    readonly growthPm: number;
    readonly kMinPm: number;
    readonly kMaxPm: number;
    readonly maxLevel: number;
  };
  readonly terrains: readonly LabTerrainView[];
  /** 3D 관람을 쓸 수 있나(재생 기록기가 들어온 서버) */
  readonly replay: boolean;
}

/** 2차 스탯 풀이 한 줄(화면 차례 1차 키) */
export interface LabSecondaryView {
  readonly id: string;
  readonly shape: "quantity" | "probability";
  readonly value: number;
  readonly base: number;
  readonly terms: readonly {
    readonly stat: PrimaryStat;
    readonly value: number;
    readonly weightPm: number;
  }[];
  readonly weighted: number;
  /** 장비(직접 값 + 팩 장비) 더하기 */
  readonly extra: number;
  readonly score: number;
  readonly cap: number | null;
  readonly halfConstant: number | null;
}

/** 공격 사양 하나(무기 틀 D-420: 실제 = 무기 값 × min(N10, 2차 점수 ÷ 적정)). source = 든 무기 또는 타고난 무기(맨손·맨손 속성) */
export interface LabAttackView {
  readonly source: "weapon" | "natural";
  readonly weaponAttack: number;
  /** 2차 공격 점수(물리·속성 공격력) */
  readonly attackStat: number;
  readonly appropriate: number;
  readonly realAttack: number;
}

export interface LabAppropriateView {
  readonly stat: number;
  readonly appropriate: number;
  readonly ratioPm: number;
}

/** 전투 사양 요약(판정에 들어가는 값) */
export interface LabCombatView {
  readonly maxHp: number;
  readonly armorHp: number;
  readonly shieldHp: number;
  readonly basic: "physical" | "elemental";
  /** 기본 공격의 무기 공격력·실제 공격력(무기 틀 min(2, 점수 ÷ 적정)) */
  readonly weaponAttack: number;
  readonly realAttack: number;
  /** 기본 공격(든 무기 또는 맨손)과 스킬 기반별 공격(D-465: 든 무기에 그 칸이 없으면 맨손·맨손 속성) */
  readonly attacks: {
    readonly basic: LabAttackView;
    readonly physical: LabAttackView;
    readonly elemental: LabAttackView;
  };
  /** 명중·크리·행동 속도의 2차 점수, 기본 공격 무기의 적정치, 무기 값에 곱하는 비율(‰ = min(N10 상한, 점수 ÷ 적정)) */
  readonly appropriate: {
    readonly hit: LabAppropriateView;
    readonly crit: LabAppropriateView;
    readonly speed: LabAppropriateView;
  };
  readonly hitPm: number;
  readonly critPm: number;
  readonly critMulPm: number;
  readonly attackIntervalMs: number;
  readonly range: number;
  readonly staminaMax: number;
  /** 기본 공격 한 번의 스태미나(STA 점수 배율 N13, 밀리점) */
  readonly staminaPerAttackMilli: number;
  readonly staminaRegen: number;
  readonly mpMax: number;
  readonly mpRegen: number;
  readonly shieldRegen: number;
  readonly defenseRatePm: number;
  readonly elementalDefenseRatePm: number;
  readonly evadePm: number;
  readonly sight: number;
}

export interface LabPreviewResponse {
  readonly revision: number;
  /** 1차: 처음·레벨 성장 뒤·장비 보너스·합 */
  readonly primaries: Readonly<
    Record<
      PrimaryStat,
      { readonly initial: number; readonly grown: number; readonly bonus: number; readonly total: number }
    >
  >;
  readonly secondary: readonly LabSecondaryView[];
  readonly combat: LabCombatView;
  /** 쓰는 스킬(칸 수 안, 고유 먼저 + 장비 스킬)과 칸 수 */
  readonly skills: { readonly slots: number; readonly used: readonly string[] };
  readonly dropped: readonly LabDropped[];
  /** 레벨 표: 레벨마다 1차 합과 2차 스탯(행 ID 차례 = secondary 차례) */
  readonly levels: readonly {
    readonly level: number;
    readonly primaries: LabPrimaries;
    readonly secondary: readonly number[];
  }[];
}

/** 전투 입력(한 판·몬테카를로·관람) */
export interface LabBattleInput {
  readonly a: LabParty;
  readonly b: LabParty;
  readonly terrain: string;
  readonly limitSec: number;
  readonly seed: number;
}

export interface LabMonteCarloInput extends LabBattleInput {
  readonly runs: number;
}

/** 한 판 사건 한 줄 */
export type LabBattleEvent =
  | {
      readonly kind: "attack";
      readonly ms: number;
      readonly unit: string;
      readonly target: string;
      readonly outcome: "hit" | "miss" | "evaded";
      readonly crit: boolean;
      readonly damage: number;
      readonly down: boolean;
    }
  | {
      readonly kind: "skill";
      readonly ms: number;
      readonly unit: string;
      readonly skill: string;
      /** 맞은 대상마다 피해(음수 = 회복) */
      readonly hits: readonly { readonly target: string; readonly damage: number; readonly down: boolean }[];
    }
  | {
      readonly kind: "cast";
      readonly ms: number;
      readonly unit: string;
      readonly skill: string;
      readonly target: string;
    }
  | {
      readonly kind: "dot";
      readonly ms: number;
      readonly target: string;
      readonly damage: number;
      readonly down: boolean;
    }
  | { readonly kind: "retreat"; readonly ms: number; readonly team: LabTeam };

/** 유닛 한 판 요약 */
export interface LabUnitSummary {
  /** 유닛 키: 팀 + 파티 안 차례(a0~a5, b0~b5) */
  readonly key: string;
  readonly team: LabTeam;
  readonly index: number;
  readonly dealt: number;
  readonly taken: number;
  readonly healed: number;
  readonly kills: number;
  readonly attacks: number;
  readonly skills: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly status: "alive" | "down" | "retreated";
}

export interface LabBattleResponse {
  readonly revision: number;
  /** 이긴 팀(시간 초과면 남은 몫 판정, 같으면 null) */
  readonly winner: LabTeam | null;
  readonly reason: "wipe" | "timeout" | "nexus";
  readonly endMs: number;
  /** 팀마다 남은 (HP + 아머 + 쉴드) 몫(‰) */
  readonly remainingPm: Readonly<Record<LabTeam, number>>;
  readonly units: readonly LabUnitSummary[];
  readonly events: readonly LabBattleEvent[];
  /** 기록 상한(logMax)을 넘어 뺀 사건 수 */
  readonly eventsDropped: number;
  readonly dropped: readonly LabDropped[];
  readonly ms: number;
}

/** 몬테카를로 유닛 한 줄(판 평균·생존율) */
export interface LabUnitStats {
  readonly key: string;
  readonly team: LabTeam;
  readonly index: number;
  readonly dealtAvg: number;
  readonly takenAvg: number;
  readonly killsAvg: number;
  /** 끝났을 때 서 있던 몫(‰) */
  readonly survivalPm: number;
}

export interface LabMonteCarloResponse {
  readonly revision: number;
  readonly runs: number;
  /** 팀마다 승(쓰러뜨림)·판정승 수, 승률(‰ = (승 + 판정승 + 같음 ÷ 2) ÷ 판 수) */
  readonly teams: Readonly<
    Record<LabTeam, { readonly wins: number; readonly timeoutWins: number; readonly scorePm: number }>
  >;
  /** 편 바꿈: normal = 팀 A가 서쪽(공격 편), swapped = 동쪽(수비 편). 판 수와 그때 팀 A 승률 */
  readonly sides: Readonly<
    Record<"normal" | "swapped", { readonly runs: number; readonly aScorePm: number }>
  >;
  /** 시간 초과 수와 그 가운데 남은 몫이 같은 판 */
  readonly timeouts: number;
  readonly timeoutEven: number;
  readonly avgMs: number;
  readonly medianMs: number;
  readonly units: readonly LabUnitStats[];
  readonly dropped: readonly LabDropped[];
  readonly ms: number;
}

/** 승률(‰) = (승 + 판정승 + 같음 ÷ 2) ÷ 판 수(대결 도구와 같은 판정, D-467 229) */
export function labScorePm(wins: number, timeoutWins: number, even: number, runs: number): number {
  if (runs <= 0) return 0;
  return Math.round(((wins + timeoutWins) * 1000 + even * 500) / runs);
}

/** 몬테카를로·한 판 설정이 상한 안인가(서버·화면 같이) */
export function labSettingsProblem(settings: {
  readonly limitSec: number;
  readonly runs?: number | undefined;
}): "limit" | "runs" | "budget" | null {
  const l = LAB_LIMITS;
  if (
    !Number.isInteger(settings.limitSec) ||
    settings.limitSec < l.limitSecMin ||
    settings.limitSec > l.limitSecMax
  )
    return "limit";
  const runs = settings.runs;
  if (runs === undefined) return null;
  if (!Number.isInteger(runs) || runs < l.runsMin || runs > l.runsMax || runs % 2 !== 0) return "runs";
  if (runs * settings.limitSec > l.runSecondsMax) return "budget";
  return null;
}

/** 유닛 키(팀 + 파티 안 차례) */
export function labUnitKey(team: LabTeam, index: number): string {
  return `${team}${index}`;
}
