// 화면 시험이 영토 비콘을 놓고 치우는 도우미 — 개발 대신 놓기(WebSocket beacon_place factionId, 권한 territory dev-place: admin·dev).
// 개발 대신 놓기는 재료·건설 시간 없이 바로 꼭짓점이 된다(docs/adr/2026-11-07-buildings-runtime.md). 시험끼리 서버·DB를 같이 쓰므로 놓은
// 시험이 끝에 치운다(removeBeacon).
import type { Page } from "@playwright/test";
import { isCellKey, stepCell } from "../../packages/planet/src/index.ts";
import { sendCommands } from "./wsCommands.ts";

const pick = (value: unknown, name: string): unknown =>
  typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;

/** 2차맵 키에서 (di, dj) 방향으로 n칸 */
function walk(key: number, di: number, dj: number, steps: number): number | null {
  let at: number | null = key;
  for (let step = 0; step < steps && at !== null; step++) at = isCellKey(at) ? stepCell(at, di, dj) : null;
  return at;
}

/**
 * 그 도시(2차맵 키) 둘레 칸에 그 세력의 비콘 하나를 놓는다: 방향 넷 × 거리(멀리부터) 가운데 처음 받아들여진 자리. 놓은 비콘 ID와 칸 키,
 * 모두 거절되면 null(거리 밖·다른 세력 영향권 등)
 */
export async function placeBeaconNear(
  admin: Page,
  planetId: string,
  mapKey: number,
  factionId: number,
  distances: readonly number[] = [7, 6, 5, 4],
): Promise<{ beaconId: number; cellKey: number } | null> {
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  let id = 70_000 + Math.floor(Math.random() * 1_000_000);
  for (const distance of distances)
    for (const [di, dj] of directions) {
      const cellKey = walk(mapKey, di, dj, distance);
      if (cellKey === null) continue;
      id += 1;
      const [reply] = await sendCommands(admin, [{ t: "beacon_place", planetId, cellKey, factionId }], id);
      const beaconId = pick(reply, "beaconId");
      if (pick(reply, "ok") === true && typeof beaconId === "number") return { beaconId, cellKey };
    }
  return null;
}

/** 비콘을 치운다(개발 권한은 아무 비콘) */
export async function removeBeacon(admin: Page, beaconId: number): Promise<void> {
  await sendCommands(
    admin,
    [{ t: "beacon_remove", beaconId }],
    80_000 + Math.floor(Math.random() * 1_000_000),
  );
}
