// 4a단계: ID 변경표(id-changes.json) — git 없이 팩 하나만 보고 검사한다.
// - 이름 바꾸기·대체 보상을 따라가면 지금 팩에 있는 ID(또는 보상 없이 지운 ID)에 닿아야 하고, 돌고 돌면 안 된다.
// - 바꾸거나 지운 옛 ID는 팩에 다시 나오면 안 된다(한 번 쓴 ID는 다시 쓰지 않는다).
// - 한 ID는 한 번만 기록한다. since는 지금 팩 버전 이하.
import type { ContentIssue } from "../issue.ts";
import type { ContentPack } from "../pack.ts";
import type { CategoryRegistry } from "../schema/categories.ts";
import { ID_CHANGES_FILE } from "../schema/idChanges.ts";

/** 한 ID 기록이 가리키는 다음 ID. 보상 없이 지웠으면 next가 없다 */
interface Step {
  category: string;
  id: string;
  next: string | undefined;
  /** 기록 위치 (예: renamed[0]) */
  path: string;
}

const keyOf = (category: string, id: string): string => `${category}/${id}`;

export function checkIdChanges(pack: ContentPack, registry: CategoryRegistry): ContentIssue[] {
  const issues: ContentIssue[] = [];
  const version = pack.manifest.version;
  const issue = (path: string, message: string): void => {
    issues.push({ stage: "idChanges", level: "error", file: ID_CHANGES_FILE, path, message });
  };
  const ids = new Map<string, Set<string>>();
  for (const [category, entries] of pack.entries)
    ids.set(category, new Set(entries.map((entry) => entry.id)));
  const exists = (category: string, id: string): boolean => ids.get(category)?.has(id) ?? false;

  const steps = new Map<string, Step>();
  const records = [
    ...pack.idChanges.renamed.map((record, index) => ({
      category: record.category,
      id: record.from,
      next: record.to as string | undefined,
      since: record.since,
      path: `renamed[${index}]`,
    })),
    ...pack.idChanges.removed.map((record, index) => ({
      category: record.category,
      id: record.id,
      next: record.compensation.kind === "replace" ? record.compensation.with : undefined,
      since: record.since,
      path: `removed[${index}]`,
    })),
  ];
  for (const record of records) {
    if (!(record.category in registry)) {
      issue(
        `${record.path}.category`,
        `모르는 분류 "${record.category}"입니다. 쓸 수 있는 분류: ${Object.keys(registry).join(", ")}.`,
      );
      continue;
    }
    if (record.since > version) {
      issue(
        `${record.path}.since`,
        `since(${record.since})가 지금 팩 버전(${version})보다 큽니다. 바꾼 팩 버전(지금 버전 이하)을 적으세요.`,
      );
    }
    if (record.next === record.id) {
      issue(record.path, `"${record.id}"를 자기 자신으로 바꿉니다. 새 ID를 적으세요.`);
      continue;
    }
    const key = keyOf(record.category, record.id);
    const earlier = steps.get(key);
    if (earlier) {
      issue(
        record.path,
        `${record.category} ID "${record.id}"를 이미 ${earlier.path}에 기록했습니다. 한 ID는 한 번만 바꾸거나 지웁니다.`,
      );
      continue;
    }
    steps.set(key, { category: record.category, id: record.id, next: record.next, path: record.path });
    if (exists(record.category, record.id)) {
      issue(
        record.path,
        `바꾸거나 지운 ${record.category} ID "${record.id}"가 팩에 아직 있습니다. 한 번 쓴 ID는 다시 쓰지 않으니 새 ID를 쓰세요.`,
      );
    }
  }

  // 다음 ID가 팩에 있거나, 그 ID도 기록이 있어 계속 따라갈 수 있어야 한다
  for (const step of steps.values()) {
    if (step.next === undefined || exists(step.category, step.next)) continue;
    if (steps.has(keyOf(step.category, step.next))) continue;
    const field = step.path.startsWith("renamed") ? "to" : "compensation.with";
    issue(
      `${step.path}.${field}`,
      `가리키는 ${step.category} ID "${step.next}"가 팩에 없습니다. 지금 팩에 있는 ID를 적으세요.`,
    );
  }

  // 순환: a → b → a. 같은 순환은 한 번만 알린다
  const reported = new Set<string>();
  for (const start of steps.values()) {
    const chain = [start.id];
    let step: Step | undefined = start;
    while (step?.next !== undefined) {
      const next: string = step.next;
      if (chain.includes(next)) {
        const loop = chain.slice(chain.indexOf(next));
        const signature = keyOf(start.category, loop.toSorted().join(","));
        if (!reported.has(signature)) {
          reported.add(signature);
          issue(
            start.path,
            `ID 변경이 돌고 돕니다: ${[...loop, next].join(" → ")}. 마지막이 지금 팩에 있는 ID가 되게 고치세요.`,
          );
        }
        break;
      }
      chain.push(next);
      step = steps.get(keyOf(start.category, next));
    }
  }

  return issues;
}
