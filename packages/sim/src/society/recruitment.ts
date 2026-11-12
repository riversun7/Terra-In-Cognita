// 구인 카드 — 기획 D-469(출생 없음, 인구는 정부기관(행정 건물) 구인 카드로만, NPC 세력도 같다), 49 N45, D-507(옛 규칙 먼저)
// 옛 규칙(AntiGravt01 terra-server/routes/building/hq_routes.js):
// - 카드 3~5장 무작위, 12시간마다 갱신(쌓이지 않음: 갱신하면 안 산 카드는 사라진다), 산 카드는 목록에서 빠진다.
// - 토탈 스탯: 행정 건물 등급 범위 안 균등(Lv1 30~45 · Lv2 45~60 · Lv3 60~80 = 옛 마을회관·영주관·시청). Lv4·Lv5는 옛 값이 없다([임시]).
//   바뀜(D-534, 2026-11-12): 휴먼 초기 합은 상위 콘텐츠로 최대 80(설정 칸 n9_human_sum_max — 설정 칸 검사 stat_sum_cap이 레벨 범위를 막는다),
//   어떤 경우에도 100 이하(@terra/shared STAT_SUM_ABSOLUTE_MAX, 굴린 토탈을 여기서 한 번 더 자른다). Lv4·Lv5 [임시] 65~80·70~80.
// - 6스탯 분배: 칸마다 max(1, ⌊토탈 ÷ 12⌋)를 먼저 주고, 남은 점수를 아무 칸에 1~3점씩 나눈다.
// - 속성: 10점을 기본 4원소(물·불·바람·땅) 가운데 2~3개에 나눈다(빛·어둠 0). 칸마다 1점 이상.
// - 비용 = 등급 × 50 + (토탈 − 그 등급 최소) × 2 (도시 화폐). 옛 코드는 지갑에서 빼기만 했다(받는 쪽 없음 = 소각).
// - 고용한 휴먼은 레벨 1에서 시작한다.
// 판정은 시드 굴림(@terra/shared createRng)만 쓴다. 카드 묶음 = (세계 시드, 도시, 고용 주체, 갱신 창)으로 정해진다 → 저장할 것은
// "그 창에서 산 칸"뿐이다(RecruitDraw). 카드 수·범위·주기·비용·속성 점수는 설정값(D-5032, 팩 tuning n45_*).
import { BASIC_ELEMENTS, ELEMENT_IDS, ELEMENT_MAX } from "@terra/shared/cyborg";
import { type Rng, createRng } from "@terra/shared";
import { STAT_SUM_ABSOLUTE_MAX } from "@terra/shared/statGrowth";
import { mix32 } from "../math/hash.ts";

/** 행정 건물 레벨 상한(구조, D-469 Lv1~5) */
export const ADMIN_LEVEL_MAX = 5;
/** 1차 스탯 수. 차례는 STR·DEX·AGI·VIT·INT·WIS(사이보그 스탯 배열과 같다) */
export const RECRUIT_STAT_COUNT = 6;
/** 한 창의 카드 수 상한(산 칸을 정수 비트로 적는다) */
export const RECRUIT_CARDS_CAP = 16;

/** 행정 건물 레벨 하나의 카드 규칙(49 N45) */
export interface RecruitLevelRule {
  /** 카드 수 범위(양 끝 포함, 균등) */
  readonly cardsMin: number;
  readonly cardsMax: number;
  /** 토탈 스탯 범위(양 끝 포함, 균등) */
  readonly statsMin: number;
  readonly statsMax: number;
}

export interface RecruitCoefficients {
  /** 갱신 주기(ms, 옛 12시간). 창 = ⌊시각 ÷ 주기⌋ */
  readonly refreshMs: number;
  /** 비용 = 등급 × costPerLevel + (토탈 − 등급 최소) × costPerStat(도시 화폐 최소 단위) */
  readonly costPerLevel: number;
  readonly costPerStat: number;
  /** 속성 점수(옛 10)와 나누는 원소 수 범위(옛 2~3, 기본 4원소 안) */
  readonly elementPoints: number;
  readonly elementsMin: number;
  readonly elementsMax: number;
  /** 고용한 휴먼의 시작 레벨(옛 1) */
  readonly startLevel: number;
  /** 행정 건물 Lv1~5 (차례대로) */
  readonly levels: readonly RecruitLevelRule[];
}

