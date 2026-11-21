// NPC 운반 일 판 시험 — 운반꾼이 없으면 기다린다(기획 대조 2155 — D-555 1505), 운반꾼 수는 보는지와 상관없이 같다. NPC 시설 판매가 식(2153)도 함께 본다
import { cargoLocation } from "@terra/shared/goodsPlaces";
import { createLedgerBook } from "@terra/sim";
import { describe, expect, it } from "vitest";
import { type CarryRequest, createCarryBoard, peopleCounter } from "./npcCarry.ts";
import { npcShopPrice, traitTiltPm } from "./npcShopPrice.ts";

const OWNER = 9;
const GRAIN = "item:grain";
const FROM = 100;
const TO = 200;

function setup(idle = 1) {
  let ids = 1;
  const book = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
  book.post({
    kind: "grant",
    atMs: 0,
    entries: [
      { account: book.systemAccount("source", GRAIN), amount: -100n },
      { account: book.ownerAccount(OWNER, GRAIN, FROM), amount: 100n },
    ],
  });
  let idleNow = idle;
  const board = createCarryBoard(book, { peopleOf: () => idleNow });
  const setIdle = (value: number): void => {
    idleNow = value;
  };
  return { book, board, setIdle };
}

const request = (key: string, atMs: number, extra: Partial<CarryRequest> = {}): CarryRequest => ({
  key,
  cityId: 3,
  owner: OWNER,
  stacks: [{ asset: GRAIN, qty: 10n }],
  from: FROM,
  to: TO,
  x: 1,
  y: 2,
  atMs,
  durMs: 1000,
  ...extra,
});

describe("운반 일 판 — 운반꾼이 없으면 기다린다(2155)", () => {
  it("일꾼 운반: 시설마다 하나 — 앞 운반이 닿은 시각에 다음이 떠난다(늦게 불려도 같은 시각)", () => {
    const { book, board } = setup();
    const started: [string, number, number][] = [];
    const onStart = (job: { key: string; fromMs: number; untilMs: number }): void => {
      started.push([job.key, job.fromMs, job.untilMs]);
    };
    expect(board.post(request("f:1", 0, { worker: 7, onStart }))).toBe(1000);
    expect(board.post(request("f:2", 500, { worker: 7, onStart }))).toBeUndefined();
    // 다른 시설은 따로
    expect(board.post(request("f:3", 500, { worker: 8, onStart }))).toBe(1500);
    expect(board.stateOf("f:2")).toBe("waiting");
    expect(board.ofWorker(7, 600)?.key).toBe("f:1");
    // 기다리는 동안 물건은 출발 자리에 그대로
    expect(book.balanceOf(OWNER, GRAIN, FROM)).toBe(100n);
    // 닿음을 늦게 처리해도(1200) 다음 일은 앞 일이 닿은 1000에 떠난다
    expect(board.finish("f:1", 1200)).toEqual([{ asset: GRAIN, qty: 10n }]);
    expect(started).toEqual([
      ["f:1", 0, 1000],
      ["f:3", 500, 1500],
      ["f:2", 1000, 2000],
    ]);
    expect(board.stateOf("f:2")).toBe(2000);
    expect(book.balanceOf(OWNER, GRAIN, TO)).toBe(10n);
  });

  it("빈 일꾼 운반: 그 도시 휴먼 중 운반하지 않는 수만큼만 떠나고, 휴먼이 늘면 pump가 띄운다. 0명이면 짐은 남는다", () => {
    const { book, board, setIdle } = setup(1);
    expect(board.post(request("x:1", 0))).toBe(1000);
    expect(board.post(request("x:2", 0))).toBeUndefined();
    expect(board.idle(3, 10).map((job) => job.key)).toEqual(["x:1"]);
    setIdle(0);
    board.finish("x:1", 1000);
    // 운반꾼이 없다 — 시간 셈으로 떠나지 않는다
    expect(board.stateOf("x:2")).toBe("waiting");
    expect(board.pump(5000)).toBe(0);
    expect(book.balanceOf(OWNER, GRAIN, FROM)).toBe(90n);
    setIdle(2);
    expect(board.pump(6000)).toBe(1);
    expect(board.stateOf("x:2")).toBe(7000);
    // 시설 산출을 나르는 일꾼도 운반 중인 사람이다: 휴먼 2 − 일꾼 운반 1 − 빈 일꾼 운반 1 = 자리 없음
    board.post(request("f:9", 6000, { worker: 7 }));
    expect(board.post(request("x:3", 6000))).toBeUndefined();
  });

  it("기다리는 일만 지울 수 있다. 떠난 일은 실었든 아니든 끝까지 간다(보는지와 상관없는 판정)", () => {
    const { book, board } = setup(1);
    board.post(request("x:1", 0));
    board.post(request("x:2", 0));
    expect(board.drop("x:2")).toBe(true);
    expect(board.drop("x:1")).toBe(false);
    expect(board.load("x:1", 501, 10)).toBe(true);
    expect(book.balanceOf(OWNER, GRAIN, cargoLocation(501))).toBe(10n);
    expect(board.finish("x:1", 1000)).toEqual([{ asset: GRAIN, qty: 10n }]);
    expect(board.pending()).toBe(0);
  });

  it("운반꾼이 될 수 있는 휴먼 = 그 도시 휴먼(경비대 빼고), 같은 시각에는 한 번만 센다", () => {
    let calls = 0;
    const count = peopleCounter(
      () => 5,
      () => {
        calls += 1;
        return [{ city: 1 }, { city: 1 }, { city: 1, guard: true }, { city: 1 }, { city: 2 }];
      },
    );
    expect(count(1)).toBe(3);
    expect(count(2)).toBe(1);
    expect(count(4)).toBe(0);
    expect(calls).toBe(1);
  });
});

