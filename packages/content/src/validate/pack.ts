// 팩 하나 검증 — 1단계(스키마) → 2단계(참조 무결성, 이어서 행성 바이옴 표·계산식·아이템 사이 규칙·채집 티어표·시설 건설 재료·크리쳐 초기 합)·4a단계(ID 변경표).
// 검사 스크립트, 서버 시작, (나중에) 브라우저 편집기가 같은 함수를 쓴다. 파일 시스템·git은 쓰지 않는다.
import { type ContentIssue, hasErrors } from "../issue.ts";
import type { ContentPack, PackSource } from "../pack.ts";
import { CATEGORIES, type CategoryRegistry } from "../schema/categories.ts";
import { checkCombatClasses } from "./combatClasses.ts";
import { checkDisplaceEffects } from "./displace.ts";
import { checkExpTable } from "./expTable.ts";
import { checkFormulas } from "./formulas.ts";
import { checkFacilities } from "./facilities.ts";
import { checkGather } from "./gather.ts";
import { checkIdChanges } from "./idChanges.ts";
import { checkItems } from "./items.ts";
import { checkNations } from "./nations.ts";
import { checkPlanetBiomeTables } from "./planets.ts";
import { checkReferences } from "./references.ts";
import { checkSchema } from "./schema.ts";
import { checkStatSums } from "./statSums.ts";

export interface ValidationResult {
  issues: ContentIssue[];
  /** 오류가 없을 때만 있다 */
  pack: ContentPack | undefined;
}

export function validatePack(source: PackSource, registry: CategoryRegistry = CATEGORIES): ValidationResult {
  const schema = checkSchema(source, registry);
  // 스키마가 틀리면 참조·변경표 결과는 믿을 수 없으므로 여기서 멈춘다
  if (!schema.pack) return { issues: schema.issues, pack: undefined };
  const issues = [
    ...schema.issues,
    ...checkReferences(source, schema.pack, registry),
    ...checkPlanetBiomeTables(schema.pack),
    ...checkFormulas(schema.pack),
    ...checkItems(schema.pack),
    ...checkGather(schema.pack),
    ...checkCombatClasses(schema.pack),
    ...checkExpTable(schema.pack),
    ...checkDisplaceEffects(schema.pack),
    ...checkFacilities(schema.pack),
    ...checkNations(schema.pack),
    ...checkStatSums(schema.pack),
    ...checkIdChanges(schema.pack, registry),
  ];
  return { issues, pack: hasErrors(issues) ? undefined : schema.pack };
}
