// 화면 시험이 WebSocket 명령을 바로 보내는 도우미 — 같은 출처 브라우저에서 보내 쿠키(로그인)가 실린다.
// 개발 시험 명령(dev_spawn_units — 서버 처리, dev·admin)으로 시험 일꾼을 받는 곳도 여기다: 2차맵의 [시험 일꾼 받기] 단추는 지웠다
// (사용자 지적 2026-11-09 "시험일꾼받기 기능 없애라", docs/adr/2026-11-07-unit-control.md "바뀜 (2026-11-09)").
import type { Page } from "@playwright/test";
import { PROTOCOL_VERSION } from "../../packages/protocol/src/version.ts";

/** 시험 2차맵 키(@terra/protocol S1_TEST_MAP_KEY = S2 시험 행성 F9 면 0 (282, 328)) */
const S1_TEST_MAP_KEY = 312_905_547_382_793;

/** 브라우저에서 WebSocket 명령을 차례로 보낸다(같은 출처라 쿠키가 실린다). 결과 메시지들(result, 2차맵 사이 이동은 travel_result) */
export async function sendCommands(
  page: Page,
  commands: readonly Record<string, unknown>[],
): Promise<unknown[]> {
  await page.goto("/health");
  return page.evaluate(
    async ({ list, protocolVersion }) => {
      const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
      const replies: unknown[] = [];
      socket.addEventListener("message", (event) => {
        if (typeof event.data === "string") replies.push(JSON.parse(event.data));
      });
      // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
      const wait = (predicate: (message: unknown) => boolean): Promise<unknown> =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("no reply")), 15_000);
          const check = (): void => {
            const found = replies.find(predicate);
            if (found === undefined) setTimeout(check, 20);
            else {
              clearTimeout(timer);
              resolve(found);
            }
          };
          check();
        });
      await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
      socket.send(JSON.stringify({ t: "hello", protocolVersion, clientBuild: "e2e-ws" }));
      await wait(
        (reply) => typeof reply === "object" && reply !== null && Reflect.get(reply, "t") === "welcome",
      );
      const out: unknown[] = [];
      for (const [index, command] of list.entries()) {
        const id = 9000 + index;
        socket.send(JSON.stringify({ ...command, id }));
        out.push(
          await wait(
            (reply) =>
              typeof reply === "object" &&
              reply !== null &&
              ["result", "travel_result"].includes(String(Reflect.get(reply, "t"))) &&
              Reflect.get(reply, "id") === id,
          ),
        );
      }
      socket.close();
      return out;
    },
    { list: commands, protocolVersion: PROTOCOL_VERSION },
  );
}

/**
 * player 사이보그 본체가 선 2차맵. 세계 배치(docs/adr/2026-11-07-world-layout.md)로 시작 도시가 시험 2차맵 줄 밖(국가 자리)에 서므로, 임대·구인
 * 받기(같은 2차맵이어야 한다)를 시험할 시설은 그 2차맵에 놓는다. 자리를 모르거나 건너뛰는 중이면 시험 2차맵
 */
export async function cyborgMapKey(page: Page): Promise<number> {
  const key = await page.evaluate(async () => {
    const reply: unknown = await fetch("/api/trpc/world.myPosition").then((response) => response.json());
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
    const pick = (value: unknown, name: string): unknown =>
      typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
    const position = pick(pick(pick(reply, "result"), "data"), "position");
    return pick(position, "hidden") === true ? undefined : pick(position, "mapKey");
  });
  return typeof key === "number" ? key : S1_TEST_MAP_KEY;
}

/**
 * 개발 시험 명령으로 내 시험 일꾼 count개(최대 20)를 내 사이보그가 선 2차맵에 받는다(dev·admin). /health로 옮겨 보내므로 부른 뒤 화면을 다시 연다
 */
export async function devSpawnUnits(page: Page, count: number): Promise<void> {
  await page.goto("/health");
  const mapKey = await cyborgMapKey(page);
  const [reply] = await sendCommands(page, [{ t: "dev_spawn_units", mapKey, count }]);
  if (typeof reply !== "object" || reply === null || Reflect.get(reply, "ok") !== true)
    throw new Error(`dev_spawn_units failed: ${JSON.stringify(reply)}`);
}
