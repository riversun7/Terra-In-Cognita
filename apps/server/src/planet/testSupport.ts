// 행성 시험 도우미 — 시험 파일끼리 서로 import하지 않게 여기에 둔다(게임 앱 선언 파일에는 넣지 않는다: tsconfig.api.json)
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PlanetFields } from "@terra/planet";
import { type PlanetSource, createPlanetSource } from "./sources.ts";

/** 남긴 로그를 모으는 로거 */
export function recordingLog() {
  const lines: { level: "info" | "warn" | "error"; message: string; obj: object }[] = [];
  return {
    lines,
    messages: (level: "info" | "warn" | "error") =>
      lines.filter((line) => line.level === level).map((line) => line.message),
    info: (obj: object, message: string) => lines.push({ level: "info", message, obj }),
    warn: (obj: object, message: string) => lines.push({ level: "warn", message, obj }),
    error: (obj: object, message: string) => lines.push({ level: "error", message, obj }),
  };
}

/** 작은 합성 행성 원본(면 레벨 5 = 타일 30개) */
export function smallSource(options: { id?: string; faceLevel?: number; seed?: number } = {}): PlanetSource {
  return createPlanetSource({
    kind: "synthetic",
    id: options.id ?? "test_planet",
    name: { ko: "시험 행성", en: "Test planet" },
    faceLevel: options.faceLevel ?? 5,
    seed: options.seed ?? 7,
  });
}

/** 생성 횟수를 세고, 필요하면 결과를 붙잡거나 실패시키는 원본 */
export interface ControlledSource extends PlanetSource {
  calls: number;
  /** 남은 실패 횟수(0보다 크면 generate가 실패하고 1 줄인다) */
  failNext: number;
  /** true면 release()까지 generate가 끝나지 않는다 */
  hold: boolean;
  release(): void;
}

export function controlledSource(inner: PlanetSource): ControlledSource {
  const waiting: (() => void)[] = [];
  const source: ControlledSource = {
    id: inner.id,
    name: inner.name,
    faceLevel: inner.faceLevel,
    generatorVersion: inner.generatorVersion,
    definitionHash: inner.definitionHash,
    biomes: inner.biomes,
    spec: inner.spec,
    calls: 0,
    failNext: 0,
    hold: false,
    async generate(): Promise<PlanetFields> {
      source.calls += 1;
      if (source.failNext > 0) {
        source.failNext -= 1;
        throw new Error("generator failed (test)");
      }
      if (source.hold) await new Promise<void>((resolve) => waiting.push(resolve));
      return inner.generate();
    },
    release() {
      source.hold = false;
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
  return source;
}

/** 시험마다 새 임시 폴더. 지우는 함수를 함께 돌려준다 */
export async function temporaryDir(): Promise<{ dir: string; remove: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), "terra-planet-test-"));
  return { dir, remove: () => rm(dir, { recursive: true, force: true }) };
}
