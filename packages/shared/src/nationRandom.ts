// 랜덤 국가 프리셋 후보 — 사용자 요청(2026-11-11, 원문) "샘플좋다. 추가적으로 랜덤으로 프리셋을 설정하여 추가할수도 있으면 좋을듯."
// docs/adr/2026-11-10-nation-editor.md "바뀜 (2026-11-11)". 시작 국가 설정 편집기(/dev/nations)의 [랜덤 국가 추가]가 쓴다.
// 순수 함수: 같은 (부분마다 시드, 이미 있는 프리셋)이면 같은 후보다. 부분(이름 말씨·국가 이름·화폐·지도자·색·마크·등급·도시 이름·사람 이름)마다
// 시드가 따로라 하나만 다시 굴릴 수 있다. 이름은 이름 만들기(./nameGen.ts — 가상 이름, 길이 규칙 D-5046)에서 온다.
// - 새 영구 ID: nation_<영어 이름 글자>_<수>, 화폐 코드 cur_<화폐 영어 이름 글자>_<수>. 이미 있거나 한 번 쓴(은퇴) ID는 건너뛴다.
// - 약어·화폐 약어는 이미 있는 것과 겹치지 않는 3글자, 색은 이미 있는 색들과 먼 후보 여섯 가운데 하나.
import type { LocalizedName } from "./contentEdit.ts";
import { NAME_STYLE_IDS, type NameStyleId, generateNames, tickerCandidates } from "./nameGen.ts";
import { NATION_CREATED_CURRENCY, NATION_CREATED_ID, type NationPresetJson } from "./nationEditor.ts";
import { type NationEmblemSpec, emblemFromSeed, rgbOf } from "./nationEmblem.ts";
import { POWER_TIERS, type PowerTier } from "./nationTier.ts";
import { createRng } from "./rng.ts";

/** 따로 다시 굴릴 수 있는 부분 */
export const NATION_RANDOM_PARTS = [
  "style",
  "name",
  "currency",
  "leader",
  "color",
  "emblem",
  "tier",
  "cities",
  "people",
] as const;
export type NationRandomPart = (typeof NATION_RANDOM_PARTS)[number];
export type NationRandomSeeds = Readonly<Record<NationRandomPart, number>>;

/** 시드 하나에서 부분마다 시드를 낸다(처음 굴릴 때) */
export function randomSeedsOf(seed: number): NationRandomSeeds {
  const rng = createRng(seed >>> 0);
  const next = (): number => rng.nextInt(0x7fff_ffff);
  return {
    style: next(),
    name: next(),
    currency: next(),
    leader: next(),
    color: next(),
    emblem: next(),
    tier: next(),
    cities: next(),
    people: next(),
  };
}

/** 한 부분만 다시 굴린다(그 부분의 시드를 다음 수로) */
export function rerollPart(seeds: NationRandomSeeds, part: NationRandomPart): NationRandomSeeds {
  return { ...seeds, [part]: (Math.imul(seeds[part] + 1, 0x9e37_79b1) >>> 0) % 0x7fff_ffff };
}

const hex = (value: number): string =>
  Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, "0");

/** 색상(0~360)·채도·밝기(0~1) → #rrggbb */
function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return `#${hex((r + m) * 255)}${hex((g + m) * 255)}${hex((b + m) * 255)}`;
}

/** 색 후보(색상환 24 × 밝기 둘 — 지도 바탕 두 가지에서 읽히는 중간 밝기) */
export const RANDOM_COLORS: readonly string[] = Array.from({ length: 24 }, (_, step) => [
  hslHex(step * 15, 0.62, 0.46),
  hslHex(step * 15 + 7, 0.48, 0.38),
]).flat();

/** 두 색의 거리(RGB 제곱 합 — 구별되는지 견줄 때만 쓴다) */
export function colorDistance(a: string, b: string): number {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2;
}

/** 색을 고를 때 보는 먼 후보 수(다시 굴리면 이 안에서 바뀐다) */
export const DISTINCT_COLOR_CHOICES = 6;

/**
 * 이미 있는 색들과 먼 후보 가운데 하나: 후보를 "이미 있는 색과의 가장 가까운 거리"가 먼 차례로 세워 앞의 DISTINCT_COLOR_CHOICES개에서
 * 시드로 고른다(이미 있는 색과 같은 후보는 뺀다). 이미 있는 색이 없으면 모든 후보에서 고른다
 */
export function distinctColor(seed: number, taken: readonly string[]): string {
  const rng = createRng(seed >>> 0);
  if (taken.length === 0) return RANDOM_COLORS[rng.nextInt(RANDOM_COLORS.length)] ?? "#888888";
  const ranked = RANDOM_COLORS.map((color, index) => ({
    color,
    index,
    score: taken.reduce((min, other) => Math.min(min, colorDistance(color, other)), Infinity),
  }))
    .filter((entry) => entry.score > 0)
    .toSorted((a, b) => b.score - a.score || a.index - b.index);
  const pool = ranked.slice(0, DISTINCT_COLOR_CHOICES);
  return pool[rng.nextInt(Math.max(1, pool.length))]?.color ?? RANDOM_COLORS[0] ?? "#888888";
}

/** 등급 고르기의 가중치(강대국은 드물게 — 팩 16개의 분포 2·3·5·4·2와 같다) [임시] */
const TIER_WEIGHTS: Readonly<Record<PowerTier, number>> = {
  superpower: 2,
  great_power: 3,
  middle_power: 5,
  small_state: 4,
  city_state: 2,
};

