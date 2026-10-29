// [임시] 가짜 행성 타일 워커 — mockPlanetSource.ts가 `new Worker(new URL("./mockPlanetWorker.ts", import.meta.url), { type: "module" })`로 띄운다.
// 결과 배열은 복사하지 않고 넘긴다(transfer). 타입은 DOM 기준으로 검사한다(엔진 tsconfig).
import { generateMockTile } from "./mockPlanet.ts";
import type { MockPlanetReply, MockPlanetRequest } from "./mockPlanetSource.ts";

self.addEventListener("message", (event: MessageEvent<MockPlanetRequest>) => {
  const { id, seed, faceLevel, request } = event.data;
  let reply: MockPlanetReply;
  let transfer: Transferable[] = [];
  try {
    const tile = generateMockTile(request, seed, faceLevel);
    reply = { id, ok: true, tile };
    transfer = [
      tile.heightsM,
      tile.biome,
      tile.water,
      tile.temperatureC,
      tile.humidity,
      tile.forest,
      tile.river,
    ]
      .map((array) => array.buffer)
      .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer);
  } catch (error) {
    reply = { id, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  self.postMessage(reply, { transfer });
});
