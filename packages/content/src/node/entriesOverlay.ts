// 내보내기 차이의 팩 항목(entries)을 팩 위에 얹는다 — 시뮬레이터 `--tuning`(docs/adr/2026-11-01-item-editor.md 4절, 설계안 WP-1 b).
// 서버 세계가 켤 때 고르는 규칙과 같게 얹는다: 팩 항목을 고친 줄(from = 해시)은 그 자리에, 만든 항목(from = null)은 끝에 ID 차례로.
// - from이 지금 팩 항목 해시와 다르면 stale(차이 값을 쓴다, 설정 칸 차이와 같다. 서버는 그 팩으로 배포되면 팩이 이긴다).
// - 만든 항목인데 팩에 그 ID가 생겼으면 collision(서버는 잠재운다), 팩 항목을 고친 줄인데 팩에 그 ID가 없으면 unknown(서버는 지운다):
//   둘 다 얹지 않는다. 부르는 쪽(시뮬레이터)은 얹지 못한 줄이 있거나 실효 팩이 검사에 걸리면 종료 코드 2로 끝낸다.
// 해시(node:crypto) 때문에 Node 전용 부분에 둔다.
import { effectiveSource, readCategoryFile } from "../effective.ts";
import type { PackSource } from "../pack.ts";
import { hashEntry } from "./hash.ts";

export interface EntriesOverlayChange {
  readonly category: string;
  readonly id: string;
  readonly from: string | null;
  readonly entry: Readonly<Record<string, unknown>>;
}

export interface EntriesOverlayResult {
  /** 얹은 실효 팩(얹지 못한 줄은 빼고) */
  readonly source: PackSource;
  readonly applied: readonly { category: string; id: string; kind: "replaced" | "added" }[];
  /** 내보낼 때와 팩 항목이 다른 줄(`<분류>/<ID>`, 차이 값을 썼다) */
  readonly stale: readonly string[];
  readonly skipped: readonly { category: string; id: string; reason: "collision" | "unknown" }[];
}

export function overlayEntriesDiff(
  source: PackSource,
  changes: readonly EntriesOverlayChange[],
): EntriesOverlayResult {
  const packHash = new Map<string, string>();
  for (const category of new Set(changes.map((change) => change.category)))
    for (const entry of readCategoryFile(source, category).entries) {
      const id = entry.id;
      if (typeof id === "string") packHash.set(`${category}/${id}`, hashEntry(entry));
    }
  const applied: { category: string; id: string; kind: "replaced" | "added" }[] = [];
  const stale: string[] = [];
  const skipped: { category: string; id: string; reason: "collision" | "unknown" }[] = [];
  const overrides: { category: string; id: string; entry: Readonly<Record<string, unknown>> }[] = [];
  for (const change of changes) {
    const key = `${change.category}/${change.id}`;
    const current = packHash.get(key);
    if (change.from === null) {
      if (current !== undefined) {
        skipped.push({ category: change.category, id: change.id, reason: "collision" });
        continue;
      }
      applied.push({ category: change.category, id: change.id, kind: "added" });
    } else {
      if (current === undefined) {
        skipped.push({ category: change.category, id: change.id, reason: "unknown" });
        continue;
      }
      if (current !== change.from) stale.push(key);
      applied.push({ category: change.category, id: change.id, kind: "replaced" });
    }
    overrides.push({ category: change.category, id: change.id, entry: change.entry });
  }
  return { source: effectiveSource(source, overrides), applied, stale, skipped };
}
