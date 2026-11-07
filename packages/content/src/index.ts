// 콘텐츠 팩 형식(스키마)과 검증기 (PLAN 7장, docs/adr/2026-10-28-content-pack-format.md)
// 여기 있는 코드는 Node 전용 API를 쓰지 않는다(브라우저 편집기에서도 쓴다). 파일 읽기·해시는 "@terra/content/node".
export { CONTENT_FORMAT_VERSION, contentVersionOf } from "./version.ts";
export { type ContentIssue, type ContentStage, STAGE_LABELS, formatIssue, hasErrors } from "./issue.ts";
export { type ContentPack, type PackSource, parseJson, parsePackFiles } from "./pack.ts";
export { canonicalPackJson, sortKeys } from "./canonical.ts";
export {
  type EntryJson,
  type EntryOverride,
  categoryFile,
  effectiveEntries,
  effectiveSource,
  readCategoryFile,
} from "./effective.ts";
export {
  ID_PATTERN,
  ContentRef,
  amount,
  contentId,
  koreanErrorMap,
  localizedText,
  ref,
  type LocalizedText,
} from "./schema/common.ts";
export { MANIFEST_FILE, manifestSchema, type Manifest } from "./schema/manifest.ts";
export {
  ID_CHANGES_FILE,
  idChangesSchema,
  type IdChanges,
  type RemovedRecord,
  type RenamedRecord,
} from "./schema/idChanges.ts";
export {
  CATEGORIES,
  entriesFileSchema,
  itemEntrySchema,
  type CategoryDefinition,
  type CategoryRegistry,
  type ItemEntry,
} from "./schema/categories.ts";
export { biomeEntrySchema, planetEntrySchema, type BiomeEntry, type PlanetEntry } from "./schema/planets.ts";
export {
  FOOD_FAMILIES,
  GENE_KINDS,
  GENE_SOURCES,
  ITEM_SCHEMA_LIMITS,
  PERISH_CATEGORIES,
  STORAGE_KINDS,
  WEAPON_TYPE_SLOTS,
  itemSubcategoryEntrySchema,
  geneSchema,
  itemTagEntrySchema,
  perishSchema,
  useSchema,
  weaponTypeEntrySchema,
  type ItemCategory,
  type ItemSubcategoryEntry,
  type ItemTagEntry,
  type WeaponTypeEntry,
} from "./schema/items.ts";
export {
  FACILITY_STAGES,
  GATHER_MODES,
  GATHER_TIER_COUNT,
  GATHER_WEIGHT_TOTAL,
  ITEM_CATEGORIES,
  facilityEntrySchema,
  gatherTierEntrySchema,
  nationPresetEntrySchema,
  necessityEntrySchema,
  recipeEntrySchema,
  type FacilityEntry,
  type GatherTierEntry,
  type NationPresetEntry,
  type NecessityEntry,
  type RecipeEntry,
} from "./schema/economy.ts";
export { mapPropEntrySchema, type MapPropEntry } from "./schema/mapProps.ts";
export { statRowEntrySchema, type StatRowEntry } from "./schema/stats.ts";
export { formulaEntrySchema, type FormulaEntry } from "./schema/formulas.ts";
export { rankingPathEntrySchema, type RankingPathEntry } from "./schema/ranking.ts";
export { tuningEntrySchema, tuningValueInRange, type TuningEntry } from "./schema/tuning.ts";
export {
  ENTRY_DIFF_CATEGORIES,
  entriesDiffChangeSchema,
  type EntriesDiffChange,
  TUNING_DIFF_FORMAT,
  TUNING_DIFF_FORMAT_VERSION,
  TUNING_DIFF_MAX_CHANGES,
  applyStatRowsDiff,
  applyTuningDiff,
  overlayStatRowsDiff,
  overlayTuningDiff,
  statRowCell,
  statRowsDiffChangeSchema,
  tuningDiffChangeSchema,
  tuningDiffSchema,
  withStatRowCell,
  type StatRowsApplyResult,
  type StatRowsDiffChange,
  type StatRowsSkip,
  type TuningApplyResult,
  type TuningApplySkip,
  type TuningDiff,
  type TuningDiffChange,
} from "./tuningDiff.ts";
export {
  applyFormulasDiff,
  formulaDiffChangeSchema,
  overlayFormulasDiff,
  packStatRowFormula,
  type FormulaDiffChange,
  type FormulaDiffSkip,
  type FormulasApplyResult,
} from "./formulaDiff.ts";
export {
  EFFECT_COMBAT_STATS,
  EQUIP_SLOT_KINDS,
  PRIMARY_STAT_CODES,
  PRIMARY_STAT_SLOTS,
  SKILL_SHAPES,
  effectEntrySchema,
  equipSchema,
  WEAPON_APPROPRIATE_CODES,
  weaponAppropriateSchema,
  skillEntrySchema,
  unitKindEntrySchema,
  type EffectEntry,
  type EquipEntry,
  type SkillEntry,
  type UnitKindEntry,
} from "./schema/combat.ts";
export { validatePack, type ValidationResult } from "./validate/pack.ts";
export { formatPath, zodIssueCode } from "./validate/schema.ts";
export {
  assumeAllUsed,
  checkCompat,
  comparePacks,
  snapshotPack,
  type CompatOptions,
  type LiveUsage,
  type PackSnapshot,
} from "./validate/compat.ts";
