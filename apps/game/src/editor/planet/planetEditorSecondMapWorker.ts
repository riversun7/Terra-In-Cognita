// 편집기 2차맵 미리보기 워커(모듈 워커) — map/secondMapBuildClient.ts가
// `new Worker(new URL("./planetEditorSecondMapWorker.ts", import.meta.url), { type: "module" })`로 띄운다
// (ADR 2026-10-31-second-map-from-planet 9절). 파일 이름 앞머리 planetEditor를 지킨다: 서비스 워커 미리 캐시 규칙(DEV_ONLY_CHUNK)이
// 이 이름으로 개발자 조각을 뺀다(planetEditorWorker.ts와 같다).
// 마지막 행성 값을 들고 있다가 같은 행성이면 다시 쓴다(secondMapPreviewWork.ts). 일은 온 차례대로 하나씩 한다.
// 타입은 DOM 기준으로 검사한다(게임 앱 tsconfig).
import type { SecondMapPreviewReply, SecondMapPreviewRequest } from "./secondMapPreviewProtocol.ts";
import { emptyPlanetSlot, runSecondMapJob } from "./secondMapPreviewWork.ts";

const slot = emptyPlanetSlot();

function send(reply: SecondMapPreviewReply, transfer: ArrayBuffer[]): void {
  self.postMessage(reply, { transfer });
}

self.addEventListener("message", (event: MessageEvent<SecondMapPreviewRequest>) => {
  const request = event.data;
  if (request.kind !== "secondMap") return;
  const { reply, transfer } = runSecondMapJob(request, slot, {
    onStage: (stage) => send({ kind: "stage", id: request.id, stage }, []),
  });
  send(reply, transfer);
});