/** 기본 4원소 점수(물·불·바람·땅) */
export type RecruitElements = Readonly<Record<(typeof BASIC_ELEMENTS)[number], number>>;

/** 구인 카드 한 장 */
export interface RecruitCard {
  /** 그 창 안의 자리(0부터) */
  readonly slot: number;
  /** 행정 건물 레벨(옛 등급) */
  readonly level: number;
  readonly total: number;
  /** STR·DEX·AGI·VIT·INT·WIS */
  readonly stats: readonly number[];
  readonly elements: RecruitElements;
  /** 도시 화폐 최소 단위 */
  readonly cost: bigint;
}

/** 고용한 휴먼의 스탯·속성·레벨(구인 카드에서 옴. 처음부터 있던 휴먼은 없음) */
export interface RecruitProfile {
  readonly level: number;
  readonly stats: readonly number[];
  readonly elements: RecruitElements;
}

/** 한 고용 주체가 한 도시에서 지금 창에 산 칸 */
export interface RecruitDraw {
  readonly window: number;
  /** 산 칸 비트(자리 k = 1 << k) */
  readonly taken: number;
}

/** 시각이 든 갱신 창 */
export function recruitWindow(nowMs: number, c: RecruitCoefficients): number {
  return Math.floor(nowMs / Math.max(1, c.refreshMs));
}

/** 창이 끝나는 시각(= 다음 갱신) */
export function recruitWindowEndMs(window: number, c: RecruitCoefficients): number {
  return (window + 1) * Math.max(1, c.refreshMs);
}

/** 레벨 규칙(1~5로 묶음). 레벨 0(행정 건물 없음)이면 undefined */
export function recruitLevelRule(level: number, c: RecruitCoefficients): RecruitLevelRule | undefined {
  if (level < 1) return undefined;
  return c.levels[Math.min(c.levels.length, level) - 1];
}

/** 카드 비용(옛 식): 등급 × costPerLevel + (토탈 − 등급 최소) × costPerStat */
export function recruitCost(level: number, total: number, c: RecruitCoefficients): bigint {
  const rule = recruitLevelRule(level, c);
  const min = rule?.statsMin ?? 0;
  return BigInt(level * c.costPerLevel + Math.max(0, total - min) * c.costPerStat);
}

/** 6스탯 분배(옛 distributeStats): 칸마다 max(1, ⌊토탈 ÷ 12⌋), 남은 점수는 아무 칸에 1~3점씩 */
export function distributeRecruitStats(total: number, rng: Rng): number[] {
  const floor = Math.max(1, Math.floor(total / 12));
  const stats: number[] = Array.from({ length: RECRUIT_STAT_COUNT }, () => floor);
  let remaining = total - floor * RECRUIT_STAT_COUNT;
  while (remaining > 0) {
    const index = rng.nextInt(RECRUIT_STAT_COUNT);
    const add = Math.min(remaining, rng.nextInt(3) + 1);
    stats[index] = (stats[index] ?? 0) + add;
    remaining -= add;
  }
  return stats;
}

/**
 * 속성 분배(옛 distributeElements): 기본 4원소 가운데 elementsMin~elementsMax개를 골라(섞기) 점수를 나눈다. 앞 칸부터 남은 칸이 1점씩은
 * 받게 1~(남은 점수 − 남은 칸 수)를 굴리고 마지막 칸이 나머지를 받는다. 칸 상한(10)을 넘지 않게 굴림 범위를 묶는다(옛 값 10점·2~3칸에서는
 * 묶음이 걸리지 않아 옛 규칙과 같다)
 */
