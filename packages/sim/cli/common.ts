// 실행 도구 공용 — 시나리오·콘텐츠 팩 읽기 (docs/adr/2026-10-31-rules-simulator.md "실행 도구")
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  type FormulaEntry,
  type PackSource,
  type StatRowEntry,
  facilityEntrySchema,
  formulaEntrySchema,
  gatherTierEntrySchema,
  overlayFormulasDiff,
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
  overlayStatRowsDiff,
  overlayTuningDiff,
  tuningDiffSchema,
  tuningEntrySchema,
  unitKindEntrySchema,
  validatePack,
  type EntriesDiffChange,
} from "@terra/content";
import { loadContentPack, overlayEntriesDiff } from "@terra/content/node";
import {
  type CombatCatalog,
  type CombatFormulaSet,
  type EconomyCatalog,
  type Scenario,
  combatCatalogFrom,
  combatFormulaSetFrom,
  combatFormulasFromPack,
  parseScenario,
  withStatTable,
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
      startPrice: BigInt(item.startPrice),
      ...(item.subcategory ? { subcategory: id(item.subcategory) } : {}),
      ...(item.lotSize === undefined ? {} : { lotSize: BigInt(item.lotSize) }),
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
        pollution: facility.pollution ?? 0,
        ...(facility.gather
          ? {
              gather: {
                primary: facility.gather.primary,
                secondary: facility.gather.secondary,
                subcategory: id(facility.gather.subcategory),
                ...(facility.gather.extraSubcategories
                  ? { extraSubcategories: facility.gather.extraSubcategories.map((ref) => id(ref)) }
                  : {}),
                mode: facility.gather.mode ?? "roll",
                yieldBase: facility.gather.yieldBase,
                yieldPerStatPm: facility.gather.yieldPerStatPm,
                yieldCap: facility.gather.yieldCap,
                catch: facility.gather.catch,
              },
            }
          : {}),
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
    // 채집 티어 확률표(팩 gather_tiers, 파일 차례 = from 차례). 파일이 없으면 시뮬 기본표(TEST_GATHER_BANDS)
    ...gatherBandsOf(source),
  };
}

/** 팩 gather_tiers → 시뮬 확률표(파일이 없거나 비면 칸을 두지 않는다) */
function gatherBandsOf(source: PackSource): { gatherBands?: { from: number; weightsPm: number[] }[] } {
  const bands = parseFile(source, "gather_tiers.json", (raw) => gatherTierEntrySchema.parse(raw)).map(
    (band) => ({ from: band.from, weightsPm: [...band.weightsPm] }),
  );
  return bands.length > 0 ? { gatherBands: bands } : {};
}

/** 팩의 전투 분류 → 시뮬 전투 자료(변환은 combatCatalogFrom). 가중치 표 행은 따로 돌려준다(--tuning 가중치 칸 차이) */
function combatCatalogOf(source: PackSource, statRows: StatRowEntry[]): CombatCatalog {
  return combatCatalogFrom({
    statRows,
    effects: parseFile(source, "effects.json", (raw) => effectEntrySchema.parse(raw)),
    skills: parseFile(source, "skills.json", (raw) => skillEntrySchema.parse(raw)),
    items: parseFile(source, "items.json", (raw) => itemEntrySchema.parse(raw)),
    unitKinds: parseFile(source, "unit_kinds.json", (raw) => unitKindEntrySchema.parse(raw)),
  });
}

/**
 * 내보내기 차이의 팩 항목(entries)을 얹지 못했다(만든 항목이 팩 ID와 겹침·팩에 없는 항목을 고친 줄·얹은 실효 팩이 검사에 걸림).
 * 시뮬레이터는 종료 코드 2로 끝낸다(서버 세계와 다른 자료로 말없이 돌지 않게, docs/adr/2026-11-01-item-editor.md 4절)
 */
export class EntriesDiffError extends Error {
  readonly lines: readonly string[];
  constructor(lines: readonly string[]) {
    super(lines.join("\n"));
    this.lines = lines;
  }
}

/** 차이 파일의 팩 항목 줄(없으면 빈 목록) */
export function entriesOfDiff(file: string): EntriesDiffChange[] {
  return tuningDiffSchema.parse(JSON.parse(readFileSync(file, "utf8"))).entries ?? [];
}

/** 팩 위에 차이의 팩 항목을 얹는다(서버 실효 차례와 같다). 얹지 못한 줄이 있거나 실효 팩이 검사에 걸리면 EntriesDiffError */
function withEntries(source: PackSource, dir: string, entries: readonly EntriesDiffChange[]): PackSource {
  if (entries.length === 0) return source;
  const overlay = overlayEntriesDiff(source, entries);
  if (overlay.stale.length > 0)
    console.error(`항목 차이: 내보낼 때와 팩 항목이 다른 줄(차이 항목을 씀) — ${overlay.stale.join(", ")}`);
  const problems = overlay.skipped.map(
    (skip) =>
      `항목 차이: 얹지 못함 ${skip.category}/${skip.id} — ${
        skip.reason === "collision"
          ? "만든 항목인데 팩에 같은 ID가 있음(서버는 잠재운다)"
          : "팩에 없는 항목을 고친 줄(서버는 지운다)"
      }`,
  );
  const checked = validatePack(overlay.source);
  if (hasErrors(checked.issues))
    problems.push(
      "항목 차이: 얹은 실효 팩이 검사에 걸림",
      ...checked.issues
        .filter((issue) => issue.level === "error")
        .map((issue) => formatIssue(issue, `${dir}/`)),
    );
  if (problems.length > 0) throw new EntriesDiffError(problems);
  console.error(`항목 차이: 팩 항목 ${overlay.applied.length}개를 얹음`);
  return overlay.source;
}

