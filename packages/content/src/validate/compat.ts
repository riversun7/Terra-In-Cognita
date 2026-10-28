// 4b단계: 이전 버전과의 호환 — 기준 커밋(이전 배포)의 팩과 지금 팩을 비교한다.
// 기준 쪽은 느슨하게 읽는다(entries[].id, manifest, id-changes만). 같은 커밋에서 스키마가 바뀌어도 비교할 수 있게.
// - 기준에 있던 ID가 사라졌는데 이름 변경·삭제 기록이 없으면 실패(운영 데이터가 쓰고 있을 때. M0는 모두 쓰는 것으로 본다)
// - 기준에 있던 기록을 고치거나 지우면 실패(뒤에 추가만)
// - 내용이 바뀌었는데 팩 버전을 올리지 않았거나, 버전이 내려가면 실패(줄 바꿈·순서만 바뀐 것은 내용 변경이 아님)
// - 새 기록의 since는 (기준 버전, 지금 버전] 안
import { canonicalPackJson, sortKeys } from "../canonical.ts";
import type { ContentIssue } from "../issue.ts";
import { parsePackFiles } from "../pack.ts";
import { ID_CHANGES_FILE } from "../schema/idChanges.ts";
import { MANIFEST_FILE } from "../schema/manifest.ts";

/** 느슨하게 읽은 팩 */
export interface PackSnapshot {
  packId: string;
  /** manifest.json version (정수가 아니면 없음) */
  version: number | undefined;
  /** 분류(파일 이름에서 .json을 뺀 것) → 항목 ID */
  ids: ReadonlyMap<string, readonly string[]>;
  renamed: readonly unknown[];
  removed: readonly unknown[];
  /** manifest.json version을 뺀 정규 JSON — 내용이 바뀌었는지 비교용 */
  body: string;
}

/**
 * 운영 데이터가 ID를 몇 번 쓰는지 (ID → 횟수). 결과에 없는 ID는 쓰는 것으로 본다.
 * 나중에 배포 단계가 DB를 보고 구현한다. M0는 콘텐츠 ID를 담은 표가 없어 assumeAllUsed를 쓴다.
 */
export type LiveUsage = (category: string, ids: readonly string[]) => Promise<ReadonlyMap<string, number>>;

/** 모든 ID를 운영 데이터가 쓰는 것으로 본다 → 사라진 ID는 모두 기록이 있어야 한다 */
export const assumeAllUsed: LiveUsage = async (_category, ids) => new Map(ids.map((id) => [id, 1]));

