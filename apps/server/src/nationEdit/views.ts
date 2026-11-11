// 시작 국가 설정 편집기 화면 자료(/dev/nations) — 스냅숏 하나로 만든다. docs/adr/2026-11-10-nation-editor.md.
// 파싱한 팩 항목(참조 = ContentRef)을 화면 JSON(참조 = ID 글자, 팩 파일 한 줄 모양·칸 차례)으로 옮긴다.
import type { FacilityEntry, ItemEntry, NationPresetEntry, RecipeEntry } from "@terra/content";
import type {
  NationEditorOption,
  NationEditorRecipeOption,
  NationEditorRow,
  NationEmblemUploadView,
  NationPersonalityJson,
  NationPresetJson,
  NationSeedDefaults,
  NationTierRow,
} from "@terra/shared/nationEditor";
import { POWER_TIERS } from "@terra/shared/nationTier";
import { START_WORLD_SEED, type WorldSeedCoefficients, startCitiesFor } from "@terra/sim";
import { type ContentEditState, type ContentSnapshot, contentKey } from "../contentEdit/state.ts";
import { originOf, overrideViewOf } from "../contentEdit/views.ts";
import { MAX_TEST_NATIONS, startHousingOf } from "../npc/nations.ts";
import { nationTierJsonOf } from "../npc/presets.ts";

const nameOf = (entry: { name: { ko: string; en: string } }) => ({ ko: entry.name.ko, en: entry.name.en });

