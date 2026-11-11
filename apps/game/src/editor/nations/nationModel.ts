// 시작 국가 설정 편집기 모델 — 담은 변경(국가마다 put·revert, 잠든 줄 버리기), 칸 고치기(성격 칸·목록), 미리 보기 셈(시작 도시·처음 인구),
// 색 읽기 쉬움, 마크 자르기 셈. 계산만 하는 순수 함수(시험: nationModel.test.ts). docs/adr/2026-11-10-nation-editor.md
import {
  type NationEditorChange,
  type NationEditorRow,
  type NationPersonalityJson,
  type NationPresetJson,
  type NationSeedDefaults,
} from "@terra/shared/nationEditor";
import { type NationEmblemSpec, contrastOf, emblemOfId } from "@terra/shared/nationEmblem";
import { FACTION_IDENTITY_COLORS } from "@terra/shared/factionIdentity";
import {
  type NationStart,
  type NationStartDefaults,
  type NationTierJson,
  nationStartTotals,
  resolveNationStart,
} from "@terra/shared/nationTier";
import { mergeThreeWay } from "../content/contentEditorModel.ts";

/** 국가 하나의 담은 변경: 고친 항목 통째 또는 팩 값으로 되돌리기. base·baseHash = 고치기 시작할 때의 실효 항목·해시 */
export type StagedNation =
  | {
      readonly op: "put";
      readonly entry: NationPresetJson;
      readonly base: NationPresetJson;
      readonly baseHash: string;
    }
  | { readonly op: "revert"; readonly base: NationPresetJson; readonly baseHash: string };

/** 국력 등급 표 한 줄의 담은 변경(국가와 같은 꼴) */
export type StagedTier =
  | {
      readonly op: "put";
      readonly entry: NationTierJson;
      readonly base: NationTierJson;
      readonly baseHash: string;
    }
  | { readonly op: "revert"; readonly base: NationTierJson; readonly baseHash: string };

export interface NationStage {
  readonly nations: ReadonlyMap<string, StagedNation>;
  /** 버릴 잠든 줄(국가 ID) */
  readonly discard: ReadonlySet<string>;
  /** 국력 등급 표 줄(등급 ID) */
  readonly tiers: ReadonlyMap<string, StagedTier>;
  /** 이번에 새로 만드는 프리셋 ID(nations에 put으로 들어 있다 — 랜덤 국가 추가) */
  readonly created: ReadonlySet<string>;
}

export const EMPTY_NATION_STAGE: NationStage = {
  nations: new Map(),
  discard: new Set(),
  tiers: new Map(),
  created: new Set(),
};

/** 국가 하나의 담음을 바꾼다(null = 뺀다) */
export function stageNation(stage: NationStage, id: string, next: StagedNation | null): NationStage {
  const nations = new Map(stage.nations);
  if (next === null) nations.delete(id);
  else nations.set(id, next);
  // 새로 만드는 프리셋을 빼면 만들기도 함께 빠진다
  if (next !== null || !stage.created.has(id)) return { ...stage, nations };
  const created = new Set(stage.created);
  created.delete(id);
  return { ...stage, nations, created };
}

/** 새 프리셋(랜덤 국가 추가)을 담는다 */
export function stageCreatedNation(stage: NationStage, entry: NationPresetJson): NationStage {
  const nations = new Map(stage.nations);
  nations.set(entry.id, { op: "put", entry, base: entry, baseHash: "" });
  return { ...stage, nations, created: new Set([...stage.created, entry.id]) };
}

/** 등급 표 한 줄의 담음을 바꾼다(null = 뺀다) */
export function stageTier(stage: NationStage, id: string, next: StagedTier | null): NationStage {
  const tiers = new Map(stage.tiers);
  if (next === null) tiers.delete(id);
  else tiers.set(id, next);
  return { ...stage, tiers };
}

export function stageNationDiscard(stage: NationStage, id: string, on: boolean): NationStage {
  const discard = new Set(stage.discard);
  if (on) discard.add(id);
  else discard.delete(id);
  return { ...stage, discard };
}

export const nationStageKeys = (stage: NationStage): string[] => [
  ...stage.nations.keys(),
  ...[...stage.discard].map((id) => `sleeping/${id}`),
  ...[...stage.tiers.keys()].map((id) => `tier/${id}`),
];

