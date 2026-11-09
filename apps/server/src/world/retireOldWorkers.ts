// 없앤 시험 일꾼(종류 1)의 옛 행 정리 — 사용자 지적 2026-11-09 "시험일꾼 다 없애라고",
// docs/adr/2026-10-31-s3-server-stage.md "바뀜 (2026-11-09)".
// - 옛 개발 시험 명령(dev_spawn_units, 프로토콜 20에서 뺌)으로 받은 유닛은 새로 생기지 않는다. 부팅 복구가 유닛을 2차맵에 놓기 전에
//   남은 옛 행을 걸러 지운다(2차맵에 놓지 않으니 시야·전송에는 처음부터 없다). 지울 것이 없으면 아무것도 하지 않는다.
// - 떠나는 유닛의 물건은 수명이 다해 떠나는 휴먼(fusion/geneCommands.ts retire)과 같게 주인에게 옮긴다: 든 물건(보유 물건 칸, 입은 것은
//   벗긴다)은 주인 사이보그 본체가 든 것으로, 본체가 없으면 그 유닛 2차맵의 가장 가까운 도시 창고로(보유 물건 위치는 0이 될 수 없다 — 표 검사
//   item_holdings_location). 그 2차맵에 도시도 없으면 그대로 둔다(stranded로 센다 — 수명이 다한 휴먼도 본체가 없으면 든 물건을 옮기지 않는다).
//   화물(원장 위치 = −유닛 ID)은 그 계정 주인의 자리 없는 계정으로. 그래서 화물 불변 조건(I12 — 없는 유닛의 화물)이 그대로 맞는다.
// - 다른 기록은 이미 "유닛이 사라짐"을 다루는 길이 맡는다: 노동 계약은 다음 정산에서 "유닛 사라짐"으로 끝나고 직무 배치는 풀린다, 이동 줄
//   (world_travels)은 이동 복구가 유닛이 없으면 지운다, 생명 수치는 주기 청소가 지운다, 전투 결과는 없는 유닛을 건너뛴다. 유닛을 가리키는
//   휴먼·스킬·신앙 행은 외래 키가 함께 지운다(on delete cascade).
// - 한 번의 동기 처리로 쓰기 대기열에 넣는다(물건 옮기기·원장 거래·유닛 행 지우기가 같은 커밋). 감사 기록은 부르는 쪽이 커밋 뒤에 남긴다.
import type { Ledger } from "../economy/ledger.ts";
import type { HoldingService } from "../holdings/serviceTypes.ts";
import { carriedBy } from "../holdings/state.ts";
import { POSITION_UNITS_PER_CELL } from "@terra/protocol";
import type { CityRow } from "./cities.ts";
import type { OwnerRow, QueryPool } from "./persist/load.ts";
import type { WorldWriter } from "./persist/writer.ts";
import type { UnitRow } from "./secondMap.ts";
import { UNIT_KIND_OLD_WORKER } from "./unitKinds.ts";

export interface RetiredWorkers {
  /** 지운 유닛 수 */
  readonly units: number;
  /** 주인 사이보그 본체·도시 창고로 옮긴 보유 물건 칸 수 */
  readonly holdings: number;
  /** 든 물건을 둘 곳이 없어 그대로 둔 유닛 수(본체도 그 2차맵 도시도 없음 — 든 물건이 없었을 수도 있다) */
  readonly stranded: number;
  /** 주인에게 옮긴 화물 계정 수 */
  readonly cargo: number;
}

/** 부팅이 읽은 유닛 행을 남길 것과 지울 옛 시험 일꾼으로 나눈다 */
export function splitOldWorkers<T extends Pick<UnitRow, "kind">>(
  rows: readonly T[],
): { readonly kept: T[]; readonly retired: T[] } {
  const kept: T[] = [];
  const retired: T[] = [];
  for (const row of rows) (row.kind === UNIT_KIND_OLD_WORKER ? retired : kept).push(row);
  return { kept, retired };
}

/**
 * 옛 시험 일꾼 행을 지운다(쓰기 대기열, 한 번의 동기 처리). 든 물건·화물은 주인에게 옮긴다. 커밋은 부르는 쪽이 기다린다
 */
