// 원자재 오브젝트 자리 굴림 — objects.ts(소품·바위·밭·노두)와 terrainObjects.ts(지형별 오브젝트·어군)가 같이 쓴다. 정수 연산만(판정 코드 규칙).
import { mix32 } from "@terra/sim";

/** (2차맵 키, 묶음, 종류)의 32비트 굴림(0 ~ 2^32 − 1). 천분율 굴림 blockRoll = 이 값 % 1000 */
export function blockHash(mapKey: number, block: number, kind: number): number {
  const low = mapKey % 0x1_0000_0000;
  const high = Math.floor(mapKey / 0x1_0000_0000);
  const seed = mix32(mix32(low >>> 0) ^ Math.imul(high >>> 0, 0x85eb_ca6b) ^ 0x4f1b_bcdd);
  return mix32(seed ^ Math.imul(block + 1, 0x9e37_79b1) ^ Math.imul(kind + 1, 0xc2b2_ae35)) >>> 0;
}
