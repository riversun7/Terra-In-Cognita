// 1차맵 타일 메시 워커 — 화면 스레드를 막지 않고 타일 메시(타입 배열)를 만든다. 결과 배열은 복사하지 않고 넘긴다(transfer).
// 서버 이진 타일(EncodedTile)은 여기서 packages/protocol 해석기로 풀고(마법 값·형식 버전·머리·길이 확인) 메시를 만든다.
// 빌드: tileBuilder.ts의 `new Worker(new URL("./tileWorker.ts", import.meta.url), { type: "module" })`를 Vite가 따로 묶는다.
// 타입은 DOM 기준으로 검사한다(tsconfig 참고).
import type { TileWorkerReply, TileWorkerRequest } from "./tileBuilder.ts";
import { decodeTileInput } from "./tileDecode.ts";
import { buildTileMesh, meshTransferables } from "./tileMesh.ts";

self.addEventListener("message", (event: MessageEvent<TileWorkerRequest>) => {
  const { id, radiusM, input } = event.data;
  let reply: TileWorkerReply;
  let transfer: Transferable[] = [];
  try {
    const tile = decodeTileInput(input.kind === "encoded" ? input : input.tile);
    const mesh = buildTileMesh(tile, radiusM);
    reply = { id, ok: true, mesh, tile };
    // 타일 배열은 이 워커가 받은 사본(또는 방금 푼 것)이라 함께 넘겨도 된다
    transfer = [
      ...meshTransferables(mesh),
      ...[tile.heightsM, tile.biome, tile.water, tile.temperatureC, tile.humidity, tile.forest, tile.river]
        .map((array) => array.buffer)
        .filter((buffer): buffer is ArrayBuffer => buffer instanceof ArrayBuffer),
    ];
  } catch (error) {
    reply = { id, ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  // 같은 버퍼가 두 번 있으면 넘기기가 실패한다(타일 배열이 버퍼 하나를 나눠 쓰는 경우)
  self.postMessage(reply, { transfer: [...new Set(transfer)] });
});
