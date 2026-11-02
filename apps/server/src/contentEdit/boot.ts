// 켤 때 고르기 — DB 덮어쓰기 줄에서 "가장 나중에 바꾼 것"을 고른다(D-461, docs/adr/2026-11-01-skill-editor.md 2절 "켤 때").
// 던지지 않는다(부르는 쪽이 시작을 막지 않게).
// - 저장 때 팩 항목 해시 ≠ 지금 해시 → 팩이 이긴다(packWon, 지움).
// - 만든 항목(저장 때 팩에 없음)과 같은 ID가 팩에 생겼다: 내용이 같으면 내보내기를 그대로 넣은 것이라 조용히 지운다(adopted),
//   다르면 지우지 않고 잠재운다(id_collision, 편집기 띠에서 [새 ID로 옮기기]·[버리기]. 설계안 2.9).
// - 저장 때 팩에 있던 항목이 새 팩에서 빠졌다 → unknown_entry(지움). 검사에 걸리면 invalid_entry(지움).
// - 지금 팩보다 새 판(core@N+1)에서 저장한 줄은 지우지 않고 잠재운다(되돌림 배포가 새 칸·새 참조를 읽지 못해도 줄을 잃지 않게).
// - 한꺼번에 검사에 걸리면 저장 차례로 반씩 나눠 처음 틀리는 줄을 찾는다(틀린 줄 하나에 검사 약 log₂(줄 수)번, 설계안 WP-1 f).
//   배포 헬스체크 창(약 90초) 안에 끝나야 한다.
import { hasErrors } from "@terra/content";
import type { ContentDropReason, ContentEditCategory } from "@terra/shared/contentEdit";
import { type ContentCore, type EntryJson, contentKey, entryHash, idOf } from "./core.ts";

/** DB 줄(덮어쓰기 하나) */
export interface ContentOverrideRecord {
  readonly category: ContentEditCategory;
  readonly id: string;
  readonly entry: EntryJson;
  /** 저장할 때의 팩 항목 해시(팩에 없던 항목이면 null) */
  readonly packHash: string | null;
  readonly contentVersion: string;
  readonly note: string | null;
  readonly updatedById: string | null;
  readonly updatedByName: string | null;
  readonly updatedAtMs: number;
}

export interface ContentBootSelection {
  readonly keep: readonly ContentOverrideRecord[];
  readonly packWon: readonly ContentOverrideRecord[];
  /** 만든 항목을 같은 내용으로 팩에 넣었다(같은 ID): 조용히 지운다(감사 content.pack_won 까닭 adopted) */
  readonly adopted: readonly ContentOverrideRecord[];
  readonly dropped: readonly { readonly row: ContentOverrideRecord; readonly reason: ContentDropReason }[];
  /** 지우지 않고 적용하지 않은 줄(감사 content.slept) */
  readonly slept: readonly {
    readonly row: ContentOverrideRecord;
    readonly reason: "newer_pack" | "id_collision";
  }[];
  /** 옛 모양이라 지금 모양으로 고쳐 읽은 줄 키(legacy.ts, DB 줄은 그대로) */
  readonly upgraded?: readonly string[] | undefined;
}

export const byKey = (a: ContentOverrideRecord, b: ContentOverrideRecord): number => {
  const ka = contentKey(a.category, a.id);
  const kb = contentKey(b.category, b.id);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
};

/** 만든 항목인데 팩에 같은 ID가 생겼나 */
export const collides = (core: ContentCore, row: ContentOverrideRecord): boolean =>
  row.packHash === null && core.packEntry(row.category, row.id) !== undefined;

export function selectAtBoot(
  core: ContentCore,
  rows: readonly ContentOverrideRecord[],
): ContentBootSelection {
  const packWon: ContentOverrideRecord[] = [];
  const adopted: ContentOverrideRecord[] = [];
  const dropped: { row: ContentOverrideRecord; reason: ContentDropReason }[] = [];
  const slept: { row: ContentOverrideRecord; reason: "newer_pack" | "id_collision" }[] = [];
  const candidates: ContentOverrideRecord[] = [];
  /** 맞지 않는 줄: 새 판 줄은 잠재우고(지우지 않음), 같거나 옛 판 줄은 지운다 */
  const reject = (row: ContentOverrideRecord, reason: ContentDropReason): void => {
    if (core.newerThanPack(row.contentVersion)) slept.push({ row, reason: "newer_pack" });
    else dropped.push({ row, reason });
  };
  const ordered = rows.toSorted((a, b) => a.updatedAtMs - b.updatedAtMs || byKey(a, b));
  for (const row of ordered) {
    const hash = core.packHash(row.category, row.id);
    if (hash !== null) {
      if (row.packHash === null) {
        // 만든 항목과 같은 ID가 팩에 생겼다: 같은 내용이면 내보내기를 넣은 것(조용히 지움), 다르면 잠재운다
        if (entryHash(row.entry) === hash) adopted.push(row);
        else slept.push({ row, reason: "id_collision" });
        continue;
      }
      // 가장 나중에 바꾼 것이 이긴다: 저장 뒤에 팩 항목이 바뀌었다(배포·되돌림 배포)
      if (row.packHash !== hash) {
        packWon.push(row);
        continue;
      }
    } else if (row.packHash !== null && !core.newerThanPack(row.contentVersion)) {
      // 저장 때는 팩에 있던 항목이 새 팩에서 빠졌다(지웠거나 이름을 바꿈). 새 판 줄(되돌림)은 검사를 거쳐 쓰거나 잠재운다
      dropped.push({ row, reason: "unknown_entry" });
      continue;
    }
    if (idOf(row.entry) !== row.id) {
      reject(row, "invalid_entry");
      continue;
    }
    candidates.push(row);
  }
  const valid = (list: readonly ContentOverrideRecord[]): boolean =>
    !hasErrors(core.validate(core.rawOf(list)));
  let keep: ContentOverrideRecord[] = candidates;
  if (candidates.length > 0 && !valid(candidates)) {
    // 한꺼번에는 맞지 않는다: keep(맞음)에 rest의 앞부분을 붙여 맞는 가장 긴 길이를 반씩 나눠 찾고, 그다음 줄을 뺀다
    keep = [];
    let rest = candidates;
    while (rest.length > 0) {
      if (valid([...keep, ...rest])) {
        keep.push(...rest);
        break;
      }
      let lo = 0;
      let hi = rest.length;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (valid([...keep, ...rest.slice(0, mid)])) lo = mid;
        else hi = mid;
      }
      keep.push(...rest.slice(0, lo));
      const bad = rest[lo];
      if (bad) reject(bad, "invalid_entry");
      rest = rest.slice(lo + 1);
    }
  }
  return { keep, packWon, adopted, dropped, slept };
}