function pickTier(seed: number): PowerTier {
  const total = POWER_TIERS.reduce((sum, tier) => sum + TIER_WEIGHTS[tier], 0);
  let roll = createRng(seed >>> 0).nextInt(total);
  for (const tier of POWER_TIERS) {
    roll -= TIER_WEIGHTS[tier];
    if (roll < 0) return tier;
  }
  return "middle_power";
}

const slugOf = (english: string): string =>
  english
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, "")
    .slice(0, 24);

/** 겹치지 않는 새 ID(앞머리_글자_수). 글자가 너무 짧으면 "new"를 쓴다 */
function freshId(prefix: string, english: string, taken: ReadonlySet<string>): string {
  const slug = slugOf(english);
  const body = slug.length >= 2 ? slug : "new";
  for (let n = 1; n <= 9999; n++) {
    const id = `${prefix}_${body}_${String(n)}`;
    if (!taken.has(id)) return id;
  }
  return `${prefix}_${body}_9999`;
}

export interface NationRandomContext {
  /** 이미 있는 프리셋(약어·화폐 약어·색·이름·ID가 겹치지 않게) */
  readonly existing: readonly NationPresetJson[];
  /** 한 번 쓰고 지운 프리셋 ID(다시 쓰지 않는다) */
  readonly retiredIds?: readonly string[] | undefined;
}

const firstOr = (names: readonly LocalizedName[], taken: ReadonlySet<string>): LocalizedName | undefined =>
  names.find((name) => !taken.has(name.en.toLowerCase()) && !taken.has(name.ko)) ?? names[0];

/**
 * 랜덤 국가 후보 하나(팩 프리셋 한 줄 모양 — 칸 차례는 팩 파일과 같다). 이름 후보가 모두 겹치면 첫 후보를 쓴다(팩 검사가 약어·화폐 약어·
 * 화폐 코드 겹침을 막는다 — 이름은 겹쳐도 받지만 화면이 알린다)
 */
export function randomNation(seeds: NationRandomSeeds, context: NationRandomContext): NationPresetJson {
  const style: NameStyleId =
    NAME_STYLE_IDS[createRng(seeds.style >>> 0).nextInt(NAME_STYLE_IDS.length)] ?? "prairie";
  const existing = context.existing;
  const takenNames = new Set(existing.flatMap((entry) => [entry.name.en.toLowerCase(), entry.name.ko]));
  const takenMoney = new Set(
    existing.flatMap((entry) => [entry.currency.name.en.toLowerCase(), entry.currency.name.ko]),
  );
  const name = firstOr(generateNames(style, "nation", seeds.name, 8), takenNames) ?? {
    ko: "새 나라",
    en: "Newland",
  };
  const money = firstOr(generateNames(style, "currency", seeds.currency, 8), takenMoney) ?? {
    ko: "새 돈",
    en: "Newcoin",
  };
  const leader = generateNames(style, "leader", seeds.leader, 1)[0];
  const shorts = new Set(
    existing.flatMap((entry) => (entry.shortName ? [entry.shortName.toUpperCase()] : [])),
  );
  const tickers = new Set(
    existing.flatMap((entry) => (entry.currency.ticker ? [entry.currency.ticker] : [])),
  );
  const shortName = tickerCandidates(name.en, shorts, 1)[0];
  const ticker = tickerCandidates(money.en, new Set([...tickers, ...(shortName ? [shortName] : [])]), 1)[0];
  const ids = new Set([...existing.map((entry) => entry.id), ...(context.retiredIds ?? [])]);
  const codes = new Set(existing.map((entry) => entry.currency.code));
  const emblem: NationEmblemSpec = emblemFromSeed(seeds.emblem >>> 0);
  const cities = generateNames(style, "city", seeds.cities, 8).map((entry) => entry.en);
  const given = generateNames(style, "given", seeds.people, 12).map((entry) => entry.en);
  const family = generateNames(style, "family", seeds.people ^ 0x5bd1_e995, 8).map((entry) => entry.en);
  return {
    id: freshId("nation", name.en, ids),
    name: { ko: name.ko, en: name.en },
    ...(shortName ? { shortName } : {}),
    color: distinctColor(
      seeds.color,
      existing.flatMap((entry) => (entry.color ? [entry.color] : [])),
    ),
    emblem,
    nameStyle: style,
    powerTier: pickTier(seeds.tier),
    currency: {
      code: freshId("cur", money.en, codes),
      name: { ko: money.ko, en: money.en },
      symbol: money.en.slice(0, 1).toUpperCase(),
      ...(ticker ? { ticker } : {}),
    },
    tradeTaxBp: 200,
    ...(cities.length > 0 ? { cityNames: cities } : {}),
    ...(leader ? { leaderName: { ko: leader.ko, en: leader.en } } : {}),
    ...(given.length > 0 ? { humanNames: { given, ...(family.length > 0 ? { family } : {}) } } : {}),
    enabled: true,
  };
}

/** 만든 프리셋 ID·화폐 코드의 모양이 맞나(서버가 같은 식으로 본다) */
export const isCreatedNation = (entry: Pick<NationPresetJson, "id" | "currency">): boolean =>
  NATION_CREATED_ID.test(entry.id) && NATION_CREATED_CURRENCY.test(entry.currency.code);
