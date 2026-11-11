// 유닛 추천(스탯으로 고르는 제안, 규칙 아님) — 사용자 요청 2026-11-11 "유닛 정보창에는 스탯에 따라 적합한 1차 생산직군 추천도 보이게 한다.
// 또한 전투계 스탯조합배열로도 적합한 클래스 추천 및 설명 추가", 기획 D-529(옛 35 클래스 그대로)·43 §4(1차 생산 여섯 가지 스탯 짝).
// docs/adr/2026-11-11-production-six.md. 서버(tRPC units.guide — 실효 팩 + 세계 덮어쓰기)가 표를 보내고, 화면과 편집기가 여기 함수로 고른다.
// - 1차 생산: 여섯 시설을 유효 스탯(주 + 보조, @terra/shared/gatherMath와 같은 합)으로 줄 세운다. 같으면 주 스탯이 큰 쪽, 그래도 같으면 표 차례.
// - 전투 클래스(옛 CHR-1 §6, AntiGravt01 game/class_detector.js): 여섯 스탯을 큰 차례로 세우고(같으면 STR·VIT·INT·WIS·DEX·AGI 차례)
//   S6 ÷ S1 ≥ 0.80이면 범용, 아니면 S3 ÷ S1 ≥ 0.60이면 위 세 스탯 조합(20종), 그 밖은 위 두 스탯 조합(15종). 문턱은 설정 칸(‰)이고
//   비교는 정수 곱으로 한다(S3 × 1000 ≥ S1 × 문턱). 모두 0이면 클래스 없음.
// 추천은 표시만 한다(직무·전투 판정에 쓰지 않는다).
import { type LocalizedName, PRIMARY_STATS, type PrimaryStat } from "./roster.ts";

/** 추천이 읽는 1차 스탯 값(몸 값 + 보너스) */
export type GuideStats = Readonly<Record<PrimaryStat, number>>;

/** 1차 생산 묶음(옛 생산 편집기 탭 줄): 필드채집(오브젝트에서 캠) · 건물생산(시설 안에서 기름·낚음) */
export type ProductionGroup = "field" | "building";

/** 1차 생산 종류 하나(팩 시설의 채집 칸) */
export interface ProductionTypeView {
  /** 시설 ID(팩 facilities) */
  readonly facility: string;
  readonly name: LocalizedName;
  /** 주 스탯(진행 속도) · 보조 스탯(수확량). 둘의 합이 유효 스탯(티어) */
  readonly primary: PrimaryStat;
  readonly secondary: PrimaryStat;
  /** roll = 확률표 추첨, select = 선택 + 효율(해금 티어) */
  readonly mode: "roll" | "select";
  readonly group: ProductionGroup;
}

/**
 * 시설 채집 칸 → 묶음: 선택 + 효율(농장·목장)이거나 성공 확률이 있으면(낚시터) 건물생산, 그 밖의 추첨(벌목장·광산·약초원)은 필드채집.
 * 옛 엔진 나눔(FieldGatherEngine = 광산·벌목장·약초원, BuildingGatherEngine = 농장·목장·낚시터)과 같다
 */
export function productionGroupOf(gather: {
  readonly mode?: "roll" | "select" | undefined;
  readonly catch?: unknown;
}): ProductionGroup {
  return gather.mode === "select" || gather.catch !== undefined ? "building" : "field";
}

/** 추천 한 줄 */
export interface ProductionPick {
  readonly type: ProductionTypeView;
  /** 유효 스탯 = 주 + 보조(레벨 보너스 없음) */
  readonly score: number;
  readonly primaryValue: number;
  readonly secondaryValue: number;
}

const clean = (value: number | undefined): number =>
  value === undefined || !Number.isFinite(value) ? 0 : Math.max(0, Math.floor(value));

/**
 * 1차 생산 추천: 유효 스탯(주 + 보조)이 큰 차례로 count개. 같으면 주 스탯이 큰 쪽(진행이 빠르다), 그래도 같으면 표 차례.
 * 표가 비면 빈 목록. 스탯이 모두 0이어도 차례대로 돌려준다(화면이 값과 함께 보인다)
 */
export function recommendProduction(
  stats: GuideStats,
  types: readonly ProductionTypeView[],
  count = 2,
): ProductionPick[] {
  return types
    .map((type, index) => {
      const primaryValue = clean(stats[type.primary]);
      const secondaryValue = clean(stats[type.secondary]);
      return { pick: { type, score: primaryValue + secondaryValue, primaryValue, secondaryValue }, index };
    })
    .toSorted(
      (a, b) => b.pick.score - a.pick.score || b.pick.primaryValue - a.pick.primaryValue || a.index - b.index,
    )
    .slice(0, Math.max(0, count))
    .map((row) => row.pick);
}

/** 스탯 하나가 주·보조로 쓰인 시설들 */
export interface StatCoverage {
  readonly stat: PrimaryStat;
  readonly primaryOf: readonly string[];
  readonly secondaryOf: readonly string[];
}

/**
 * 스탯 짝이 고르게 쓰였나(사용자 2026-11-11 "각각의 스탯이 주력 보조로 골고루 쓰이게"): 여섯 스탯마다 주로 쓰는 시설·보조로 쓰는 시설.
 * balanced = 스탯마다 주 하나·보조 하나이고 주와 보조가 같은 시설이 없다. 편집기는 알리기만 한다(막지 않는다)
 */
