// 전투 실험실 프리셋 DB 작업 — battle_lab_presets 표와 감사 기록(docs/adr/2026-11-01-balance-screen.md "바뀜 (2026-11-01, 전투 실험실)" 3절).
// 바꾸는 일과 감사 기록은 한 트랜잭션이다(감사 기록을 못 쓰면 바꾸지 않는다). 줄 판(version)을 조건으로 바꿔 두 사람이 같은 줄을
// 고치면 늦은 쪽은 아무것도 바꾸지 않고 충돌이다. 값(data)은 읽을 때마다 같은 스키마로 다시 검사한다(맞지 않는 줄은 빼고 센다).
// 감사 기록 모양(target_id 없음: 프리셋 ID는 글이라 before·after에)
// - battle_lab_preset.save: before { id, version, name, data } | null(새로 만듦), after { id, version, kind, name, data }
// - battle_lab_preset.delete: before { id, version, kind, name, data }, after { id }
import type { LabPresetView } from "@terra/shared/battleLab";
import { and, count, eq } from "drizzle-orm";
import { type AuditActor, writeAudit } from "../auth/store.ts";
import type { Database } from "../db/client.ts";
import { battleLabPresets, users } from "../db/schema.ts";
import { labPartySchema, labUnitSchema } from "./schema.ts";

export const LAB_PRESET_AUDIT = {
  save: "battle_lab_preset.save",
  delete: "battle_lab_preset.delete",
} as const;

type Actor = AuditActor & { id: string };

export interface PresetRow {
  readonly id: string;
  readonly kind: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly data: unknown;
  readonly version: number;
  readonly updatedByName: string | null;
  readonly updatedAtMs: number;
}

/** DB 줄 → 화면 모양. 값이 지금 규칙에 맞지 않으면 null */
export function presetViewOf(row: PresetRow): LabPresetView | null {
  const base = {
    id: row.id,
    name: { ko: row.nameKo, en: row.nameEn },
    source: "team" as const,
    version: row.version,
    updatedBy: row.updatedByName,
    updatedAtMs: row.updatedAtMs,
  };
  if (row.kind === "unit") {
    const parsed = labUnitSchema.safeParse(row.data);
    return parsed.success ? { ...base, kind: "unit", data: parsed.data } : null;
  }
  if (row.kind === "party") {
    const parsed = labPartySchema.safeParse(row.data);
    return parsed.success ? { ...base, kind: "party", data: parsed.data } : null;
  }
  return null;
}

/** 프리셋 줄 전부(만든 차례, 바꾼 사람 이름과 함께) */
export async function readPresetRows(db: Database): Promise<PresetRow[]> {
  const rows = await db
    .select({
      id: battleLabPresets.id,
      kind: battleLabPresets.kind,
      nameKo: battleLabPresets.nameKo,
      nameEn: battleLabPresets.nameEn,
      data: battleLabPresets.data,
      version: battleLabPresets.version,
      updatedByName: users.name,
      updatedAt: battleLabPresets.updatedAt,
      createdAt: battleLabPresets.createdAt,
    })
    .from(battleLabPresets)
    .leftJoin(users, eq(users.id, battleLabPresets.updatedBy))
    .orderBy(battleLabPresets.createdAt, battleLabPresets.id);
  return rows.map(({ updatedAt, createdAt: _createdAt, ...row }) => ({
    ...row,
    updatedAtMs: updatedAt.getTime(),
  }));
}

export async function countPresetRows(db: Database): Promise<number> {
  const [row] = await db.select({ value: count() }).from(battleLabPresets);
  return row?.value ?? 0;
}

export type PresetWriteOutcome =
  | { readonly kind: "applied"; readonly version: number }
  | { readonly kind: "conflict" };

interface PresetValues {
  readonly kind: "unit" | "party";
  readonly name: { readonly ko: string; readonly en: string };
  readonly data: object;
}

/** 새 줄(판 1). 같은 ID가 이미 있으면 충돌 */
export async function insertPresetRow(
  db: Database,
  input: PresetValues & { id: string; actor: Actor },
): Promise<PresetWriteOutcome> {
  return db.transaction(async (tx): Promise<PresetWriteOutcome> => {
    const now = new Date();
    const [row] = await tx
      .insert(battleLabPresets)
      .values({
        id: input.id,
        kind: input.kind,
        nameKo: input.name.ko,
        nameEn: input.name.en,
        data: input.data,
        version: 1,
        createdBy: input.actor.id,
        updatedBy: input.actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ version: battleLabPresets.version });
    if (!row) return { kind: "conflict" };
    await writeAudit(tx, {
      actor: input.actor,
      action: LAB_PRESET_AUDIT.save,
      targetId: null,
      before: null,
      after: { id: input.id, version: row.version, kind: input.kind, name: input.name, data: input.data },
    });
    return { kind: "applied", version: row.version };
  });
}

/** 바꾸기: 그 판·그 종류인 줄만(판 + 1). 없거나 판이 다르면 충돌 */
export async function updatePresetRow(
  db: Database,
  input: PresetValues & { id: string; expectedVersion: number; actor: Actor },
): Promise<PresetWriteOutcome> {
  return db.transaction(async (tx): Promise<PresetWriteOutcome> => {
    const [before] = await tx
      .select({
        nameKo: battleLabPresets.nameKo,
        nameEn: battleLabPresets.nameEn,
        data: battleLabPresets.data,
      })
      .from(battleLabPresets)
      .where(eq(battleLabPresets.id, input.id));
    const [row] = await tx
      .update(battleLabPresets)
      .set({
        nameKo: input.name.ko,
        nameEn: input.name.en,
        data: input.data,
        version: input.expectedVersion + 1,
        updatedBy: input.actor.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(battleLabPresets.id, input.id),
          eq(battleLabPresets.version, input.expectedVersion),
          eq(battleLabPresets.kind, input.kind),
        ),
      )
      .returning({ version: battleLabPresets.version });
    if (!row || !before) return { kind: "conflict" };
    await writeAudit(tx, {
      actor: input.actor,
      action: LAB_PRESET_AUDIT.save,
      targetId: null,
      before: {
        id: input.id,
        version: input.expectedVersion,
        name: { ko: before.nameKo, en: before.nameEn },
        data: before.data,
      },
      after: { id: input.id, version: row.version, kind: input.kind, name: input.name, data: input.data },
    });
    return { kind: "applied", version: row.version };
  });
}

/** 지우기: 그 판인 줄만 */
export async function deletePresetRow(
  db: Database,
  input: { id: string; expectedVersion: number; actor: Actor },
): Promise<PresetWriteOutcome> {
  return db.transaction(async (tx): Promise<PresetWriteOutcome> => {
    const [row] = await tx
      .delete(battleLabPresets)
      .where(and(eq(battleLabPresets.id, input.id), eq(battleLabPresets.version, input.expectedVersion)))
      .returning({
        kind: battleLabPresets.kind,
        nameKo: battleLabPresets.nameKo,
        nameEn: battleLabPresets.nameEn,
        data: battleLabPresets.data,
      });
    if (!row) return { kind: "conflict" };
    await writeAudit(tx, {
      actor: input.actor,
      action: LAB_PRESET_AUDIT.delete,
      targetId: null,
      before: {
        id: input.id,
        version: input.expectedVersion,
        kind: row.kind,
        name: { ko: row.nameKo, en: row.nameEn },
        data: row.data,
      },
      after: { id: input.id },
    });
    return { kind: "applied", version: input.expectedVersion };
  });
}