export interface CompatOptions {
  /** 기준 커밋 표시 (예: abc1234) */
  baseLabel: string;
  liveUsage?: LiveUsage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;
const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** 팩 파일을 느슨하게 읽는다. JSON 문법 오류는 SyntaxError로 던진다 */
export function snapshotPack(packId: string, files: ReadonlyMap<string, string>): PackSnapshot {
  const parsed = parsePackFiles(files);
  const manifest = asRecord(parsed[MANIFEST_FILE]);
  const changes = asRecord(parsed[ID_CHANGES_FILE]);
  const ids = new Map<string, string[]>();
  for (const [name, value] of Object.entries(parsed)) {
    if (name === MANIFEST_FILE || name === ID_CHANGES_FILE) continue;
    const list = asArray(asRecord(value)?.entries)
      .map((entry) => asRecord(entry)?.id)
      .filter((id): id is string => typeof id === "string");
    ids.set(name.slice(0, -".json".length), list);
  }
  const version = manifest?.version;
  const withoutVersion = { ...parsed, [MANIFEST_FILE]: { ...manifest, version: undefined } };
  return {
    packId,
    version: typeof version === "number" && Number.isSafeInteger(version) ? version : undefined,
    ids,
    renamed: asArray(changes?.renamed),
    removed: asArray(changes?.removed),
    body: canonicalPackJson(withoutVersion),
  };
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

/** 지금 팩에 이 ID의 이름 변경·삭제 기록이 있는지 */
function isRecorded(head: PackSnapshot, category: string, id: string): boolean {
  return (
    head.renamed.some((record) => asRecord(record)?.category === category && asRecord(record)?.from === id) ||
    head.removed.some((record) => asRecord(record)?.category === category && asRecord(record)?.id === id)
  );
}

export async function checkCompat(
  base: PackSnapshot,
  head: PackSnapshot,
  options: CompatOptions,
): Promise<ContentIssue[]> {
  const issues: ContentIssue[] = [];
  const liveUsage = options.liveUsage ?? assumeAllUsed;
  const baseName = `기준 커밋(${options.baseLabel}, ${base.packId}@${base.version ?? "?"})`;

  // 사라진 ID
  for (const [category, baseIds] of base.ids) {
    const now = new Set(head.ids.get(category) ?? []);
    const missing = baseIds.filter((id) => !now.has(id) && !isRecorded(head, category, id));
    if (missing.length === 0) continue;
    const usage = await liveUsage(category, missing);
    for (const id of missing) {
      if ((usage.get(id) ?? 1) === 0) continue;
      issues.push({
        stage: "compat",
        level: "error",
        file: `${category}.json`,
        id,
        message: `${baseName}에는 있는데 지금은 없습니다. 이름을 바꿨으면 id-changes.json renamed에, 지웠으면 removed에 적으세요.`,
      });
    }
  }

  // 기록은 뒤에 추가만
  for (const kind of ["renamed", "removed"] as const) {
    base[kind].forEach((record, index) => {
      if (same(record, head[kind][index])) return;
      issues.push({
        stage: "compat",
        level: "error",
        file: ID_CHANGES_FILE,
        path: `${kind}[${index}]`,
        message: `${baseName}에 있던 기록이 바뀌었거나 지워졌습니다. 기록은 고치거나 지우지 않고 뒤에 추가만 합니다.`,
      });
    });
  }

  // 팩 버전
  if (base.version === undefined || head.version === undefined) return issues;
  if (head.version < base.version) {
    issues.push({
      stage: "compat",
      level: "error",
      file: MANIFEST_FILE,
      path: "version",
      message: `팩 버전이 내려갔습니다(${base.version} → ${head.version}). 버전은 올리기만 합니다.`,
    });
    return issues;
  }
  if (head.version === base.version) {
    if (head.body !== base.body) {
      issues.push({
        stage: "compat",
        level: "error",
        file: MANIFEST_FILE,
        path: "version",
        message: `내용이 바뀌었는데 팩 버전이 그대로입니다(${head.version}). manifest.json version을 ${head.version + 1}로 올리세요.`,
      });
    }
    return issues;
  }

  // 새 기록의 since: (기준 버전, 지금 버전]
  const [from, to] = [base.version, head.version];
  for (const kind of ["renamed", "removed"] as const) {
    head[kind].forEach((record, index) => {
      if (index < base[kind].length) return;
      const since = asRecord(record)?.since;
      if (typeof since === "number" && since > from && since <= to) return;
      issues.push({
        stage: "compat",
        level: "error",
        file: ID_CHANGES_FILE,
        path: `${kind}[${index}].since`,
        message: `새 기록의 since가 이번 변경의 버전이 아닙니다. ${from + 1}~${to}(보통 ${to})을 적으세요.`,
      });
    });
  }
  return issues;
}

/**
 * 기준 팩 파일과 지금 팩 파일을 비교한다. 기준 쪽을 읽지 못하면 경고만 하고 건너뛴다.
 * 기준에 팩이 없으면(새 팩) 부르지 않는다.
 */
export async function comparePacks(
  packId: string,
  baseFiles: ReadonlyMap<string, string>,
  headFiles: ReadonlyMap<string, string>,
  options: CompatOptions,
): Promise<ContentIssue[]> {
  let base: PackSnapshot;
  try {
    base = snapshotPack(packId, baseFiles);
  } catch (error) {
    return [
      {
        stage: "compat",
        level: "warning",
        message: `기준 커밋(${options.baseLabel})의 팩을 읽지 못해 호환 검사를 건너뜁니다(${error instanceof Error ? error.message : String(error)}).`,
      },
    ];
  }
  return checkCompat(base, snapshotPack(packId, headFiles), options);
}