describe("NPC 시설 판매가(2153)", () => {
  const base = {
    base: 100n,
    commerceTiltPm: 500,
    stock: 100n,
    minLot: 10,
    temperPm: 100,
    stockPm: 200,
    stockLots: 10,
  };
  it("목표 재고·가운데 성향이면 팩 기준 값, 시세 움직임 비율을 따른다", () => {
    expect(npcShopPrice(base)).toBe(100n);
    expect(npcShopPrice({ ...base, last: 60n, start: 40n })).toBe(150n);
  });
  it("재고가 비면 올리고 두 배 넘게 쌓이면 내린다, 상업 성향이 높으면 비싸게", () => {
    expect(npcShopPrice({ ...base, stock: 0n })).toBe(120n);
    expect(npcShopPrice({ ...base, stock: 500n })).toBe(80n);
    expect(npcShopPrice({ ...base, commerceTiltPm: 1000 })).toBe(110n);
    expect(npcShopPrice({ ...base, commerceTiltPm: 0, stock: 1000n })).toBe(70n);
    expect(traitTiltPm(0, -1000, 1000)).toBe(500);
  });
  it("값은 1 아래로 내려가지 않는다", () => {
    expect(npcShopPrice({ ...base, base: 1n, stock: 1000n, commerceTiltPm: 0 })).toBe(1n);
  });
});

describe("운반 일 판 — 운반꾼이 없으면 물류센터에 맡긴다(2274)", () => {
  it("빈 일꾼 운반만 맡기고, 맡긴 일은 휴먼 자리·싣기에서 빠지며 닿음은 맡긴 쪽이 알린다", () => {
    let ids = 1;
    const book = createLedgerBook({ nextAccountId: () => ids++, nextTxId: () => ids++ });
    book.post({
      kind: "grant",
      atMs: 0,
      entries: [
        { account: book.systemAccount("source", GRAIN), amount: -100n },
        { account: book.ownerAccount(OWNER, GRAIN, FROM), amount: 100n },
      ],
    });
    let open = false;
    let landed = false;
    const asked: string[] = [];
    const board = createCarryBoard(book, {
      peopleOf: () => 1,
      outsource: (req, nowMs) => {
        asked.push(req.key);
        if (!open) return undefined;
        // 실제 운반 길이 물건을 옮긴다(여기서는 바로 to로 — 닿음은 landed가 알린다)
        book.post({
          kind: "test",
          atMs: nowMs,
          entries: [
            { account: book.ownerAccount(OWNER, GRAIN, FROM), amount: -10n },
            { account: book.ownerAccount(OWNER, GRAIN, TO), amount: 10n },
          ],
        });
        return { arriveAtMs: nowMs + 5000, done: () => landed };
      },
    });
    // 휴먼 하나가 먼저 진다 → 둘째는 맡겨 보지만 물류센터가 없어 기다림
    expect(board.post(request("x:1", 0))).toBe(1000);
    expect(board.post(request("x:2", 0))).toBeUndefined();
    expect(asked).toEqual(["x:2"]);
    // 일꾼 운반은 맡기지 않는다
    expect(board.post(request("f:1", 0, { worker: 7 }))).toBe(1000);
    expect(board.post(request("f:2", 0, { worker: 7 }))).toBeUndefined();
    expect(asked).toEqual(["x:2"]);
    // 물류센터가 생기면 pump가 맡긴다 — 도시 휴먼 자리를 쓰지 않는다
    open = true;
    expect(board.pump(100)).toBe(1);
    expect(board.stateOf("x:2")).toBe("waiting");
    expect(board.idle(3, 200).map((job) => job.key)).toEqual(["x:1"]);
    expect(board.load("x:2", 55, 200)).toBe(false);
    landed = true;
    expect(board.stateOf("x:2")).toBe(100);
    // 끝은 원장을 옮기지 않고 to에 있는 만큼(요청 양까지)
    expect(board.finish("x:2", 6000)).toEqual([{ asset: GRAIN, qty: 10n }]);
    expect(book.balanceOf(OWNER, GRAIN, TO)).toBe(10n);
    expect(book.balanceOf(OWNER, GRAIN, FROM)).toBe(90n);
  });
});