export function statCoverage(types: readonly ProductionTypeView[]): {
  readonly rows: readonly StatCoverage[];
  readonly sameStat: readonly string[];
  readonly balanced: boolean;
} {
  const rows = PRIMARY_STATS.map((stat) => ({
    stat,
    primaryOf: types.filter((type) => type.primary === stat).map((type) => type.facility),
    secondaryOf: types.filter((type) => type.secondary === stat).map((type) => type.facility),
  }));
  const sameStat = types.filter((type) => type.primary === type.secondary).map((type) => type.facility);
  return {
    rows,
    sameStat,
    balanced:
      sameStat.length === 0 &&
      rows.every((row) => row.primaryOf.length === 1 && row.secondaryOf.length === 1),
  };
}

/** 전투 클래스 묶음(옛 CHR-1 §6.2 분류 칸: 물리·마법·하이브리드). 3스탯 조합·범용에는 없다 */
export const COMBAT_CLASS_GROUPS = ["physical", "magic", "hybrid"] as const;
export type CombatClassGroup = (typeof COMBAT_CLASS_GROUPS)[number];

/** 전투 클래스 하나(팩 combat_classes 한 줄). stats 2개 = 2스탯 조합, 3개 = 3스탯 조합, 0개 = 범용 */
export interface CombatClassView {
  readonly id: string;
  readonly name: LocalizedName;
  readonly stats: readonly PrimaryStat[];
  readonly group?: CombatClassGroup | undefined;
  /** 주요 역할(옛 §6.2 "주요 역할" 칸). 없을 수 있다(3스탯 조합) */
  readonly role?: LocalizedName | undefined;
  readonly desc: LocalizedName;
}

/** 분류 문턱(‰, 설정 칸): 3스탯 조합 = S3 × 1000 ≥ S1 × threeStatPm, 범용 = S6 × 1000 ≥ S1 × generalistPm */
export interface CombatClassRule {
  readonly threeStatPm: number;
  readonly generalistPm: number;
}

/** 옛 값(CHR-1 §6.1): 0.60·0.80 */
export const OLD_COMBAT_CLASS_RULE: CombatClassRule = { threeStatPm: 600, generalistPm: 800 };

/** 같은 값일 때의 차례(옛 문서에 정한 것이 없어 화면 스탯 차례로 고정: STR·VIT·INT·WIS·DEX·AGI) */
export const CLASS_STAT_ORDER: readonly PrimaryStat[] = PRIMARY_STATS;

/** 조합 열쇠: 스탯을 CLASS_STAT_ORDER 차례로 세워 "+"로 잇는다(예: "str+vit", 범용은 "") */
export function classKey(stats: readonly PrimaryStat[]): string {
  return CLASS_STAT_ORDER.filter((stat) => stats.includes(stat)).join("+");
}

export type CombatClassKind = "none" | "generalist" | "three" | "two";

export interface CombatClassShape {
  /** none = 스탯이 모두 0 */
  readonly kind: CombatClassKind;
  /** 큰 차례로 세운 여섯 스탯(같으면 CLASS_STAT_ORDER 차례) */
  readonly ranked: readonly PrimaryStat[];
  /** 조합에 드는 스탯(two = 위 둘, three = 위 셋, generalist·none = 빈 목록), 큰 차례 */
  readonly top: readonly PrimaryStat[];
}

/** 스탯 배분의 모양(옛 §6.1 분류 규칙). 정수 곱으로 견준다 */
export function combatClassShape(stats: GuideStats, rule: CombatClassRule): CombatClassShape {
  const ranked = CLASS_STAT_ORDER.map((stat, index) => ({ stat, value: clean(stats[stat]), index }))
    .toSorted((a, b) => b.value - a.value || a.index - b.index)
    .map((row) => row.stat);
  const at = (rank: number): number => clean(stats[ranked[rank] ?? "str"]);
  const s1 = at(0);
  if (s1 === 0) return { kind: "none", ranked, top: [] };
  if (at(5) * 1000 >= s1 * rule.generalistPm) return { kind: "generalist", ranked, top: [] };
  if (at(2) * 1000 >= s1 * rule.threeStatPm) return { kind: "three", ranked, top: ranked.slice(0, 3) };
  return { kind: "two", ranked, top: ranked.slice(0, 2) };
}

export interface CombatClassPick {
  readonly shape: CombatClassShape;
  /** 맞는 클래스(표에 없으면 null). 3스탯 조합이 표에 없으면 위 두 스탯 조합으로 내려간다(옛 코드와 같다) */
  readonly entry: CombatClassView | null;
}

/** 전투 클래스 추천: 모양을 정하고 표에서 그 조합을 찾는다 */
export function recommendCombatClass(
  stats: GuideStats,
  classes: readonly CombatClassView[],
  rule: CombatClassRule,
): CombatClassPick {
  const shape = combatClassShape(stats, rule);
  if (shape.kind === "none") return { shape, entry: null };
  const byKey = new Map(classes.map((entry) => [classKey(entry.stats), entry]));
  if (shape.kind === "generalist") return { shape, entry: byKey.get("") ?? null };
  const found = byKey.get(classKey(shape.top));
  if (found || shape.kind === "two") return { shape, entry: found ?? null };
  const two = shape.ranked.slice(0, 2);
  const fallback = byKey.get(classKey(two));
  return fallback
    ? { shape: { kind: "two", ranked: shape.ranked, top: two }, entry: fallback }
    : { shape, entry: null };
}

/** units.guide 응답: 추천 표(실효 팩 + 세계 덮어쓰기)와 분류 문턱(설정 칸 실효 값) */
export interface UnitGuideResponse {
  readonly production: readonly ProductionTypeView[];
  readonly classes: readonly CombatClassView[];
  readonly classRule: CombatClassRule;
  readonly generatedAt: number;
}
