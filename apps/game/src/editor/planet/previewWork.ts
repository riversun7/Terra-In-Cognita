// 미리보기 일 하나(워커 안 순수 부분) — 생성 → 요약 자리 → 단계별 모으기(맵 레벨 F−4~F) + 꼭짓점 높이 → 답과 넘길 목록.
// planetEditorWorker.ts가 메시지를 받아 이 함수를 부른다. 시험은 워커 없이 이 함수를 바로 부른다(vitest는 모듈 워커를 띄우지 않는다).
// 가져오는 것: 생성기 진입점(@terra/planet/generator)과 타일 도우미(@terra/planet)뿐이다. 콘텐츠 패키지·엔진은 가져오지 않는다(ADR 38 3절).
// 생성기 판이 바뀌어도(출력이 달라져도) 공개 API만 쓰므로 그대로 돈다. 해시·판 번호를 코드에 적지 않는다.
import { aggregatePlanetLevels, planetCornerHeights } from "@terra/planet";
import {
  type GeneratorDetails,
  type PlanetGeneratorInput,
  runPlanetGenerator,
  validatePlanetInput,
} from "@terra/planet/generator";
import {
  type PreviewReply,
  type PreviewRequest,
  type PreviewResultData,
  type PreviewStage,
  type PreviewSummary,
  previewTransferables,
  transferredBytes,
} from "./previewProtocol.ts";

/** 요약 훅 — 생성기 도우미(WP-A)의 summarizePlanet을 여기에 건다. 없으면 요약 없이(null) 보낸다 */
export type PreviewSummaryHook = (
  details: GeneratorDetails,
  input: PlanetGeneratorInput,
) => PreviewSummary | null;

export interface PreviewWorkOptions {
  /** 단계가 끝날 때마다(생성기 단계 → summary → levels) */
  readonly onStage?: (stage: PreviewStage) => void;
  readonly summarize?: PreviewSummaryHook;
  /** 시계(ms). 기본 performance.now */
  readonly now?: () => number;
}

/** 워커가 보낼 답 하나와 넘길 버퍼 */
export interface PreviewWorkOutput {
  readonly reply: PreviewReply;
  readonly transfer: ArrayBuffer[];
}

/** 가장 높은 칸(게임 m) */
export function highestElevation(elevationM: Int16Array): number {
  let highest = Number.NEGATIVE_INFINITY;
  for (const value of elevationM) if (value > highest) highest = value;
  return Number.isFinite(highest) ? highest : 0;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 일 하나를 끝까지 한다. 던지지 않는다: 생성기가 받지 않는 입력은 rejected, 그 밖의 오류는 failed로 답한다 */
export function runPreviewJob(request: PreviewRequest, options: PreviewWorkOptions = {}): PreviewWorkOutput {
  const { id, key, input } = request;
  const now = options.now ?? (() => performance.now());
  const onStage = options.onStage ?? (() => undefined);
  const started = now();
  try {
    validatePlanetInput(input);
  } catch (error) {
    return { reply: { kind: "error", id, key, code: "rejected", message: messageOf(error) }, transfer: [] };
  }
  try {
    const details = runPlanetGenerator(input, { onStage });
    const generateMs = now() - started;
    const summary = options.summarize ? options.summarize(details, input) : null;
    onStage("summary");
    const { fields } = details;
    const levels = aggregatePlanetLevels(fields);
    const corners = levels.map((level) => planetCornerHeights(level));
    onStage("levels");
    const partial = {
      fields,
      levels,
      corners,
      summary,
      seaLevelRealM: details.seaLevelRealM,
      maxElevationM: highestElevation(fields.elevationM),
      generateMs,
      workerMs: 0,
      outputBytes: 0,
    } satisfies PreviewResultData;
    const transfer = previewTransferables(partial);
    const result: PreviewResultData = {
      ...partial,
      workerMs: now() - started,
      outputBytes: transferredBytes(transfer),
    };
    return { reply: { kind: "result", id, key, result }, transfer };
  } catch (error) {
    return { reply: { kind: "error", id, key, code: "failed", message: messageOf(error) }, transfer: [] };
  }
}