/** 담은 변경 → 서버 묶음 */
export function nationChangesOf(stage: NationStage): NationEditorChange[] {
  const changes: NationEditorChange[] = [];
  // 등급 표가 먼저(같은 묶음에서 프리셋이 가리키는 등급 줄이 있어야 한다)
  for (const [id, staged] of stage.tiers) {
    if (staged.op === "put") changes.push({ op: "put_tier", entry: staged.entry, baseHash: staged.baseHash });
    else changes.push({ op: "revert_tier", id, baseHash: staged.baseHash });
  }
  for (const [id, staged] of stage.nations) {
    if (staged.op === "put" && stage.created.has(id)) changes.push({ op: "create", entry: staged.entry });
    else if (staged.op === "put") changes.push({ op: "put", entry: staged.entry, baseHash: staged.baseHash });
    else changes.push({ op: "revert", id, baseHash: staged.baseHash });
  }
  for (const id of stage.discard) changes.push({ op: "discard_sleeping", id });
  return changes;
}

/** 서버에 보낼 묶음: 초안의 빈 선택 칸을 뺀다(초안에는 치는 글자를 그대로 둔다) */
export const nationBatchOf = (stage: NationStage): NationEditorChange[] =>
  nationChangesOf(stage).map((change) =>
    change.op === "put" || change.op === "create"
      ? { ...change, entry: cleanNation(change.entry) }
      : change.op === "put_tier"
        ? { ...change, entry: cleanTier(change.entry) }
        : change,
  );

/** 등급 표 한 줄(팩 파일과 같은 칸 차례 — 내보내기가 팩 파일에 그대로 들어간다) */
export function cleanTier(entry: NationTierJson): NationTierJson {
  return {
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    startCities: entry.startCities,
    startHousing: entry.startHousing,
    startPopulationPm: entry.startPopulationPm,
    facilities: entry.facilities.map((row) => ({ facility: row.facility, count: row.count })),
    guardsPerCity: entry.guardsPerCity,
    startTech: entry.startTech,
    startCreditPm: entry.startCreditPm,
    cityStepCells: entry.cityStepCells,
    homeGapPm: entry.homeGapPm,
  };
}