export function retireOldWorkers(input: {
  readonly rows: readonly Pick<UnitRow, "id" | "ownerId" | "mapKey" | "path">[];
  readonly owners: ReadonlyMap<number, OwnerRow>;
  /** 도시(본체가 없는 주인의 든 물건을 둘 도시 창고 = 그 2차맵의 가장 가까운 도시) */
  readonly cities: readonly Pick<CityRow, "id" | "mapKey" | "cellX" | "cellY">[];
  /** 사용자의 사이보그 본체 유닛 ID(없으면 undefined) */
  readonly cyborgUnitOf: (userId: string) => number | undefined;
  readonly holdings: Pick<HoldingService, "moveCarried">;
  readonly ledger: Ledger;
  readonly writer: WorldWriter;
  readonly nowMs: number;
}): RetiredWorkers {
  const { ledger, writer } = input;
  let holdings = 0;
  let stranded = 0;
  let cargo = 0;
  const gone = new Set(input.rows.map((row) => row.id));
  // 화물 계정(원장 위치 = −유닛 ID)은 장부를 한 번만 훑어 모은다
  const cargoOf = new Map<number, { id: number; ownerId: number; asset: string; balance: bigint }[]>();
  for (const account of ledger.accounts()) {
    const unitId = account.location === null ? 0 : -account.location;
    if (!gone.has(unitId) || account.ownerId === null || account.balance <= 0n) continue;
    const list = cargoOf.get(unitId) ?? [];
    list.push({ id: account.id, ownerId: account.ownerId, asset: account.asset, balance: account.balance });
    cargoOf.set(unitId, list);
  }
  for (const row of [...input.rows].toSorted((a, b) => a.id - b.id)) {
    // 든 물건: 주인 사이보그 본체가 든 것으로, 본체가 없으면 그 2차맵의 가장 가까운 도시 창고로
    const userId = input.owners.get(row.ownerId)?.userId ?? null;
    const body = userId === null ? undefined : input.cyborgUnitOf(userId);
    const place = body !== undefined && !gone.has(body) ? carriedBy(body) : nearestCity(row, input.cities);
    if (place === undefined) stranded += 1;
    else holdings += input.holdings.moveCarried(row.id, place);
    // 화물: 그 계정 주인의 자리 없는 계정으로(수명이 다한 휴먼의 화물과 같다)
    for (const account of cargoOf.get(row.id) ?? []) {
      ledger.post({
        kind: "retire_worker_cargo",
        atMs: input.nowMs,
        entries: [
          { account: account.id, amount: -account.balance },
          { account: ledger.ownerAccount(account.ownerId, account.asset), amount: account.balance },
        ],
      });
      cargo += 1;
    }
    writer.remove("units", { id: row.id });
  }
  return { units: input.rows.length, holdings, stranded, cargo };
}

/** 유닛이 마지막으로 선(가는 중이면 가는) 칸에서 가장 가까운 같은 2차맵 도시 ID(칸 거리 제곱, 같으면 작은 ID). 없으면 undefined */
function nearestCity(
  row: Pick<UnitRow, "mapKey" | "path">,
  cities: readonly Pick<CityRow, "id" | "mapKey" | "cellX" | "cellY">[],
): number | undefined {
  const x = Math.floor((row.path.at(-2) ?? 0) / POSITION_UNITS_PER_CELL);
  const y = Math.floor((row.path.at(-1) ?? 0) / POSITION_UNITS_PER_CELL);
  let best: { id: number; d: number } | undefined;
  for (const city of cities) {
    if (city.mapKey !== row.mapKey) continue;
    const d = (city.cellX - x) * (city.cellX - x) + (city.cellY - y) * (city.cellY - y);
    if (!best || d < best.d || (d === best.d && city.id < best.id)) best = { id: city.id, d };
  }
  return best?.id;
}

/** 지운 것을 감사 기록에 남긴다(system, world.retire_test_workers — 옛 시험 2차맵 정리와 같은 모양). 쓰기 대기열 커밋 뒤에 부른다 */
export async function auditRetiredWorkers(db: QueryPool, retired: RetiredWorkers): Promise<void> {
  await db.query(
    `insert into audit_log (actor_kind, action, before, meta) values ('system', 'world.retire_test_workers', $1, $2)`,
    [JSON.stringify(retired), JSON.stringify({ reason: "test workers removed (user 2026-11-09)" })],
  );
}
