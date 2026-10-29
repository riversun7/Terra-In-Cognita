// 넘길 목록 시험 — 필드 이름을 적지 않고 배열 보기를 모두 넣는다(생성기가 출력 필드를 더해도 넘기고 바이트에 센다),
// 같은 버퍼는 한 번, 공유 메모리는 뺀다
import type { PlanetFields } from "@terra/planet/generator";
import { describe, expect, it } from "vitest";
import { type PreviewResultData, previewTransferables, transferredBytes } from "./previewProtocol.ts";
import { fakeResult } from "./previewTestKit.ts";

describe("넘길 버퍼 목록", () => {
  it("생성 결과에 새 배열 필드가 생겨도 넘기고 바이트에 센다", () => {
    const base = fakeResult(5);
    const extra = new Float32Array(3);
    const withExtra = { ...base.fields, cloudCover: extra };
    const fields: PlanetFields = withExtra;
    const result: PreviewResultData = { ...base, fields };
    const buffers = previewTransferables(result);
    expect(buffers).toContain(extra.buffer);
    // 가짜 결과의 배열 8개(칸 하나: 2+1+1+2+1+1+1+1바이트) + 새 필드 12바이트
    expect(transferredBytes(buffers)).toBe(10 + 12);
  });

  it("같은 버퍼는 한 번만, 공유 메모리는 넘기지 않는다", () => {
    const base = fakeResult(5);
    const shared = new ArrayBuffer(8);
    const corners = [new Int16Array(shared, 0, 2), new Int16Array(shared, 4, 2)];
    const sab = new Uint8Array(new SharedArrayBuffer(4));
    const withShared = { ...base.fields, river: sab };
    const fields: PlanetFields = withShared;
    const buffers = previewTransferables({ ...base, fields, corners });
    expect(buffers.filter((buffer) => buffer === shared)).toHaveLength(1);
    expect(buffers).not.toContain(sab.buffer);
    expect(new Set(buffers).size).toBe(buffers.length);
  });
});