function cleanPersonality(p: NationPersonalityJson): NationPersonalityJson | undefined {
  const out: NationPersonalityJson = {
    ...(p.startCities === undefined ? {} : { startCities: p.startCities }),
    ...(p.cityJobs && p.cityJobs.length > 0
      ? { cityJobs: p.cityJobs.map((job) => ({ facility: job.facility, recipe: job.recipe })) }
      : {}),
    ...(p.startNecessityHours === undefined ? {} : { startNecessityHours: p.startNecessityHours }),
    ...(p.startStock && p.startStock.length > 0
      ? { startStock: p.startStock.map((stack) => ({ item: stack.item, qty: stack.qty })) }
      : {}),
    ...(p.startHousing === undefined ? {} : { startHousing: p.startHousing }),
    ...(p.startPopulationPm === undefined ? {} : { startPopulationPm: p.startPopulationPm }),
    ...(p.startFarms === undefined ? {} : { startFarms: p.startFarms }),
    ...(p.startLumberCamps === undefined ? {} : { startLumberCamps: p.startLumberCamps }),
    ...(p.startMines === undefined ? {} : { startMines: p.startMines }),
    ...(p.startStorehouses === undefined ? {} : { startStorehouses: p.startStorehouses }),
    ...(p.startGuards === undefined ? {} : { startGuards: p.startGuards }),
    ...(p.startTech === undefined ? {} : { startTech: p.startTech }),
  };
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * 선택 칸 중 빈 것을 뺀 JSON(팩 줄과 같은 칸 차례로 견주고 보낸다 — 내보내기가 팩 파일에 그대로 들어간다). 빈 글·빈 목록은 칸째 뺀다
 * (스키마가 빈 약어·빈 이름 목록을 받지 않는다)
 */
export function cleanNation(entry: NationPresetJson): NationPresetJson {
  const personality = entry.personality ? cleanPersonality(entry.personality) : undefined;
  const given = entry.humanNames?.given ?? [];
  const family = entry.humanNames?.family ?? [];
  const leader = entry.leaderName;
  return {
    id: entry.id,
    name: { ko: entry.name.ko, en: entry.name.en },
    ...(entry.shortName === undefined || entry.shortName === "" ? {} : { shortName: entry.shortName }),
    ...(entry.color === undefined || entry.color === "" ? {} : { color: entry.color }),
    ...(entry.emblem
      ? {
          emblem: {
            shape: entry.emblem.shape,
            division: entry.emblem.division,
            charge: entry.emblem.charge,
            scheme: entry.emblem.scheme,
          },
        }
      : {}),
    ...(entry.nameStyle === undefined ? {} : { nameStyle: entry.nameStyle }),
    ...(entry.powerTier === undefined ? {} : { powerTier: entry.powerTier }),
    currency: {
      code: entry.currency.code,
      name: { ko: entry.currency.name.ko, en: entry.currency.name.en },
      ...(entry.currency.symbol === undefined || entry.currency.symbol === ""
        ? {}
        : { symbol: entry.currency.symbol }),
      ...(entry.currency.ticker === undefined || entry.currency.ticker === ""
        ? {}
        : { ticker: entry.currency.ticker }),
    },
    tradeTaxBp: entry.tradeTaxBp,
    ...(personality ? { personality } : {}),
    ...(entry.cityNames && entry.cityNames.length > 0 ? { cityNames: [...entry.cityNames] } : {}),
    ...(leader && (leader.ko !== "" || leader.en !== "")
      ? { leaderName: { ko: leader.ko, en: leader.en } }
      : {}),
    ...(given.length > 0
      ? { humanNames: { given: [...given], ...(family.length > 0 ? { family: [...family] } : {}) } }
      : {}),
    enabled: entry.enabled,
  };
}

/** 성격 칸 하나를 바꾼다(undefined = 그 칸을 뺀다 — 설정 칸 기본값을 쓴다) */
export function setPersonality<K extends keyof NationPersonalityJson>(
  entry: NationPresetJson,
  key: K,
  value: NationPersonalityJson[K],
): NationPresetJson {
  const next: NationPersonalityJson = { ...entry.personality, [key]: value };
  return { ...entry, personality: next };
}

/** 목록의 한 줄을 위·아래로 옮긴다(끝을 넘으면 그대로) */
export function moveItem<T>(list: readonly T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  const out = [...list];
  const item = out[index];
  const other = out[to];
  if (item === undefined || other === undefined) return out;
  out[index] = other;
  out[to] = item;
  return out;
}

/** 목록 끝에 겹치지 않는 이름만 붙인다(상한까지) */
export function appendUnique(list: readonly string[], names: readonly string[], max: number): string[] {
  const out = [...list];
  for (const name of names) {
    if (out.length >= max) break;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** 이 국가의 마크 사양(칸이 없으면 ID로 정해지는 기본 마크) */
export const emblemOf = (entry: NationPresetJson): NationEmblemSpec => entry.emblem ?? emblemOfId(entry.id);

/** 색 칸이 없을 때 미리 보기에 쓰는 회색 */
export const FALLBACK_COLOR = "#888888";
export const colorOf = (entry: NationPresetJson): string => entry.color ?? FALLBACK_COLOR;

/** 이 국가가 실제로 받을 시작 수(국가 칸 → 국력 등급 표 → 설정 칸 기본값) */
export interface NationStartCounts {
  /** 시작 도시 수 */
  readonly cities: number;
  /** 새 시작 도시 하나의 주거 */
  readonly housing: number;
  /** 시작 도시 하나의 처음 인구 = ⌊주거 × 천분율 ÷ 1000⌋ */
  readonly population: number;
  /** 나라 전체 처음 인구 */
  readonly totalPopulation: number;
  /** 시작 도시 하나의 기본 시설 수(행정 건물 1 + 창고 + 채집 시설 — 채집 시설은 둘레 땅에 맞는 것만 선다, 여기는 위 끝) */
  readonly facilities: number;
  /** 시작 도시 하나의 경비대·나라 전체 경비대 */
  readonly guards: number;
  readonly totalGuards: number;
}

/** 설정 칸의 지금 값 → 시작 값 풀기의 바닥 값(@terra/shared/nationTier) */
export function startDefaultsOf(defaults: NationSeedDefaults): NationStartDefaults {
  return {
    startCitiesMin: defaults.startCitiesMin,
    startCitiesMax: defaults.startCitiesMax,
    housing: defaults.housing,
    populationPm: defaults.populationPm,
    facilities: {
      farm: defaults.farms,
      lumber_camp: defaults.lumberCamps,
      mine: defaults.mines,
      storehouse: defaults.storehouses,
    },
    cityStepCells: defaults.cityStepCells,
  };
}

/** 이 국가의 등급 표 줄(등급 칸이 없거나 줄이 없으면 undefined) */
export const tierOf = (
  entry: NationPresetJson,
  tiers: readonly NationTierJson[],
): NationTierJson | undefined =>
  entry.powerTier === undefined ? undefined : tiers.find((tier) => tier.id === entry.powerTier);

/** 이 국가의 시작 값(서버 세계 씨앗과 같은 풀기) */
export const nationStartOf = (
  entry: NationPresetJson,
  defaults: NationSeedDefaults,
  tiers: readonly NationTierJson[],
): NationStart => resolveNationStart(startDefaultsOf(defaults), tierOf(entry, tiers), entry.personality);

export function startCountsOf(
  entry: NationPresetJson,
  defaults: NationSeedDefaults,
  tiers: readonly NationTierJson[] = [],
): NationStartCounts {
  const start = nationStartOf(entry, defaults, tiers);
  const totals = nationStartTotals(start);
  const facilities = 1 + Object.values(start.facilities).reduce((sum, count) => sum + count, 0);
  return {
    cities: start.startCities,
    housing: start.housing,
    population: start.populationPerCity,
    totalPopulation: totals.population,
    facilities,
    guards: start.guardsPerCity,
    totalGuards: totals.guards,
  };
}

/** 지도 바탕 두 가지(밝은 테마·어두운 테마의 지도 판) — 색 표지가 구별되는지 보는 기준 [임시] */
export const MAP_LIGHT = "#f4f1ea";
export const MAP_DARK = "#12161c";
/** 표지 위 글 색 후보 */
const TEXT_LIGHT = "#ffffff";
const TEXT_DARK = "#111418";
/** 이 대비보다 낮으면 지도 바탕과 구별이 어렵다고 알린다 */
export const COLOR_MIN_CONTRAST = 1.6;

export interface ColorReadability {
  /** 색 표지 위에 놓을 글 색(더 대비되는 쪽) */
  readonly text: string;
  /** 글과 색의 대비 */
  readonly textContrast: number;
  /** 밝은 지도 바탕·어두운 지도 바탕과의 대비 */
  readonly onLight: number;
  readonly onDark: number;
  /** 두 바탕 모두와 구별되는가 */
  readonly ok: boolean;
}

/** 시그니처 컬러가 지도 이름표에서 읽기 쉬운가(표지 위 글 색·지도 바탕과의 대비) */
export function colorReadability(color: string): ColorReadability {
  const light = contrastOf(color, TEXT_LIGHT);
  const dark = contrastOf(color, TEXT_DARK);
  const onLight = contrastOf(color, MAP_LIGHT);
  const onDark = contrastOf(color, MAP_DARK);
  return {
    text: light >= dark ? TEXT_LIGHT : TEXT_DARK,
    textContrast: Math.max(light, dark),
    onLight,
    onDark,
    ok: Math.min(onLight, onDark) >= COLOR_MIN_CONTRAST,
  };
}

/** 고르기 판의 색(두 지도 바탕 모두와 대비 2 이상인 중간 밝기 색 — 시험이 본다) */
export const READABLE_COLORS = FACTION_IDENTITY_COLORS;

/** 금액 보기(미리 보기): 기호 + 자리 나눈 수 + 약어 */
export function currencySample(entry: NationPresetJson, amount: number, locale: string): string {
  const number = new Intl.NumberFormat(locale).format(amount);
  const symbol = entry.currency.symbol ?? "";
  const ticker = entry.currency.ticker ?? "";
  return `${symbol === "" ? "" : `${symbol} `}${number}${ticker === "" ? "" : ` ${ticker}`}`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isName = (value: unknown): boolean =>
  isObject(value) && typeof value.ko === "string" && typeof value.en === "string";

/** 국가 프리셋 JSON의 꼭 있어야 하는 칸이 있는가(합친 결과를 다시 쓸 때 본다) */
export function isNationJson(value: unknown): value is NationPresetJson {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    isName(value.name) &&
    isObject(value.currency) &&
    typeof value.currency.code === "string" &&
    isName(value.currency.name) &&
    typeof value.tradeTaxBp === "number" &&
    typeof value.enabled === "boolean"
  );
}

/**
 * 그새 누가 같은 국가를 바꿨다(entry_changed): 내가 바꾼 칸만 새 항목 위에 다시 얹는다. 새 항목과 같아지면 담음에서 뺀다(null).
 * conflicts = 양쪽이 다르게 바꾼 칸(내 값을 넣었다)
 */
export function rebaseNation(
  mine: StagedNation,
  latest: NationEditorRow,
): { next: StagedNation | null; conflicts: readonly string[] } {
  if (mine.op === "revert")
    return { next: { op: "revert", base: latest.entry, baseHash: latest.hash }, conflicts: [] };
  const result = mergeThreeWay(mine.base, mine.entry, latest.entry);
  const merged = cleanNation(isNationJson(result.merged) ? result.merged : mine.entry);
  const same = JSON.stringify(merged) === JSON.stringify(cleanNation(latest.entry));
  return {
    next: same ? null : { op: "put", entry: merged, base: latest.entry, baseHash: latest.hash },
    conflicts: result.conflicts,
  };
}

// ── 마크 자르기 ──────────────────────────────────────────────────────────────
// 셈은 ui/emblemCrop.ts로 옮겼다(플레이어 세력 정체성 화면과 같이 쓴다 — docs/adr/2026-11-11-faction-identity.md 2절). 이름은 그대로 내보낸다.
export {
  CROP_ZOOM,
  type CropState,
  EMBLEM_MAX_BYTES,
  EMBLEM_SIZE,
  POSTERIZE_STEPS,
  clampCrop,
  cropRect,
  dragCrop,
  initialCrop,
  posterize,
  zoomCrop,
} from "../../ui/emblemCrop.ts";
