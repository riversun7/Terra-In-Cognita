// 공성 결과 저장(NPC 사회 런타임) — docs/adr/2026-11-07-war-outcomes.md, 기획 D-520. 표 war_outcomes(db/warSchema.ts).
// - 켤 때: 끝나지 않은 남은 상태(점령 상태·점령·귀속 회복 불이익)를 거울 세계 world.occupations로 읽는다(세력 행 → 거울 세력 = 소유 주체 ID).
//   쉬는 날 안의 약탈 줄은 그 세력의 raided(약탈한 도시 → 다시 칠 수 있는 시각, 확인 대기 685)로 돌린다.
// - 결과 하나(attachSociety onWarOutcome): 새 줄을 기다리는 줄에 넣는다(세력 행 ID는 flush 때 잇는다 — 예비 행이 모자라 늦게 넣는 새 세력이
//   있어서). 남은 상태가 생기는 결과(점령 상태·점령·귀속)는 그 도시의 줄 번호를 적어 둔다.
// - flush(세력·도시 저장 뒤): 새 줄을 쓰고, 남은 상태의 다음 세금·거둔 세금이 바뀌었으면 고치고, 거울에서 사라진 상태는 ended_at_ms = 지금.
// 서버 NPC 공격은 아직 실시간 공성 없이 결과를 고른다(시뮬 "전투 끔"과 같은 규칙, @terra/sim attachSociety occupy).
import { type SimOccupation, type SimWorld, type WarOutcomeEvent, isWarOutcome } from "@terra/sim";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 켤 때 읽은 남은 상태 하나(거울 ID로 바꾼 것)와 그 줄 */
interface StoredOccupation {
  readonly rowId: number;
  readonly atMs: number;
  readonly outcome: "integrate" | "occupy";
  readonly shareChoice: string | null;
  readonly attackerRow: number;
  readonly targetRow: number;
  readonly takenAsset: string | null;
  readonly occupation: SimOccupation;
}

