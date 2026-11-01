// 기준 유닛 프리셋 DB 작업 — balance_presets 표와 감사 기록(docs/adr/2026-11-01-balance-screen.md "바뀜 (D-467)").
// 바꾸는 일과 감사 기록은 한 트랜잭션이다(감사 기록을 못 쓰면 바꾸지 않는다). 줄 판(version)을 조건으로 바꿔 두 사람이 같은 줄을
// 고치면 늦은 쪽은 아무것도 바꾸지 않고 충돌이다.
// 감사 기록 모양(target_id 없음: 프리셋 ID는 글이라 before·after에)
// - balance_preset.save: before { id, version, data | null }, after { id, version, data, contentVersion }
// - balance_preset.delete: before { id, version, data }, after { id }
// - balance_preset.pack_won(켤 때, system): before { rows: [{ id, version, data, packEntry }] }, after { contentVersion }
// - balance_preset.dropped(켤 때, system): before { rows: [{ id, version, data, reason }] }, after { contentVersion }
import { and, eq, inArray } from "drizzle-orm";
import { type AuditActor, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { balancePresets, users } from "../db/schema.ts";
import type { PresetDropReason, PresetRecord } from "./presets.ts";

export const BALANCE_PRESET_AUDIT = {
  save: "balance_preset.save",
  delete: "balance_preset.delete",
  packWon: "balance_preset.pack_won",
  dropped: "balance_preset.dropped",
} as const;

type Actor = AuditActor & { id: string };

/** 프리셋 줄 전부(바꾼 사람 이름과 함께) */
export async function readPresetRecords(db: Database): Promise<PresetRecord[]> {
  const rows = await db
    .select({
      id: balancePresets.id,
      data: balancePresets.data,
      packEntry: balancePresets.packEntry,
      contentVersion: balancePresets.contentVersion,
      version: balancePresets.version,
      updatedById: balancePresets.updatedBy,
      updatedByName: users.name,
      updatedAt: balancePresets.updatedAt,
      createdAt: balancePresets.createdAt,
    })
    .from(balancePresets)
    .leftJoin(users, eq(users.id, balancePresets.updatedBy));
  return rows.map(({ updatedAt, createdAt, ...row }) => ({
    ...row,
    updatedAtMs: updatedAt.getTime(),
    createdAtMs: createdAt.getTime(),
  }));
}

export type PresetWriteOutcome = { readonly kind: "applied" } | { readonly kind: "conflict" };

/**
 * 저장: dbVersion null이면 새 줄(이미 있으면 충돌), 아니면 그 판인 줄만 바꾼다(판 +1). before는 감사 기록의 앞 값(지금 목록의 값,
 * 팩 그대로면 그 팩 값, 새로 만들면 null)
 */
export async function savePresetRecord(
  db: Database,
  input: {
    id: string;
    dbVersion: number | null;
    data: object;
    packEntry: object | null;
    before: object | null;
    viewVersion: number;
    contentVersion: string;
    actor: Actor;
  },
): Promise<PresetWriteOutcome> {
  return db.transaction(async (tx): Promise<PresetWriteOutcome> => {
    const now = new Date();
    const values = {
      data: input.data,
      packEntry: input.packEntry,
      contentVersion: input.contentVersion,
      updatedBy: input.actor.id,
      updatedAt: now,
    };
    let version: number | undefined;
    if (input.dbVersion === null) {
      const [row] = await tx
        .insert(balancePresets)
        .values({ id: input.id, ...values, version: 1, createdAt: now })
        .onConflictDoNothing()
        .returning({ version: balancePresets.version });
      version = row?.version;
    } else {
      const [row] = await tx
        .update(balancePresets)
        .set({ ...values, version: input.dbVersion + 1 })
        .where(and(eq(balancePresets.id, input.id), eq(balancePresets.version, input.dbVersion)))
        .returning({ version: balancePresets.version });
      version = row?.version;
    }
    if (version === undefined) return { kind: "conflict" };
    await writeAudit(tx, {
      actor: input.actor,
      action: BALANCE_PRESET_AUDIT.save,
      targetId: null,
      before: { id: input.id, version: input.viewVersion, data: input.before },
      after: { id: input.id, version, data: input.data, contentVersion: input.contentVersion },
    });
    return { kind: "applied" };
  });
}

/** 지우기: 그 판인 줄을 지운다(화면에서 만든 것은 없어지고, 팩 프리셋은 팩 값으로 돌아간다) */
export async function deletePresetRecord(
  db: Database,
  input: { id: string; dbVersion: number; actor: Actor },
): Promise<PresetWriteOutcome> {
  return db.transaction(async (tx): Promise<PresetWriteOutcome> => {
    const [row] = await tx
      .delete(balancePresets)
      .where(and(eq(balancePresets.id, input.id), eq(balancePresets.version, input.dbVersion)))
      .returning({ data: balancePresets.data });
    if (!row) return { kind: "conflict" };
    await writeAudit(tx, {
      actor: input.actor,
      action: BALANCE_PRESET_AUDIT.delete,
      targetId: null,
      before: { id: input.id, version: input.dbVersion, data: row.data },
      after: { id: input.id },
    });
    return { kind: "applied" };
  });
}

/** 켤 때 정리: 팩이 이긴 줄·맞지 않는 줄을 지우고 감사 기록(행위자 system). 지운 줄 수 */
export async function cleanupPresetsAtBoot(
  db: Database,
  input: {
    packWon: readonly PresetRecord[];
    dropped: readonly { row: PresetRecord; reason: PresetDropReason }[];
    contentVersion: string;
  },
): Promise<number> {
  const ids = [...input.packWon.map((row) => row.id), ...input.dropped.map(({ row }) => row.id)];
  if (ids.length === 0) return 0;
  return db.transaction(async (tx) => {
    const removed = await tx
      .delete(balancePresets)
      .where(inArray(balancePresets.id, ids))
      .returning({ id: balancePresets.id });
    const system: AuditActor = { kind: "system", id: null, ip: null };
    if (input.packWon.length > 0)
      await writeAudit(tx, {
        actor: system,
        action: BALANCE_PRESET_AUDIT.packWon,
        targetId: null,
        before: {
          rows: input.packWon.map((row) => ({
            id: row.id,
            version: row.version,
            data: row.data,
            packEntry: row.packEntry,
          })),
        },
        after: { contentVersion: input.contentVersion },
      });
    if (input.dropped.length > 0)
      await writeAudit(tx, {
        actor: system,
        action: BALANCE_PRESET_AUDIT.dropped,
        targetId: null,
        before: {
          rows: input.dropped.map(({ row, reason }) => ({
            id: row.id,
            version: row.version,
            data: row.data,
            reason,
          })),
        },
        after: { contentVersion: input.contentVersion },
      });
    return removed.length;
  });
}
