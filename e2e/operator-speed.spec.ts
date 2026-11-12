// 운영자 빠르기 화면 시험(WebSocket만) — 사용자 지적 2026-11-12 "운영자모드에서 이동시 맵을클릭할때는 빠른속도가 적용되나 작업이나 다른 명령시엔
// 원래느린속도다" (apps/server/src/world/operatorPace.ts).
// - dev: 같은 2차맵을 보통 보기로 구독한 연결과 전체 보기(운영자 모드)로 구독한 연결을 함께 연다. 내 사이보그에게 건물 들어가기(unit_enter —
//   채집 서비스가 걷게 한다, 이동 명령이 아니다)를 보통 연결에서 보내면 보통 빠르기, 운영자 연결에서 보내면 100배로 걷는다(전송의 speed).
// - 끝나면 운영자 빠르기로 원래 자리에 돌려놓는다(다른 시험이 dev 사이보그 자리를 쓴다).
import { PROTOCOL_VERSION } from "../packages/protocol/src/version.ts";
import { fastMove, myPosition, waitAt } from "./helpers/cyborgTravel.ts";
import { expect, test } from "./helpers/test.ts";

/** 운영자 빠르기 배수(서버 OPERATOR_SPEED_FACTOR) */
const OPERATOR_SPEED_FACTOR = 100;

test.describe("운영자 빠르기: 이동 명령이 아닌 명령", () => {
  test.use({ account: "dev" });

  test("건물 들어가기도 운영자 모드 연결에서 보내면 100배, 보통 연결에서 보내면 보통 빠르기", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.goto("/health");
    const home = await myPosition(page);
    if (!home) throw new Error("dev 사이보그 자리를 모릅니다");
    // 같은 사용자·2차맵·요청 번호의 이동 명령은 10분 동안 한 번만 한다 → 실행마다 다른 번호
    const baseId = 100_000 + (Date.now() % 800_000);
    try {
      const outcome = await page.evaluate(
        async ({ mapKey, unitId, protocolVersion, baseId: firstId }) => {
          type Message = Record<string, unknown>;
          const open = async (): Promise<{ socket: WebSocket; inbox: Message[] }> => {
            const socket = new WebSocket(`${location.origin.replace(/^http/, "ws")}/ws`);
            const inbox: Message[] = [];
            socket.addEventListener("message", (event) => {
              if (typeof event.data === "string") inbox.push(JSON.parse(event.data));
            });
            await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
            socket.send(JSON.stringify({ t: "hello", protocolVersion, clientBuild: "e2e-operator-speed" }));
            return { socket, inbox };
          };
          // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
          const wait = (inbox: Message[], from: number, predicate: (message: Message) => boolean) =>
            new Promise<Message>((resolve, reject) => {
              const timer = setTimeout(() => reject(new Error("no reply")), 20_000);
              const check = (): void => {
                const found = inbox.slice(from).find(predicate);
                if (found === undefined) setTimeout(check, 20);
                else {
                  clearTimeout(timer);
                  resolve(found);
                }
              };
              check();
            });
          const isReply = (t: string, id: number) => (message: Message) =>
            message.t === t && message.id === id;
          // oxlint-disable-next-line unicorn/consistent-function-scoping -- 브라우저에서 도는 함수 안이라 밖으로 뺄 수 없다
          const isMessage = (value: unknown): value is Message => typeof value === "object" && value !== null;
          const listOf = (message: Message, key: string): Message[] => {
            const value = message[key];
            return Array.isArray(value) ? value.filter(isMessage) : [];
          };
          const unitsOf = (message: Message): Message[] => listOf(message, "units");
          const operator = await open();
          const plain = await open();
          await wait(operator.inbox, 0, (message) => message.t === "welcome");
          await wait(plain.inbox, 0, (message) => message.t === "welcome");
          operator.socket.send(JSON.stringify({ t: "subscribe", id: firstId, mapKey, observe: true }));
          plain.socket.send(JSON.stringify({ t: "subscribe", id: firstId, mapKey }));
          await wait(operator.inbox, 0, isReply("result", firstId));
          await wait(plain.inbox, 0, isReply("result", firstId));
          // 전체 보기 스냅샷 조각을 모아 내 사이보그 자리와 가장 먼 건물을 고른다
          const first = await wait(operator.inbox, 0, (message) => message.t === "map_snapshot");
          const parts = Number(first.parts);
          const snapshot = operator.inbox.filter(
            (message) => message.t === "map_snapshot" && message.snapshotId === first.snapshotId,
          );
          if (snapshot.length < parts) throw new Error("snapshot parts missing");
          const units = snapshot.flatMap(unitsOf);
          const buildings = snapshot.flatMap((message) => listOf(message, "buildings"));
          const mine = units.find((unit) => unit.id === unitId);
          const path = Array.isArray(mine?.path) ? mine.path.map(Number) : [];
          const cellX = Math.floor((path.at(-2) ?? 0) / 1024);
          const cellY = Math.floor((path.at(-1) ?? 0) / 1024);
          let target: Message | undefined;
          let far = 0;
          for (const building of buildings) {
            const distance = Math.max(
              Math.abs(Number(building.x) - cellX),
              Math.abs(Number(building.y) - cellY),
            );
            if (distance > far) {
              far = distance;
              target = building;
            }
          }
          if (!target) throw new Error("no building on the map");
          /** 그 연결로 들어가기를 보내고, 그 뒤 처음 오는 내 사이보그 움직임의 빠르기 */
          const enterSpeed = async (link: typeof operator, id: number): Promise<unknown> => {
            const from = operator.inbox.length;
            link.socket.send(JSON.stringify({ t: "unit_enter", id, unitId, buildingId: target.id }));
            const result = await wait(link.inbox, 0, isReply("gather_result", id));
            if (result.ok !== true) return `enter failed: ${String(result.code)}`;
            const paths = await wait(
              operator.inbox,
              from,
              (message) => message.t === "unit_paths" && unitsOf(message).some((unit) => unit.id === unitId),
            );
            return unitsOf(paths).find((unit) => unit.id === unitId)?.speed;
          };
          // 보통 연결 먼저(느리게 걷는 중에 운영자 명령이 새 길을 연다 — 이미 닿아 서 있으면 걸음이 없다)
          const normal = await enterSpeed(plain, firstId + 1);
          const fast = await enterSpeed(operator, firstId + 2);
          operator.socket.close();
          plain.socket.close();
          return { normal, fast, far };
        },
        { mapKey: home.mapKey, unitId: home.unitId, protocolVersion: PROTOCOL_VERSION, baseId },
      );
      expect(outcome.far).toBeGreaterThan(4);
      expect(typeof outcome.normal).toBe("number");
      expect(outcome.fast).toBe(Number(outcome.normal) * OPERATOR_SPEED_FACTOR);
    } finally {
      // 원래 자리로(운영자 빠르기 이동 — 안에 머문 건물에서도 움직이면 나간다)
      if (await fastMove(page, home.unitId, home, baseId + 10)) await waitAt(page, home, 3);
    }
  });
});
