// 보유 물건 명령 시험 — 인사 뒤 보내기, 같은 요청 번호의 답만 받기, 실패 코드·사라질 효과·쿨 시각, 끊김·답 없음
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLinkHub } from "../net/serverLink.ts";
import { sendItemCommand } from "./itemCommands.ts";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function setup() {
  const hub = createLinkHub((error) => {
    throw error;
  });
  const driver = hub.attach({ reconnect: () => {} });
  const sent: Record<string, unknown>[] = [];
  const ready = () =>
    driver.ready((text) => {
      const parsed: unknown = JSON.parse(text);
      sent.push(isRecord(parsed) ? parsed : {});
      return true;
    });
  return { link: hub.link, driver, sent, ready };
}

const idOf = (message: Record<string, unknown> | undefined): number => Number(message?.id);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("보유 물건 명령", () => {
  it("인사가 끝나면 보내고, 같은 요청 번호의 item_result만 받는다", async () => {
    const { link, driver, sent, ready } = setup();
    const outcome = sendItemCommand({ t: "item_equip", holding: 12, slot: 3 }, link);
    expect(sent).toEqual([]);
    ready();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ t: "item_equip", holding: 12, slot: 3 });
    const id = idOf(sent[0]);
    driver.message({ t: "item_result", id: (id + 1) >>> 0, ok: false, code: "busy" }, 10);
    driver.message({ t: "item_result", id, ok: true }, 10);
    await expect(outcome).resolves.toEqual({ ok: true });
  });

  it("쓰기 실패: 사라질 효과(confirm_replace)와 다시 쓸 시각(cooldown)을 그대로 넘긴다", async () => {
    const { link, driver, sent, ready } = setup();
    ready();
    const replace = sendItemCommand({ t: "item_use", holding: 5 }, link);
    driver.message(
      { t: "item_result", id: idOf(sent[0]), ok: false, code: "confirm_replace", effects: ["focus"] },
      10,
    );
    await expect(replace).resolves.toEqual({ ok: false, code: "confirm_replace", effects: ["focus"] });
    const wait = sendItemCommand({ t: "item_use", holding: 5, confirm: true }, link);
    expect(sent[1]).toMatchObject({ t: "item_use", holding: 5, confirm: true });
    driver.message({ t: "item_result", id: idOf(sent[1]), ok: false, code: "cooldown", readyAt: 99 }, 10);
    await expect(wait).resolves.toEqual({ ok: false, code: "cooldown", readyAt: 99 });
  });

  it("성공한 쓰기·받기는 효과량·받은 칸을 넘긴다", async () => {
    const { link, driver, sent, ready } = setup();
    ready();
    const used = sendItemCommand({ t: "item_use", holding: 5 }, link);
    driver.message(
      { t: "item_result", id: idOf(sent[0]), ok: true, effects: [{ effect: "focus", amount: 12 }] },
      10,
    );
    await expect(used).resolves.toEqual({ ok: true, effects: [{ effect: "focus", amount: 12 }] });
    const granted = sendItemCommand({ t: "dev_grant_item", item: "test_sword", quantity: 2 }, link);
    driver.message({ t: "item_result", id: idOf(sent[1]), ok: true, holdings: [7, 8] }, 10);
    await expect(granted).resolves.toEqual({ ok: true, holdings: [7, 8] });
  });

  it("보낸 뒤 끊기면 offline, 답이 없으면 timeout, 끝내 못 보내면 offline", async () => {
    const { link, driver, ready } = setup();
    ready();
    const dropped = sendItemCommand({ t: "item_unequip", holding: 1 }, link);
    driver.down();
    await expect(dropped).resolves.toEqual({ ok: false, code: "offline" });
    ready();
    const silent = sendItemCommand({ t: "item_unequip", holding: 1 }, link, 1000);
    vi.advanceTimersByTime(1000);
    await expect(silent).resolves.toEqual({ ok: false, code: "timeout" });
    driver.down();
    const never = sendItemCommand({ t: "item_unequip", holding: 1 }, link, 1000);
    vi.advanceTimersByTime(1000);
    await expect(never).resolves.toEqual({ ok: false, code: "offline" });
  });
});
