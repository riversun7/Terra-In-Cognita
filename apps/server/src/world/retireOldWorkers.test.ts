// 없앤 시험 일꾼 옛 행 정리 시험(사용자 지적 2026-11-09 "시험일꾼 다 없애라고") — 종류 1만 거르고, 든 물건은 주인 사이보그 본체가 든
// 것으로(본체가 없으면 그 2차맵의 가장 가까운 도시 창고, 도시도 없으면 그대로), 화물은 그 계정 주인의 자리 없는 계정으로 옮긴 뒤 유닛 행을
// 지운다. 원장은 시뮬 장부(메모리), 쓰기 대기열은 가짜.
import { type LedgerBook, createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import type { OwnerRow } from "./persist/load.ts";
import type { Row, WorldTable } from "./persist/tables.ts";
import type { WorldWriter } from "./persist/writer.ts";
import { retireOldWorkers, splitOldWorkers } from "./retireOldWorkers.ts";
import { UNIT_KIND_CYBORG, UNIT_KIND_HUMAN, UNIT_KIND_OLD_WORKER } from "./unitKinds.ts";

const T0 = 1_800_000_000_000;
const ORE = "s3_test_ore";

function fakeWriter() {
  const ops: { op: "upsert" | "remove" | "append"; table: WorldTable; row: Row }[] = [];
  const writer: WorldWriter = {
    upsert: (table, row) => ops.push({ op: "upsert", table, row }),
    remove: (table, row) => ops.push({ op: "remove", table, row }),
    append: (table, row) => ops.push({ op: "append", table, row }),
    durable: () => Promise.resolve(),
    drain: () => Promise.resolve(),
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: () => Promise.resolve(),
  };
  return { writer, ops };
}

function ledger(): LedgerBook {
  let account = 0;
  let tx = 0;
  return createLedgerBook({ nextAccountId: () => ++account, nextTxId: () => ++tx });
}

/** 배치 칸 가운데의 위치(고정소수점 x, y) */
const cell = (x: number, y: number) => [x * 1024 + 512, y * 1024 + 512];

const owner = (id: number, userId: string | null): OwnerRow => ({
  id,
  userId,
  factionId: null,
  settledAtMs: T0,
  upkeepArrears: 0,
  upkeepUnpaidAtMs: null,
});

describe("없앤 시험 일꾼 옛 행 정리", () => {
  it("종류 1만 지울 것으로 나눈다(차례는 그대로)", () => {
    const rows = [
      { id: 1, kind: UNIT_KIND_CYBORG },
      { id: 2, kind: UNIT_KIND_OLD_WORKER },
      { id: 3, kind: UNIT_KIND_HUMAN },
      { id: 4, kind: UNIT_KIND_OLD_WORKER },
    ];
    const { kept, retired } = splitOldWorkers(rows);
    expect(kept.map((row) => row.id)).toEqual([1, 3]);
    expect(retired.map((row) => row.id)).toEqual([2, 4]);
    expect(splitOldWorkers([{ id: 5, kind: UNIT_KIND_HUMAN }]).retired).toEqual([]);
  });

  it("든 물건은 주인 사이보그 본체로(없으면 가까운 도시 창고), 화물은 자리 없는 계정으로 옮기고 유닛 행을 지운다", () => {
    const book = ledger();
    const { writer, ops } = fakeWriter();
    // 주체 10(사용자 u1, 본체 유닛 100)의 일꾼 11, 주체 20(사용자 u2, 본체 없음)의 일꾼 21(2차맵 5 칸 (10, 10)),
    // 주체 30(세력, 본체 없음)의 일꾼 31(도시 없는 2차맵 9)
    const owners = new Map([
      [10, owner(10, "u1")],
      [20, owner(20, "u2")],
      [30, owner(30, null)],
    ]);
    book.post({
      kind: "issue",
      atMs: T0,
      entries: [
        { account: book.systemAccount("test_issue_ore", ORE), amount: -12n },
        { account: book.ownerAccount(10, ORE, -11), amount: 7n },
        { account: book.ownerAccount(20, ORE, -21), amount: 5n },
      ],
    });
    const moved: [number, number][] = [];
    const result = retireOldWorkers({
      rows: [
        { id: 21, ownerId: 20, mapKey: 5, path: [...cell(0, 0), ...cell(10, 10)] },
        { id: 11, ownerId: 10, mapKey: 5, path: cell(10, 10) },
        { id: 31, ownerId: 30, mapKey: 9, path: cell(10, 10) },
      ],
      owners,
      cities: [
        { id: 3, mapKey: 5, cellX: 100, cellY: 100 },
        { id: 7, mapKey: 5, cellX: 12, cellY: 12 },
        { id: 2, mapKey: 6, cellX: 10, cellY: 10 },
      ],
      cyborgUnitOf: (userId) => (userId === "u1" ? 100 : undefined),
      holdings: {
        moveCarried: (unitId, location) => {
          moved.push([unitId, location]);
          return 1;
        },
      },
      ledger: book,
      writer,
      nowMs: T0,
    });
    expect(result).toEqual({ units: 3, holdings: 2, stranded: 1, cargo: 2 });
    // 유닛 ID 차례, 본체가 든 것 = 위치 −100, 본체가 없으면 가는 칸 (10, 10)에서 가까운 같은 2차맵 도시 7의 창고, 도시 없는 31은 그대로
    expect(moved).toEqual([
      [11, -100],
      [21, 7],
    ]);
    expect(book.balanceOf(10, ORE)).toBe(7n);
    expect(book.balanceOf(20, ORE)).toBe(5n);
    expect(book.balance(book.ownerAccount(10, ORE, -11))).toBe(0n);
    expect(book.balance(book.ownerAccount(20, ORE, -21))).toBe(0n);
    expect(ops.filter((entry) => entry.op === "remove")).toEqual([
      { op: "remove", table: "units", row: { id: 11 } },
      { op: "remove", table: "units", row: { id: 21 } },
      { op: "remove", table: "units", row: { id: 31 } },
    ]);
  });
});
