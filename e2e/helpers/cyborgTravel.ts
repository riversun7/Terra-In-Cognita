// 화면 시험 도우미 — 내 사이보그 자리 묻기와 운영자 빠르기로 보내기(selection-ring.spec.ts·unit-looks.spec.ts가 함께 쓴다).
// 운영자 빠르기: 전체 보기(observe)로 구독한 연결에서 보낸 이동은 서버가 OPERATOR_SPEED_FACTOR(100)배로 보낸다(apps/server/src/world/operatorPace.ts).
import type { Page } from "@playwright/test";
import { expect } from "./test.ts";
import { sendCommands } from "./wsCommands.ts";

export interface Place {
  readonly mapKey: number;
  readonly cellX: number;
  readonly cellY: number;
}

const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, key) : undefined;

/** 내 사이보그 자리(tRPC world.myPosition, seamless.spec.ts와 같다). 건너뛰는 중이거나 없으면 null */
export async function myPosition(side: Page): Promise<(Place & { unitId: number }) | null> {
  const reply: unknown = await side.evaluate(() =>
    fetch("/api/trpc/world.myPosition").then((response) => response.json()),
  );
  const position = field(field(field(reply, "result"), "data"), "position");
  if (position === undefined || position === null || field(position, "hidden") === true) return null;
  return {
    mapKey: Number(field(position, "mapKey")),
    cellX: Number(field(position, "cellX")),
    cellY: Number(field(position, "cellY")),
    unitId: Number(field(position, "unitId")),
  };
}

/** 운영자 빠르기로 내 사이보그를 다른(또는 같은) 2차맵 칸으로 보낸다(2차맵 사이 이동 travel_start). 결과가 ok면 true */
export async function fastTravel(side: Page, from: number, unitId: number, to: Place): Promise<boolean> {
  const replies = await sendCommands(side, [
    { t: "subscribe", mapKey: from, observe: true },
    { t: "travel_start", unitId, mapKey: to.mapKey, x: to.cellX, y: to.cellY, kind: "move" },
  ]);
  return field(replies[1], "ok") === true;
}

/** 배치 칸 1칸 = 고정소수점 1,024(@terra/sim CELL_UNITS) — 칸 가운데로 보낸다 */
const CELL_UNITS = 1024;

/** 운영자 빠르기로 같은 2차맵 안 칸으로 보낸다(move_unit). 요청 ID를 바꿔 줘야 같은 명령을 다시 보낼 수 있다. 결과가 ok면 true */
export async function fastMove(side: Page, unitId: number, to: Place, firstId: number): Promise<boolean> {
  const replies = await sendCommands(
    side,
    [
      { t: "subscribe", mapKey: to.mapKey, observe: true },
      {
        t: "move_unit",
        mapKey: to.mapKey,
        unitId,
        x: to.cellX * CELL_UNITS + CELL_UNITS / 2,
        y: to.cellY * CELL_UNITS + CELL_UNITS / 2,
      },
    ],
    firstId,
  );
  return field(replies[1], "ok") === true;
}

/** 내 사이보그가 그 칸 둘레(반지름 칸)에 설 때까지 */
export async function waitAt(side: Page, target: Place, radius = 3): Promise<void> {
  await expect
    .poll(
      async () => {
        const at = await myPosition(side);
        if (!at || at.mapKey !== target.mapKey) return 999;
        return Math.max(Math.abs(at.cellX - target.cellX), Math.abs(at.cellY - target.cellY));
      },
      { timeout: 90_000, intervals: [500] },
    )
    .toBeLessThanOrEqual(radius);
}
