// 2단계: 참조 무결성 — 중복 ID, 없는 ID 참조, 고아(모르는 파일, 아무도 참조하지 않는 항목)
import type { ContentIssue } from "../issue.ts";
import type { ContentPack, PackSource } from "../pack.ts";
import type { CategoryRegistry } from "../schema/categories.ts";
import { ContentRef } from "../schema/common.ts";
import { ID_CHANGES_FILE } from "../schema/idChanges.ts";
import { MANIFEST_FILE } from "../schema/manifest.ts";

/** 편집 거리(글자 넣기·빼기·바꾸기 횟수) */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current.push(
        Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost),
      );
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/** 오타로 보이는 가장 가까운 ID (거리 2 이하, 같으면 사전 순 앞의 것) */
export function suggestId(wrong: string, candidates: Iterable<string>): string | undefined {
  let best: { id: string; distance: number } | undefined;
  for (const id of candidates) {
    const distance = editDistance(wrong, id);
    if (distance > 2) continue;
    if (!best || distance < best.distance || (distance === best.distance && id < best.id))
      best = { id, distance };
  }
  return best?.id;
}

interface FoundRef {
  ref: ContentRef;
  /** 항목 안 경로 (예: cost[0].item) */
  path: string;
}

/** 파싱 결과에서 참조를 모두 모은다. 참조는 스키마의 ref()가 ContentRef로 바꿔 둔다 */
function collectRefs(value: unknown, path: string, found: FoundRef[]): void {
  if (value instanceof ContentRef) {
    found.push({ ref: value, path });
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collectRefs(item, `${path}[${index}]`, found));
  } else if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value))
      collectRefs(item, path === "" ? key : `${path}.${key}`, found);
  }
}

export function checkReferences(
  source: PackSource,
  pack: ContentPack,
  registry: CategoryRegistry,
): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const categories = Object.keys(registry);

  // 고아 1: 팩 폴더의 모르는 파일
  const known = new Set([
    MANIFEST_FILE,
    ID_CHANGES_FILE,
    ...categories.map((category) => `${category}.json`),
  ]);
  for (const name of [...source.files.keys()].toSorted()) {
    if (known.has(name)) continue;
    issues.push({
      stage: "references",
      level: "error",
      file: name,
      message: `모르는 파일입니다. 팩 폴더에는 ${[...known].join(", ")}만 둡니다(분류 파일 이름에 오타가 없는지 확인하세요).`,
      code: "file_unknown",
    });
  }

  // 중복 ID (분류 안에서)
  const ids = new Map<string, Set<string>>();
  for (const category of categories) {
    const seen = new Map<string, number>();
    (pack.entries.get(category) ?? []).forEach((entry, index) => {
      const first = seen.get(entry.id);
      if (first === undefined) {
        seen.set(entry.id, index);
        return;
      }
      issues.push({
        stage: "references",
        level: "error",
        file: `${category}.json`,
        id: entry.id,
        message: `ID가 중복됩니다(entries[${first}]와 entries[${index}]). ID는 분류 안에서 하나만 씁니다.`,
        code: "id_duplicate",
        params: { id: entry.id },
      });
    });
    ids.set(category, new Set(seen.keys()));
  }

  // 없는 ID 참조
  const referenced = new Map<string, Set<string>>();
  for (const category of categories) {
    for (const entry of pack.entries.get(category) ?? []) {
      const found: FoundRef[] = [];
      collectRefs(entry, "", found);
      for (const { ref, path } of found) {
        const targets = ids.get(ref.category);
        const where = {
          stage: "references",
          level: "error",
          file: `${category}.json`,
          id: entry.id,
          path,
        } as const;
        if (!targets) {
          issues.push({
            ...where,
            message: `모르는 분류 "${ref.category}"를 가리킵니다. 스키마의 ref()를 확인하세요.`,
          });
          continue;
        }
        if (!targets.has(ref.id)) {
          const guess = suggestId(ref.id, targets);
          issues.push({
            ...where,
            message: `없는 ${ref.category} ID "${ref.id}"입니다. ${guess ? `혹시 "${guess}"?` : `${ref.category}.json에 있는 ID인지 확인하세요.`}`,
            code: "ref_missing",
            params: { category: ref.category, id: ref.id },
          });
          continue;
        }
        if (!referenced.has(ref.category)) referenced.set(ref.category, new Set());
        referenced.get(ref.category)?.add(ref.id);
      }
    }
  }

  // 고아 2: 꼭 어딘가에서 써야 하는 분류인데 아무도 참조하지 않는 항목
  for (const [category, definition] of Object.entries(registry)) {
    if (!definition.mustBeReferenced) continue;
    for (const entry of pack.entries.get(category) ?? []) {
      if (referenced.get(category)?.has(entry.id)) continue;
      issues.push({
        stage: "references",
        level: "error",
        file: `${category}.json`,
        id: entry.id,
        message: `아무 데서도 참조하지 않는 ${category} 항목입니다. 쓰는 곳을 만들거나, 지우고 id-changes.json removed에 기록하세요.`,
        code: "orphan",
      });
    }
  }

  return issues;
}