export function distributeRecruitElements(rng: Rng, c: RecruitCoefficients): RecruitElements {
  const out: Record<(typeof BASIC_ELEMENTS)[number], number> = { water: 0, fire: 0, wind: 0, earth: 0 };
  const min = Math.max(1, Math.min(BASIC_ELEMENTS.length, c.elementsMin));
  const max = Math.max(min, Math.min(BASIC_ELEMENTS.length, c.elementsMax));
  const count = min + rng.nextInt(max - min + 1);
  // 피셔-예이츠 섞기(옛 코드의 sort(() => random − 0.5)를 고르게 바꿈)
  const order = [...BASIC_ELEMENTS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1);
    const a = order[i];
    const b = order[j];
    if (a === undefined || b === undefined) continue;
    order[i] = b;
    order[j] = a;
  }
  const active = order.slice(0, count);
  let remaining = Math.max(count, c.elementPoints);
  active.forEach((element, index) => {
    const left = active.length - index - 1;
    if (left === 0) {
      out[element] = Math.min(ELEMENT_MAX, remaining);
      return;
    }
    const lo = Math.max(1, remaining - left * ELEMENT_MAX);
    const hi = Math.max(lo, Math.min(ELEMENT_MAX, remaining - left));
    const alloc = lo + rng.nextInt(hi - lo + 1);
    out[element] = alloc;
    remaining -= alloc;
  });
  return out;
}

/** 카드 묶음 굴리기(옛 generateRecruits): 카드 수 → 카드마다 토탈·6스탯·속성·비용. 레벨 0이면 빈 목록 */
export function rollRecruitCards(level: number, rng: Rng, c: RecruitCoefficients): RecruitCard[] {
  const rule = recruitLevelRule(level, c);
  if (!rule) return [];
  const grade = Math.min(c.levels.length, level);
  const cardsMin = Math.max(0, Math.min(RECRUIT_CARDS_CAP, rule.cardsMin));
  const cardsMax = Math.max(cardsMin, Math.min(RECRUIT_CARDS_CAP, rule.cardsMax));
  const count = cardsMin + rng.nextInt(cardsMax - cardsMin + 1);
  const statsMax = Math.max(rule.statsMin, rule.statsMax);
  const cards: RecruitCard[] = [];
  for (let slot = 0; slot < count; slot++) {
    const total = Math.min(STAT_SUM_ABSOLUTE_MAX, rule.statsMin + rng.nextInt(statsMax - rule.statsMin + 1));
    const stats = distributeRecruitStats(total, rng);
    const elements = distributeRecruitElements(rng, c);
    cards.push({ slot, level: grade, total, stats, elements, cost: recruitCost(grade, total, c) });
  }
  return cards;
}

/** 구인 카드 난수의 소금(다른 흐름과 겹치지 않게) */
const RECRUIT_SALT = 0x5ec2_0469;

/**
 * 한 고용 주체가 한 도시 행정 건물에서 한 창에 보는 카드 묶음: (세계 시드, 도시, 고용 주체, 창)으로 정해진다(시뮬·서버가 같다).
 * 고용 주체마다 묶음이 따로라 NPC 세력과 유저가 같은 카드를 다투지 않는다(옛 코드도 건물 주인마다 묶음, [임시] 해석)
 */
export function recruitCards(
  seed: number,
  cityId: number,
  hirer: number,
  window: number,
  level: number,
  c: RecruitCoefficients,
): RecruitCard[] {
  const rng = createRng(
    mix32(
      seed ^
        Math.imul(cityId, 0x9e37_79b1) ^
        Math.imul(hirer, 0x27d4_eb2f) ^
        Math.imul(window + 1, 0x85eb_ca6b) ^
        RECRUIT_SALT,
    ),
  );
  return rollRecruitCards(level, rng, c);
}

/** 지금 창에서 산 칸(창이 지났으면 0 — 쌓이지 않는다) */
export function takenNow(draw: RecruitDraw | undefined, window: number): number {
  return draw && draw.window === window ? draw.taken : 0;
}

