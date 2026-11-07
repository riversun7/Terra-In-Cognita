// 보유 물건 WebSocket 처리 시험 — docs/adr/2026-11-03-item-holdings.md 5절. 서비스는 진짜(가짜 쓰기 대기열), 세계는 가짜.
import { decodeServerMessage } from "@terra/protocol";
import { describe, expect, it } from "vitest";
import type { Viewer } from "../trpc/context.ts";
import type { WorldWriter } from "../world/persist/writer.ts";
import { type HoldingsAccess, type ItemClientMessage, createItemGateway } from "./gateway.ts";
import { TEST_HOLDING_RULES } from "./rules.ts";
import { createHoldingService } from "./service.ts";
import { TEST_HOLDING_CONTENT } from "./testContent.ts";

const OWNER = 3;
const UNIT = 50;
const player: Viewer = { id: "user-player", loginId: "Fake_Player", roles: ["player"] };
const dev: Viewer = { id: "user-dev", loginId: "Fake_Dev", roles: ["dev"] };

function access(durable: string[]): HoldingsAccess {
  const writer: WorldWriter = {
    upsert: () => undefined,
    remove: () => undefined,
    append: () => undefined,
    durable: () => {
      durable.push("durable");
      return Promise.resolve();
    },
    drain: () => Promise.resolve(),
    pendingCount: 0,
    takeMetrics: () => ({}),
    crash: () => Promise.resolve(),
  };
  const service = createHoldingService({
    loaded: { holdings: [], effects: [], cooldowns: [], maxId: 0 },
    writer,
    content: () => TEST_HOLDING_CONTENT,
    rules: () => TEST_HOLDING_RULES,
    world: {
      unitOwner: (unitId) => (unitId === UNIT ? OWNER : undefined),
      unitKind: () => "cyborg",
      unitPrimaries: () => ({ str: 10, dex: 10, agi: 10, vit: 10, int: 10, wis: 10 }),
    },
  });
  return {
    service,
    ownerOf: (userId) => (userId === player.id || userId === dev.id ? OWNER : undefined),
    cyborgUnitOf: (userId) => (userId === dev.id ? UNIT : undefined),
    unitOwner: (unitId) => (unitId === UNIT ? OWNER : undefined),
    durable: () => writer.durable(),
    seed: () => 5,
  };
}

