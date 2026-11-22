// 공성 결과 저장(NPC 사회 런타임) — docs/adr/2026-11-07-war-outcomes.md "바뀜 (D-527)", 기획 D-520·D-527. 표 war_outcomes(db/warSchema.ts).
// - 켤 때: 끝나지 않은 남은 상태(약탈 = 정부가 무너진 도시·점령 상태·점령·귀속 회복 불이익)를 거울 세계 world.occupations로 읽는다(세력 행 →
//   거울 세력 = 소유 주체 ID). D-520 판 약탈 줄은 넣을 때 끝냈으므로 읽지 않는다.
// - 결과 하나(attachSociety onWarOutcome): 새 줄을 기다리는 줄에 넣는다(세력 행 ID는 flush 때 잇는다 — 예비 행이 모자라 늦게 넣는 새 세력이
//   있어서). 남은 상태가 생기면 그 도시의 줄 번호를 적어 둔다.
// - 남은 상태가 끝남(attachSociety onWarStateEnd): 까닭(재건·저절로 회복·몰아냄·주인 바뀜·사라짐·바뀜·기간 끝)을 적어 두었다가 flush 때 쓴다.
// - 바뀜(fixes-d592 — D-592 질문 2582 나): 약탈 상태가 정부 재건(rebuilt)으로 끝나면 약탈한 세력을 그 쌍의 전쟁을 연 쪽으로 위반 장부에 적는다(diplomacy/breaches.ts
//   blameRebuiltWar — 거울 세계 원장 world.book이 서버 원장이다). 재건 뒤 시뮬이 다시 전쟁을 걸어 조약이 깨지면 약탈한 쪽이 어긴 나라가 된다.
// - flush(세력·도시 저장 뒤): 새 줄을 쓰고, 남은 상태의 다음 세금·가져간 값이 바뀌었으면 고치고, 거울에서 사라진 상태는 ended_at_ms = 지금·까닭.
// 서버 NPC 공격은 아직 실시간 공성 없이 결과를 고른다(시뮬 "전투 끔"과 같은 규칙, @terra/sim attachSociety occupy).
import {
  type SimOccupation,
  type SimWorld,
  type WarOutcome,
  type WarOutcomeEvent,
  type WarStateEndReason,
  isWarOutcome,
} from "@terra/sim";
import { blameRebuiltWar } from "../diplomacy/breaches.ts";
import type { QueryPool } from "../world/persist/load.ts";
import type { WorldWriter } from "../world/persist/writer.ts";

/** 켤 때 읽은 남은 상태 하나(거울 ID로 바꾼 것)와 그 줄 */
interface StoredOccupation {
  readonly rowId: number;
  readonly atMs: number;
  readonly outcome: WarOutcome;
  readonly shareChoice: string | null;
  readonly attackerRow: number;
  readonly targetRow: number;
  readonly takenAsset: string | null;
  readonly occupation: SimOccupation;
}

export interface WarOutcomeState {
  /** 끝나지 않은 남은 상태(도시 ID → 상태) */
  readonly occupations: Map<number, SimOccupation>;
  readonly stored: ReadonlyMap<number, StoredOccupation>;
  readonly maxId: number;
}

const num = (value: unknown): number => Number(value);
const numOrNull = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

/** 결과 → 남은 상태 종류 */
const KIND_OF: Readonly<Record<WarOutcome, SimOccupation["kind"]>> = {
  loot: "looted",
  occupy: "occupied",
  integrate: "annexed",
};

/**
 * 끝나지 않은 남은 상태와 가장 큰 줄 번호. ownerOfRow = 세력 행 → 거울 세력(소유 주체). 어느 쪽 세력을 모르면(사라짐) 그 줄은 끝난 것으로 둔다
 */
export async function loadWarOutcomes(
  pool: QueryPool,
  ownerOfRow: ReadonlyMap<number, number>,
): Promise<WarOutcomeState & { readonly orphaned: readonly number[] }> {
  const [active, max] = await Promise.all([
    pool.query(
      `select id, city_id, attacker_faction_id, target_faction_id, outcome, share_choice, at_ms, until_ms, next_tax_ms,
              taken::text as taken, taken_asset
       from war_outcomes where ended_at_ms is null order by id`,
    ),
    pool.query(`select coalesce(max(id), 0) as id from war_outcomes`),
  ]);
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
      kind: KIND_OF[outcome],
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
  return { occupations, stored, maxId: num(max.rows[0]?.id ?? 0), orphaned };
}