/** 칸 하나를 산 뒤의 기록. 이미 샀거나 자리가 틀리면 undefined */
export function takeRecruitSlot(
  draw: RecruitDraw | undefined,
  window: number,
  slot: number,
  cards: number,
): RecruitDraw | undefined {
  if (!Number.isInteger(slot) || slot < 0 || slot >= cards) return undefined;
  const taken = takenNow(draw, window);
  const bit = 1 << slot;
  if ((taken & bit) !== 0) return undefined;
  return { window, taken: taken | bit };
}

/** 고용한 휴먼의 자료(카드 → 레벨 1 휴먼) */
export function recruitProfileOf(card: RecruitCard, c: RecruitCoefficients): RecruitProfile {
  return { level: Math.max(1, c.startLevel), stats: [...card.stats], elements: { ...card.elements } };
}

/**
 * 처음 인구 휴먼의 자료(기획 답 774 나 — 처음부터 있던 휴먼도 스탯·속성, docs/adr/2026-11-07-play-flow.md "WP-NPC4"): 그 도시 행정 레벨의
 * 구인 카드 한 장과 같은 굴림(토탈 = 레벨 범위 안 균등 → 6스탯 분배 → 속성 분배, 값은 받지 않는다)과 고용한 휴먼과 같은 시작 레벨.
 * 행정 레벨이 0(행정 건물 없음)이면 Lv1 규칙 [임시]. 레벨 규칙이 하나도 없으면 토탈 = 6스탯 × 10(화면 기본값과 같은 합)
 * 시뮬 처음 휴먼(시나리오 workers, simulator/society.ts)과 서버 처음 인구·옛 휴먼 채우기(apps/server/src/npc/runtime.ts)가 같은 함수다
 */
export function rollFoundingProfile(adminLevel: number, rng: Rng, c: RecruitCoefficients): RecruitProfile {
  const rule = recruitLevelRule(Math.max(1, adminLevel), c);
  const statsMin = rule?.statsMin ?? RECRUIT_STAT_COUNT * 10;
  const statsMax = Math.max(statsMin, rule?.statsMax ?? statsMin);
  const total = Math.min(STAT_SUM_ABSOLUTE_MAX, statsMin + rng.nextInt(statsMax - statsMin + 1));
  const stats = distributeRecruitStats(total, rng);
  const elements = distributeRecruitElements(rng, c);
  return { level: Math.max(1, c.startLevel), stats, elements };
}

/** 기본 4원소 점수 → 속성값 12칸(ELEMENT_IDS 차례, 서버 저장·사이보그와 같은 모양) */
export function recruitElementSlots(elements: RecruitElements): number[] {
  return ELEMENT_IDS.map((id) => {
    const value: unknown = Reflect.get(elements, id);
    return typeof value === "number" ? value : 0;
  });
}

/** 속성값 12칸 → 기본 4원소 점수(나머지 칸은 버린다) */
export function recruitElementsFromSlots(slots: readonly number[]): RecruitElements {
  const at = (id: (typeof BASIC_ELEMENTS)[number]): number => slots[ELEMENT_IDS.indexOf(id)] ?? 0;
  return { water: at("water"), fire: at("fire"), wind: at("wind"), earth: at("earth") };
}

/** 옛 값(49 N45 출발값). Lv4·Lv5는 옛 값이 없어 [임시]: 카드 수 하나씩 더, 토탈 65~80·70~80(D-534 휴먼 최대 80) */
export const OLD_RECRUIT_COEFFICIENTS: RecruitCoefficients = {
  refreshMs: 12 * 3_600_000,
  costPerLevel: 50,
  costPerStat: 2,
  elementPoints: 10,
  elementsMin: 2,
  elementsMax: 3,
  startLevel: 1,
  levels: [
    { cardsMin: 3, cardsMax: 5, statsMin: 30, statsMax: 45 },
    { cardsMin: 3, cardsMax: 5, statsMin: 45, statsMax: 60 },
    { cardsMin: 3, cardsMax: 5, statsMin: 60, statsMax: 80 },
    { cardsMin: 4, cardsMax: 6, statsMin: 65, statsMax: 80 },
    { cardsMin: 5, cardsMax: 7, statsMin: 70, statsMax: 80 },
  ],
};