function open(found: HoldingsAccess | undefined, who: Viewer | null) {
  const sent: unknown[] = [];
  const gateway = createItemGateway({
    access: () => found,
    now: () => 1_000,
    log: { error: () => undefined },
  });
  const socket = gateway.open({
    send: (text) => sent.push(decodeServerMessage(text)),
    viewer: () => Promise.resolve(who),
  });
  return { sent, socket };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("보유 물건 WebSocket", () => {
  it("물약 쿨이면 다시 쓸 수 있는 시각을 알려 준다(D-509)", async () => {
    const { sent, socket } = open(access([]), dev);
    socket.handle({ t: "dev_grant_item", id: 1, item: "hold_tonic", quantity: 2 });
    socket.handle({ t: "item_use", id: 2, holding: 1 });
    socket.handle({ t: "item_use", id: 3, holding: 1 });
    await settle();
    expect(sent[2]).toEqual({ t: "item_result", id: 3, ok: false, code: "cooldown", readyAt: 31_000 });
  });

  it("로그인·세계 준비·권한을 먼저 본다", async () => {
    const grant: ItemClientMessage = { t: "dev_grant_item", id: 1, item: "hold_vest", quantity: 1 };
    const anonymous = open(access([]), null);
    anonymous.socket.handle(grant);
    const booting = open(undefined, dev);
    booting.socket.handle(grant);
    const plain = open(access([]), player);
    plain.socket.handle(grant);
    await settle();
    expect(anonymous.sent).toEqual([{ t: "item_result", id: 1, ok: false, code: "sign_in_required" }]);
    expect(booting.sent).toEqual([{ t: "item_result", id: 1, ok: false, code: "busy" }]);
    expect(plain.sent).toEqual([{ t: "item_result", id: 1, ok: false, code: "forbidden" }]);
  });

  it("개발 받기 → 입기 → 벗기: 바뀌면 커밋을 기다린 뒤 답한다", async () => {
    const durable: string[] = [];
    const found = access(durable);
    const { sent, socket } = open(found, dev);
    socket.handle({ t: "dev_grant_item", id: 1, item: "hold_vest", quantity: 2 });
    socket.handle({ t: "item_equip", id: 2, holding: 1, slot: 3 });
    socket.handle({ t: "item_equip", id: 3, holding: 2, slot: 0 });
    socket.handle({ t: "item_unequip", id: 4, holding: 1 });
    socket.handle({ t: "dev_grant_item", id: 5, item: "hold_vest", quantity: 1, unit: 999 });
    socket.handle({ t: "dev_grant_item", id: 6, item: "hold_rotten_fish", quantity: 1 });
    await settle();
    expect(sent).toEqual([
      { t: "item_result", id: 1, ok: true, holdings: [1, 2] },
      { t: "item_result", id: 2, ok: true },
      { t: "item_result", id: 3, ok: false, code: "wrong_slot" },
      { t: "item_result", id: 4, ok: true },
      { t: "item_result", id: 5, ok: false, code: "unknown_unit" },
      { t: "item_result", id: 6, ok: false, code: "not_holdable" },
    ]);
    expect(durable).toHaveLength(3);
    expect(found.service.equippedOn(UNIT)).toEqual([]);
  });

  it("쓰기: 효과량을 돌려주고, 확인이 필요하면 사라질 효과를 알려 준다", async () => {
    const found = access([]);
    const { sent, socket } = open(found, dev);
    socket.handle({ t: "dev_grant_item", id: 1, item: "hold_stew", quantity: 1 });
    socket.handle({ t: "dev_grant_item", id: 2, item: "hold_soup", quantity: 1 });
    socket.handle({ t: "item_use", id: 3, holding: 1 });
    socket.handle({ t: "item_use", id: 4, holding: 2 });
    socket.handle({ t: "item_use", id: 5, holding: 2, confirm: true });
    await settle();
    const [, , stew, ask, done] = sent;
    expect(stew).toMatchObject({ t: "item_result", id: 3, ok: true, effects: [{ effect: "hold_meal_str" }] });
    expect(ask).toEqual({
      t: "item_result",
      id: 4,
      ok: false,
      code: "confirm_replace",
      effects: ["hold_meal_str"],
    });
    expect(done).toMatchObject({ t: "item_result", id: 5, ok: true, effects: [{ effect: "hold_meal_int" }] });
  });

  it("개발 시험 병원 치료(D-514): dev·admin만, 내 유닛이어야 하고, 고리가 치료한 뒤 커밋을 기다린다", async () => {
    const durable: string[] = [];
    const treated: number[] = [];
    const found: HoldingsAccess = {
      ...access(durable),
      treat: (unitId) => {
        treated.push(unitId);
        return true;
      },
    };
    const plain = open(found, player);
    plain.socket.handle({ t: "dev_treat_unit", id: 1, unit: UNIT });
    const { sent, socket } = open(found, dev);
    socket.handle({ t: "dev_treat_unit", id: 2 });
    socket.handle({ t: "dev_treat_unit", id: 3, unit: 999 });
    const noHook = open(access([]), dev);
    noHook.socket.handle({ t: "dev_treat_unit", id: 4 });
    await settle();
    expect(plain.sent).toEqual([{ t: "item_result", id: 1, ok: false, code: "forbidden" }]);
    expect(sent).toEqual([
      { t: "item_result", id: 2, ok: true },
      { t: "item_result", id: 3, ok: false, code: "unknown_unit" },
    ]);
    expect(noHook.sent).toEqual([{ t: "item_result", id: 4, ok: false, code: "unknown_unit" }]);
    expect(treated).toEqual([UNIT]);
    expect(durable).toEqual(["durable"]);
  });
});
