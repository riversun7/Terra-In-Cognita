// 실행 도구 공용 — 시나리오·콘텐츠 팩 읽기 (docs/adr/2026-10-31-rules-simulator.md "실행 도구")
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type PackSource,
  facilityEntrySchema,
  formatIssue,
  hasErrors,
  itemEntrySchema,
  nationPresetEntrySchema,
  necessityEntrySchema,
  parseJson,
  effectEntrySchema,
  recipeEntrySchema,
  skillEntrySchema,
  statRowEntrySchema,
  unitKindEntrySchema,
} from "@terra/content";
import { loadContentPack } from "@terra/content/node";
import {
  type CombatCatalog,
  type EconomyCatalog,
  type Scenario,
  combatCatalogFrom,
  parseScenario,
} from "../src/index.ts";

/** 저장소의 기본 콘텐츠 팩 */
export const DEFAULT_PACK_DIR = fileURLToPath(new URL("../../../content/core", import.meta.url));

/** 이름(scenarios/<이름>.json) 또는 .json 경로로 시나리오를 읽는다 */
export function readScenario(nameOrPath: string): Scenario {
  const file = nameOrPath.endsWith(".json")
    ? nameOrPath
    : fileURLToPath(new URL(`../scenarios/${nameOrPath}.json`, import.meta.url));
  const value: unknown = JSON.parse(readFileSync(file, "utf8"));
  return parseScenario(value);
}

/** 팩 파일 하나를 그 분류 스키마로 읽는다(이미 검증한 팩이라 실패하지 않는다. 파일이 없으면 빈 목록) */
function parseFile<T>(source: PackSource, file: string, parse: (raw: unknown) => T): T[] {
  const text = source.files.get(file);
  if (text === undefined) return [];
  const value: unknown = parseJson(text);
  const entries: unknown =
    typeof value === "object" && value !== null ? Reflect.get(value, "entries") : undefined;
  if (!Array.isArray(entries)) return [];
  const list: readonly unknown[] = entries;
  return list.map(parse);
}

/** 참조 → ID 문자열 */
function id(ref: { id: string }): string {
  return ref.id;
}

/** 팩의 경제 분류 → 시뮬 경제 목록(참조는 ID 문자열로) */
function catalogOf(source: PackSource): EconomyCatalog {
  return {
    items: parseFile(source, "items.json", (raw) => itemEntrySchema.parse(raw)).map((item) => ({
      id: item.id,
      tier: item.tier,
      category: item.category,
      baseValue: BigInt(item.baseValue),
      enabled: item.enabled,
    })),
    recipes: parseFile(source, "recipes.json", (raw) => recipeEntrySchema.parse(raw)).map((recipe) => ({
      id: recipe.id,
      facility: id(recipe.facility),
      inputs: recipe.inputs.map((stack) => ({ item: id(stack.item), qty: BigInt(stack.qty) })),
      outputs: recipe.outputs.map((stack) => ({ item: id(stack.item), qty: BigInt(stack.qty) })),
      work: recipe.work,
      enabled: recipe.enabled,
    })),
    facilities: parseFile(source, "facilities.json", (raw) => facilityEntrySchema.parse(raw)).map(
      (facility) => ({
        id: facility.id,
        stage: facility.stage,
        slotsPerLevel: facility.slotsPerLevel,
        enabled: facility.enabled,
      }),
    ),
    necessities: parseFile(source, "necessities.json", (raw) => necessityEntrySchema.parse(raw)).map(
      (necessity) => ({
        id: necessity.id,
        item: id(necessity.item),
        perUnit: BigInt(necessity.perUnit),
        periodHours: necessity.periodHours,
        enabled: necessity.enabled,
      }),
    ),
    presets: parseFile(source, "nation_presets.json", (raw) => nationPresetEntrySchema.parse(raw)).map(
      (preset) => ({
        id: preset.id,
        currency: preset.currency.code,
        tradeTaxBp: preset.tradeTaxBp,
        enabled: preset.enabled,
      }),
    ),
  };
}

/** 팩의 전투 분류 → 시뮬 전투 자료(변환은 combatCatalogFrom) */
function combatCatalogOf(source: PackSource): CombatCatalog {
  return combatCatalogFrom({
    statRows: parseFile(source, "stat_rows.json", (raw) => statRowEntrySchema.parse(raw)),
    effects: parseFile(source, "effects.json", (raw) => effectEntrySchema.parse(raw)),
    skills: parseFile(source, "skills.json", (raw) => skillEntrySchema.parse(raw)),
    items: parseFile(source, "items.json", (raw) => itemEntrySchema.parse(raw)),
    unitKinds: parseFile(source, "unit_kinds.json", (raw) => unitKindEntrySchema.parse(raw)),
  });
}

/** 콘텐츠 팩을 읽고 시나리오가 가리키는 행성이 팩에 있는지 본다. 판·해시와 경제 목록·스탯 표를 돌려준다 */
export function readPack(
  dir: string,
  scenario: Scenario,
): { version: string; hash: string; catalog: EconomyCatalog; combat: CombatCatalog } {
  const loaded = loadContentPack(dir);
  if (hasErrors(loaded.issues) || !loaded.pack || !loaded.version || !loaded.hash || !loaded.source) {
    throw new Error(
      [`콘텐츠 팩 검증 실패(${dir})`, ...loaded.issues.map((issue) => formatIssue(issue, `${dir}/`))].join(
        "\n",
      ),
    );
  }
  if (scenario.planet !== undefined) {
    const planets = loaded.pack.entries.get("planets") ?? [];
    if (!planets.some((entry) => entry.id === scenario.planet))
      throw new Error(`시나리오 ${scenario.id}의 행성 ${scenario.planet}이(가) 팩에 없습니다`);
  }
  return {
    version: loaded.version,
    hash: loaded.hash,
    catalog: catalogOf(loaded.source),
    combat: combatCatalogOf(loaded.source),
  };
}

/** 세력마다 일꾼 수를 바꿔 전체 유닛이 약 total개가 되게 한다(속도 측정용) */
export function withUnits(scenario: Scenario, total: number): Scenario {
  const factions = scenario.factions.reduce((sum, group) => sum + group.count, 0);
  const each = Math.ceil(total / factions);
  return { ...scenario, factions: scenario.factions.map((group) => ({ ...group, workers: each })) };
}

/** 사람이 읽는 수(천 단위 쉼표) */
export function fmt(value: number, digits = 0): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}
