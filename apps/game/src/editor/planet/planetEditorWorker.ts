// 행성 편집기 미리보기 워커(모듈 워커) — previewController.ts가
// `new Worker(new URL("./planetEditorWorker.ts", import.meta.url), { type: "module" })`로 띄운다(ADR 38 3절).
// 파일 이름 앞머리 planetEditor를 지킨다: Vite가 조각 이름을 진입 파일 이름으로 짓고, 서비스 워커 미리 캐시 규칙
// (DEV_ONLY_CHUNK, ADR 38 1절)이 이 이름으로 개발자 조각을 뺀다.
// 일 하나를 받으면 단계마다 알리고, 결과 배열은 복사하지 않고 넘긴다(previewWork.ts). 일은 한 번에 하나씩 온다
// (화면이 하나가 끝나야 다음을 보낸다). 도중에 멈출 수 없어서, 낡은 일은 화면이 워커를 끝내고 다시 띄운다.
// 타입은 DOM 기준으로 검사한다(게임 앱 tsconfig).
import type { PreviewReply, PreviewRequest, PreviewStage } from "./previewProtocol.ts";
import { runPreviewJob } from "./previewWork.ts";

/** 답 하나를 보낸다(넘길 버퍼가 없으면 빈 목록) */
function send(reply: PreviewReply, transfer: ArrayBuffer[]): void {
  self.postMessage(reply, { transfer });
}

self.addEventListener("message", (event: MessageEvent<PreviewRequest>) => {
  const request = event.data;
  if (request.kind !== "generate") return;
  const { reply, transfer } = runPreviewJob(request, {
    onStage: (stage: PreviewStage) => send({ kind: "stage", id: request.id, stage }, []),
  });
  send(reply, transfer);
});