function personalityJsonOf(p: NonNullable<NationPresetEntry["personality"]>): NationPersonalityJson {
  return {
    ...(p.startCities === undefined ? {} : { startCities: p.startCities }),
    ...(p.cityJobs
      ? { cityJobs: p.cityJobs.map((job) => ({ facility: job.facility.id, recipe: job.recipe.id })) }
      : {}),
    ...(p.startNecessityHours === undefined ? {} : { startNecessityHours: p.startNecessityHours }),
    ...(p.startStock
      ? { startStock: p.startStock.map((stack) => ({ item: stack.item.id, qty: stack.qty })) }
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
}

/** 파싱한 국가 프리셋 → 화면 JSON(팩 파일 한 줄 모양, 없는 선택 칸은 적지 않는다) */
export function nationJsonOf(entry: NationPresetEntry): NationPresetJson {
  return {
    id: entry.id,
    name: nameOf(entry),
    ...(entry.shortName === undefined ? {} : { shortName: entry.shortName }),
    ...(entry.color === undefined ? {} : { color: entry.color }),
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
      ...(entry.currency.symbol === undefined ? {} : { symbol: entry.currency.symbol }),
      ...(entry.currency.ticker === undefined ? {} : { ticker: entry.currency.ticker }),
    },
    tradeTaxBp: entry.tradeTaxBp,
    ...(entry.personality ? { personality: personalityJsonOf(entry.personality) } : {}),
    ...(entry.cityNames ? { cityNames: [...entry.cityNames] } : {}),
    ...(entry.leaderName ? { leaderName: { ko: entry.leaderName.ko, en: entry.leaderName.en } } : {}),
    ...(entry.humanNames
      ? {
          humanNames: {
            given: [...entry.humanNames.given],
            ...(entry.humanNames.family ? { family: [...entry.humanNames.family] } : {}),
          },
        }
      : {}),
    enabled: entry.enabled,
  };
}

/**
 * 프리셋이 이 서버에서 서는 고정 국가 차례(npc/nations.ts nationCode·presetOfCode와 같은 규칙): 켜진 프리셋 가운데 16번째 = 1번(시험 NPC
 * 세력), 앞에서부터 2번·3번…(시험 국가 수까지). 서지 않으면 null
 */
export function slotsOf(
  entries: readonly NationPresetEntry[],
  testNations: number | null,
): Map<string, number> {
  const slots = new Map<string, number>();
  if (testNations === null) return slots;
  const enabled = entries.filter((entry) => entry.enabled);
  const count = Math.max(1, Math.min(MAX_TEST_NATIONS, testNations));
  const first = enabled[MAX_TEST_NATIONS - 1];
  if (first) slots.set(first.id, 1);
  for (let n = 2; n <= count; n++) {
    const preset = enabled[n - 2];
    if (preset && !slots.has(preset.id)) slots.set(preset.id, n);
  }
  return slots;
}

export function nationViews(
  state: ContentEditState,
  snapshot: ContentSnapshot,
  uploaded: ReadonlyMap<string, NationEmblemUploadView>,
  testNations: number | null,
): NationEditorRow[] {
  const packById = new Map(state.pack.nationPresets.map((entry) => [entry.id, entry]));
  const slots = slotsOf(snapshot.effective.nationPresets, testNations);
  return snapshot.effective.nationPresets.map((entry) => {
    const pack = packById.get(entry.id);
    return {
      entry: nationJsonOf(entry),
      origin: originOf(state, snapshot, "nation_presets", entry.id),
      pack: pack ? nationJsonOf(pack) : null,
      override: overrideViewOf(snapshot.overrides.get(contentKey("nation_presets", entry.id))),
      hash: state.hashOf("nation_presets", entry.id) ?? "",
      uploaded: uploaded.get(entry.id) ?? null,
      slot: slots.get(entry.id) ?? null,
    };
  });
}

/** 국력 등급 표(등급 차례). 팩·덮어쓰기에 줄이 없는 등급은 빠진다 */
export function tierViews(state: ContentEditState, snapshot: ContentSnapshot): NationTierRow[] {
  const packById = new Map(state.pack.nationTiers.map((entry) => [entry.id, entry]));
  const order = new Map(POWER_TIERS.map((id, index) => [id, index]));
  return snapshot.effective.nationTiers
    .toSorted((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((entry) => {
      const pack = packById.get(entry.id);
      return {
        entry: nationTierJsonOf(entry),
        origin: originOf(state, snapshot, "nation_tiers", entry.id),
        pack: pack ? nationTierJsonOf(pack) : null,
        override: overrideViewOf(snapshot.overrides.get(contentKey("nation_tiers", entry.id))),
        hash: state.hashOf("nation_tiers", entry.id) ?? "",
      };
    });
}

/** 처음 창고 생필품 시간분 기본(npc/economy.ts, 기획 답 554 다) */
const DEFAULT_NECESSITY_HOURS = 48;

/** 세계 씨앗 설정 칸의 지금 값(국가 칸이 비었을 때 드는 값) */
export function seedDefaultsOf(seed: WorldSeedCoefficients = START_WORLD_SEED): NationSeedDefaults {
  return {
    startCitiesMin: startCitiesFor(seed),
    startCitiesMax: startCitiesFor(seed, Number.MAX_SAFE_INTEGER),
    housing: startHousingOf(seed),
    populationPm: seed.populationPm,
    farms: seed.farms,
    lumberCamps: seed.lumberCamps,
    mines: seed.mines,
    storehouses: seed.storehouses,
    necessityHours: DEFAULT_NECESSITY_HOURS,
    cityStepCells: Math.max(1, Math.trunc(seed.layoutCityStepCells)),
  };
}

export const facilityOptions = (facilities: readonly FacilityEntry[]): NationEditorOption[] =>
  facilities.map((entry) => ({ id: entry.id, name: nameOf(entry) }));

export const recipeOptions = (recipes: readonly RecipeEntry[]): NationEditorRecipeOption[] =>
  recipes
    .filter((entry) => entry.enabled)
    .map((entry) => ({ id: entry.id, name: nameOf(entry), facility: entry.facility.id }));

export const itemOptions = (items: readonly ItemEntry[]): NationEditorOption[] =>
  items.filter((entry) => entry.enabled).map((entry) => ({ id: entry.id, name: nameOf(entry) }));