/**
 * 콘텐츠 팩을 읽고 시나리오가 가리키는 행성이 팩에 있는지 본다. 판·해시와 경제 목록·스탯 표를 돌려준다.
 * entries: 내보내기 차이의 팩 항목(--tuning). 있으면 팩 위에 얹은 실효 팩으로 경제·전투 자료를 만든다(판·해시는 팩 것)
 */
export function readPack(
  dir: string,
  scenario: Scenario,
  entries: readonly EntriesDiffChange[] = [],
): {
  version: string;
  hash: string;
  catalog: EconomyCatalog;
  combat: CombatCatalog;
  statRows: StatRowEntry[];
  /** 팩 전투 계산식 항목(formulas.json)과 그 묶음(docs/adr/2026-11-01-formula-editor.md) */
  formulaEntries: FormulaEntry[];
  combatFormulas: CombatFormulaSet;
  tuning: Map<string, number>;
} {
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
  const source = withEntries(loaded.source, dir, entries);
  const statRows = parseFile(source, "stat_rows.json", (raw) => statRowEntrySchema.parse(raw));
  const formulaEntries = parseFile(source, "formulas.json", (raw) => formulaEntrySchema.parse(raw));
  return {
    version: loaded.version,
    hash: loaded.hash,
    catalog: catalogOf(source),
    combat: combatCatalogOf(source, statRows),
    statRows,
    formulaEntries,
    combatFormulas: combatFormulasFromPack(formulaEntries),
    tuning: new Map(
      parseFile(source, "tuning.json", (raw) => tuningEntrySchema.parse(raw)).map((entry) => [
        entry.id,
        entry.value,
      ]),
    ),
  };
}

/**
 * 개발자 패널 내보내기 차이(`terra-tuning-diff`, docs/adr/2026-11-01-dev-settings-panel.md 11절)를 팩 설정 칸 값 위에 얹는다.
 * 서버가 그 세계에서 쓰는 실효 값과 같다. 팩에 없는 ID는 얹지 않고(서버도 듣지 않는다), 팩 값이 차이의 from과 다르면 알린다
 */
export function withTuningDiff(tuning: ReadonlyMap<string, number>, file: string): Map<string, number> {
  const diff = tuningDiffSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const result = overlayTuningDiff(tuning, diff);
  if (result.unknown.length > 0)
    console.error(`설정 차이: 팩에 없는 칸은 건너뜀 — ${result.unknown.join(", ")}`);
  if (result.stale.length > 0)
    console.error(`설정 차이: 내보낼 때와 팩 값이 다른 칸(차이 값을 씀) — ${result.stale.join(", ")}`);
  console.error(
    `설정 차이: ${diff.contentVersion}에서 내보낸 칸 ${diff.changes.length - result.unknown.length}개를 얹음`,
  );
  return result.values;
}

/**
 * 같은 차이 파일의 가중치 표 칸(statRows, 밸런스 화면 — docs/adr/2026-11-01-balance-screen.md 2절)과 계산식(formulas,
 * docs/adr/2026-11-01-formula-editor.md)을 팩 위에 얹은 전투 자료·전투 식 묶음. 칸이 없으면 그대로. 서버 세계의 실효 값과 같다
 * (팩에 없는 칸·틀린 식은 얹지 않는다). 행 식은 가중치 칸을 얹은 행 위에 얹는다
 */
export function withStatRowsDiff(
  combat: CombatCatalog,
  statRows: readonly StatRowEntry[],
  file: string,
  formulaEntries: readonly FormulaEntry[] = [],
  combatFormulas?: CombatFormulaSet,
): { combat: CombatCatalog; combatFormulas: CombatFormulaSet | undefined } {
  const diff = tuningDiffSchema.parse(JSON.parse(readFileSync(file, "utf8")));
  const changes = diff.statRows ?? [];
  const formulaChanges = diff.formulas ?? [];
  if (changes.length === 0 && formulaChanges.length === 0) return { combat, combatFormulas };
  const result = overlayStatRowsDiff(statRows, changes);
  if (result.unknown.length > 0)
    console.error(`가중치 차이: 팩에 없는 칸은 건너뜀 — ${result.unknown.join(", ")}`);
  if (result.stale.length > 0)
    console.error(`가중치 차이: 내보낼 때와 팩 값이 다른 칸(차이 값을 씀) — ${result.stale.join(", ")}`);
  if (changes.length > 0) console.error(`가중치 차이: 칸 ${changes.length - result.unknown.length}개를 얹음`);
  const formulas = overlayFormulasDiff(formulaEntries, result.rows, formulaChanges);
  if (formulas.unknown.length + formulas.invalid.length > 0)
    console.error(
      `식 차이: 팩에 없는 칸·틀린 식은 건너뜀 — ${[...formulas.unknown, ...formulas.invalid].join(", ")}`,
    );
  if (formulas.stale.length > 0)
    console.error(`식 차이: 내보낼 때와 팩 식이 다른 칸(차이 식을 씀) — ${formulas.stale.join(", ")}`);
  if (formulaChanges.length > 0)
    console.error(
      `식 차이: 칸 ${formulaChanges.length - formulas.unknown.length - formulas.invalid.length}개를 얹음`,
    );
  const { statTable } = combatCatalogFrom({
    statRows: formulas.rows,
    effects: [],
    skills: [],
    items: [],
    unitKinds: [],
  });
  return {
    // 얹은 가중치 표를 전투 자료에 싣는다(서버 roster catalog와 같은 규칙)
    combat: withStatTable(combat, statTable),
    combatFormulas: combatFormulaSetFrom(Object.fromEntries(formulas.formulas)),
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
