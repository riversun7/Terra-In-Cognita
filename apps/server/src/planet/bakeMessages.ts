// 메인 스레드 ↔ 굽기 워커 메시지 (src/planet/baker.ts ↔ src/planet/bakeWorker.ts)
// 굽기 하나마다 워커를 새로 띄우고, 요청 하나 → 답 하나 뒤 끝낸다(생성기 작업 메모리를 바로 돌려준다).
// 워커가 지울 수 있는 TS 문법만 쓰도록(Node 타입 지우기로 바로 실행) 타입만 둔다.
import type { BakedTiles } from "./bake.ts";
import type { PlanetSourceSpec } from "./sources.ts";

export interface BakeRequestMessage {
  type: "bake";
  spec: PlanetSourceSpec;
  /** 메인 스레드가 아는 값. 워커가 다시 만든 원본과 다르면 굽지 않는다(어긋난 캐시 키 방지) */
  generatorVersion: number;
  definitionHash: string;
}

/** 굽기 결과 + 워커 안에서 잰 값 */
export interface BakeOutput extends BakedTiles {
  /** 생성기(ms) */
  generateMs: number;
  /** 워커 안 전체(ms) */
  totalMs: number;
  /** 단계마다 잰 워커 스레드 메모리(힙 + 외부 버퍼)의 최대(MB). 같은 스레드 굽기(시험)는 0 */
  peakWorkerMb: number;
  /** 단계마다 잰 프로세스 RSS의 최대(MB, 메인 스레드 포함) */
  peakRssMb: number;
}

export type BakeReplyMessage =
  | { type: "done"; output: BakeOutput }
  | { type: "error"; message: string; stack?: string | undefined };