export interface WarOutcomeState {
  /** 끝나지 않은 남은 상태(도시 ID → 상태) */
  readonly occupations: Map<number, SimOccupation>;
  /** 쉬는 날 안의 약탈(거울 세력·도시·시각, 세력·도시마다 가장 늦은 것) */
  readonly raids: readonly { readonly attacker: number; readonly city: number; readonly atMs: number }[];
  readonly stored: ReadonlyMap<number, StoredOccupation>;
  readonly maxId: number;
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/**
 * 끝나지 않은 남은 상태와 가장 큰 줄 번호, raidSinceMs 뒤의 약탈. ownerOfRow = 세력 행 → 거울 세력(소유 주체). 어느 쪽 세력을 모르면(사라짐) 그
 * 줄은 끝난 것으로 둔다
 */
export async function loadWarOutcomes(
  pool: QueryPool,
  ownerOfRow: ReadonlyMap<number, number>,
  raidSinceMs: number,
): Promise<WarOutcomeState & { readonly orphaned: readonly number[] }> {
  const [active, max, raidRows] = await Promise.all([
    pool.query(
      `select id, city_id, attacker_faction_id, target_faction_id, outcome, share_choice, at_ms, until_ms, next_tax_ms,
              taken::text as taken, taken_asset
       from war_outcomes where ended_at_ms is null and outcome in ('integrate', 'occupy') order by id`,
    ),
    pool.query(`select coalesce(max(id), 0) as id from war_outcomes`),
    pool.query(
      `select attacker_faction_id, city_id, max(at_ms) as at_ms from war_outcomes
       where outcome = 'loot' and at_ms > $1 group by attacker_faction_id, city_id order by attacker_faction_id, city_id`,
      [raidSinceMs],
    ),
  ]);
  const raids = raidRows.rows.flatMap((row) => {
    const attacker = ownerOfRow.get(num(row.attacker_faction_id));
    return attacker === undefined ? [] : [{ attacker, city: num(row.city_id), atMs: num(row.at_ms) }];
  });
  const occupations = new Map<number, SimOccupation>();
  const stored = new Map<number, StoredOccupation>();
  const orphaned: number[] = [];
  for (const row of active.rows) {
    const outcome = row.outcome;
    const attacker = ownerOfRow.get(num(row.attacker_faction_id));
    const target = ownerOfRow.get(num(row.target_faction_id));
    const untilMs = numOrNull(row.until_ms);
    const cityId = num(row.city_id);
    if (
      !isWarOutcome(outcome) ||
      outcome === "loot" ||
      attacker === undefined ||
      target === undefined ||
      untilMs === null ||
      occupations.has(cityId)
    ) {
      orphaned.push(num(row.id));
      continue;
    }
    const occupation: SimOccupation = {
      city: cityId,
      kind: outcome === "occupy" ? "occupied" : "annexed",
      occupier: attacker,
      owner: target,
      sinceMs: num(row.at_ms),
      untilMs,
      nextTaxMs: numOrNull(row.next_tax_ms) ?? untilMs,
      taken: typeof row.taken === "string" ? BigInt(row.taken) : 0n,
    };
    occupations.set(cityId, occupation);
    stored.set(cityId, {
      rowId: num(row.id),
      atMs: occupation.sinceMs,
      outcome,
      shareChoice: typeof row.share_choice === "string" ? row.share_choice : null,
      attackerRow: num(row.attacker_faction_id),
      targetRow: num(row.target_faction_id),
      takenAsset: typeof row.taken_asset === "string" ? row.taken_asset : null,
      occupation,
    });
  }
  return { occupations, raids, stored, maxId: num(max.rows[0]?.id ?? 0), orphaned };
}

export interface WarOutcomePersist {
  /** 결과 하나(attachSociety onWarOutcome). asset = 가져간·낸 값의 화폐(약탈·점령 상태 = 대상 국고, 점령·귀속 = 점령자 국고) */
  record(event: WarOutcomeEvent, asset: string): void;
  /** 새 줄·바뀐 남은 상태·끝난 상태를 쓰기 대기열에(세력 행을 저장한 뒤). 쓴 줄 수 */
  flush(nowMs: number): number;
}

interface LiveRow {
  rowId: number;
  readonly atMs: number;
  readonly outcome: "integrate" | "occupy";
  readonly shareChoice: string | null;
  readonly attacker: number;
  readonly target: number;
  readonly takenAsset: string | null;
  /** 점령·귀속 = 재건 비용(고정), 점령 상태 = 거울 상태의 거둔 세금 */
  readonly fixedTaken: bigint;
  sig: string;
}

const occupationSig = (entry: SimOccupation): string =>
  JSON.stringify([entry.nextTaxMs, String(entry.taken), entry.untilMs]);

export function createWarOutcomePersist(o: {
  readonly world: SimWorld;
  readonly writer: WorldWriter;
  /** 소유 주체 ID → 세력 행 ID(persist.rowOf — 새 세력은 저장할 때 생긴다) */
  readonly rowOf: ReadonlyMap<number, number>;
  readonly state: WarOutcomeState & { readonly orphaned: readonly number[] };
  readonly log: { warn(obj: object, message: string): void };
}): WarOutcomePersist {
  const { world, writer, rowOf } = o;
  let nextId = o.state.maxId;
  const pending: { readonly id: number; readonly event: WarOutcomeEvent; readonly asset: string }[] = [];
  /** 도시 ID → 지금 저장한 남은 상태 줄 */
  const live = new Map<number, LiveRow>();
  for (const [cityId, entry] of o.state.stored)
    live.set(cityId, {
      rowId: entry.rowId,
      atMs: entry.atMs,
      outcome: entry.outcome,
      shareChoice: entry.shareChoice,
      attacker: entry.occupation.occupier,
      target: entry.occupation.owner,
      takenAsset: entry.takenAsset,
      fixedTaken: entry.outcome === "integrate" ? entry.occupation.taken : 0n,
      sig: occupationSig(entry.occupation),
    });
  /** 켤 때 세력을 몰라 거울에 올리지 못한 줄: 끝난 것으로 적는다(첫 flush) */
  let orphaned = [...o.state.orphaned];

  const rowOfFaction = (ownerId: number): number | undefined => rowOf.get(ownerId);

  return {
    record(event, asset) {
      nextId += 1;
      pending.push({ id: nextId, event, asset });
    },

    flush(nowMs) {
      let rows = 0;
      for (const id of orphaned) {
        writer.upsert("warOutcomeEnds", { id, ended_at_ms: nowMs });
        rows += 1;
      }
      orphaned = [];
      for (const { id, event, asset } of pending.splice(0)) {
        const attacker = rowOfFaction(event.attacker.id);
        const target = rowOfFaction(event.target.id);
        if (attacker === undefined || target === undefined) {
          o.log.warn({ city: event.city, outcome: event.outcome }, "war outcome without faction row");
          continue;
        }
        const entry = world.occupations.get(event.city);
        const lasting = event.outcome !== "loot" && entry !== undefined && entry.sinceMs === event.atMs;
        writer.upsert("warOutcomes", {
          id,
          city_id: event.city,
          attacker_faction_id: attacker,
          target_faction_id: target,
          outcome: event.outcome,
          share_choice: event.shares ?? null,
          at_ms: event.atMs,
          until_ms: event.untilMs ?? null,
          next_tax_ms: event.outcome === "occupy" ? (entry?.nextTaxMs ?? null) : null,
          // 약탈은 남은 상태가 없다(끝 = 그때). 이미 끝난 상태(같은 처리 안에서 바로 바뀜)도 그때 끝
          ended_at_ms: lasting ? null : event.atMs,
          taken: event.outcome === "occupy" ? (entry?.taken ?? 0n) : event.taken,
          taken_asset: asset,
        });
        rows += 1;
        // 같은 도시의 옛 남은 상태 줄은 끝(새 결과가 덮었다)
        const old = live.get(event.city);
        if (old && old.rowId !== id) {
          writer.upsert("warOutcomeEnds", { id: old.rowId, ended_at_ms: event.atMs });
          live.delete(event.city);
          rows += 1;
        }
        if (lasting && entry && (event.outcome === "integrate" || event.outcome === "occupy"))
          live.set(event.city, {
            rowId: id,
            atMs: event.atMs,
            outcome: event.outcome,
            shareChoice: event.shares ?? null,
            attacker,
            target,
            takenAsset: asset,
            fixedTaken: event.outcome === "integrate" ? event.taken : 0n,
            sig: occupationSig(entry),
          });
      }
      for (const [cityId, row] of [...live].toSorted((a, b) => a[0] - b[0])) {
        const entry = world.occupations.get(cityId);
        if (!entry || entry.sinceMs !== row.atMs) {
          writer.upsert("warOutcomeEnds", { id: row.rowId, ended_at_ms: nowMs });
          live.delete(cityId);
          rows += 1;
          continue;
        }
        const sig = occupationSig(entry);
        if (sig === row.sig) continue;
        row.sig = sig;
        writer.upsert("warOutcomeState", {
          id: row.rowId,
          next_tax_ms: row.outcome === "occupy" ? entry.nextTaxMs : null,
          taken: row.outcome === "occupy" ? entry.taken : row.fixedTaken,
        });
        rows += 1;
      }
      return rows;
    },
  };
}