export interface WarOutcomePersist {
  /** 결과 하나(attachSociety onWarOutcome). asset = 가져간·낸 값의 화폐(약탈·점령 상태 = 대상 국고, 점령·귀속 = 점령자 국고) */
  record(event: WarOutcomeEvent, asset: string): void;
  /** 남은 상태가 끝남(attachSociety onWarStateEnd) — 까닭을 flush 때 쓴다. 재건이면 약탈한 쪽을 위반 장부에 적는다(nowMs가 있을 때 — 2582 나) */
  ended(entry: SimOccupation, reason: WarStateEndReason, nowMs?: number): void;
  /** 새 줄·바뀐 남은 상태·끝난 상태를 쓰기 대기열에(세력 행을 저장한 뒤). 쓴 줄 수 */
  flush(nowMs: number): number;
}

interface LiveRow {
  rowId: number;
  readonly atMs: number;
  readonly outcome: WarOutcome;
  readonly shareChoice: string | null;
  readonly attacker: number;
  readonly target: number;
  readonly takenAsset: string | null;
  /** 점령·귀속 = 재건 비용(고정), 약탈·점령 상태 = 거울 상태의 가져간 값 */
  readonly fixedTaken: bigint;
  sig: string;
}

/** 끝난 까닭 열쇠(도시 · 상태 시작 시각) */
const reasonKey = (city: number, sinceMs: number): string => `${city}:${sinceMs}`;

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
  /** 끝난 남은 상태의 까닭("도시:시작 시각" → 까닭) — flush가 쓰고 지운다 */
  const reasons = new Map<string, WarStateEndReason>();
  const takeReason = (city: number, sinceMs: number): WarStateEndReason | null => {
    const key = reasonKey(city, sinceMs);
    const reason = reasons.get(key) ?? null;
    reasons.delete(key);
    return reason;
  };

  const rowOfFaction = (ownerId: number): number | undefined => rowOf.get(ownerId);

  return {
    record(event, asset) {
      nextId += 1;
      pending.push({ id: nextId, event, asset });
    },

    ended(entry, reason, nowMs) {
      reasons.set(reasonKey(entry.city, entry.sinceMs), reason);
      if (reason === "rebuilt" && entry.kind === "looted" && nowMs !== undefined)
        blameRebuiltWar(world.book, entry.occupier, entry.owner, nowMs);
    },

    flush(nowMs) {
      let rows = 0;
      for (const id of orphaned) {
        writer.upsert("warOutcomeEnds", { id, ended_at_ms: nowMs, end_reason: "gone" });
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
        const lasting =
          entry !== undefined && entry.sinceMs === event.atMs && entry.kind === KIND_OF[event.outcome];
        // 상태가 같은 처리 안에서 바로 끝났으면(또는 생기지 않았으면 — 점령·귀속 불이익 0일) 그때 끝
        const endedReason = lasting ? null : (takeReason(event.city, event.atMs) ?? "expired");
        const running = event.outcome !== "integrate";
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
          ended_at_ms: lasting ? null : event.atMs,
          taken: running && lasting ? (entry?.taken ?? 0n) : event.taken,
          taken_asset: asset,
          end_reason: endedReason,
        });
        rows += 1;
        // 같은 도시의 옛 남은 상태 줄은 끝(새 결과가 덮었다)
        const old = live.get(event.city);
        if (old && old.rowId !== id) {
          writer.upsert("warOutcomeEnds", {
            id: old.rowId,
            ended_at_ms: event.atMs,
            end_reason: takeReason(event.city, old.atMs) ?? "replaced",
          });
          live.delete(event.city);
          rows += 1;
        }
        if (lasting && entry)
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
          writer.upsert("warOutcomeEnds", {
            id: row.rowId,
            ended_at_ms: nowMs,
            end_reason: takeReason(cityId, row.atMs) ?? "gone",
          });
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
          taken: row.outcome === "integrate" ? row.fixedTaken : entry.taken,
        });
        rows += 1;
      }
      // 줄이 없는 상태의 까닭(세력 행을 몰라 쓰지 않은 결과 등)은 버린다
      reasons.clear();
      return rows;
    },
  };
}
