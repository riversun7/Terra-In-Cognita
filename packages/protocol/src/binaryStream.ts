// 가변 길이 정수 바이트 흐름 — 전투 리플레이 이진 형식(battleReplayCodec.ts)의 쓰기·읽기 도구. docs/adr/2026-11-01-battle-replay.md 2절.
// 부호 없는 값은 7비트씩(LEB128, 2^53 미만), 부호 있는 값은 지그재그 뒤 같은 방식, 글자는 UTF-8(길이 + 바이트).
// 쓰기는 범위 밖 값을 RangeError로, 읽기는 틀린 바이트를 ProtocolError로 거절한다. 전역(TextEncoder 등)을 쓰지 않는다.
import type { Facing } from "./battleReplay.ts";
import { utf8Decode, utf8Encode } from "./bytes.ts";
import { ProtocolError } from "./errors.ts";

/** 지그재그로 담을 수 있는 크기(2^52 − 1) */
const MAX_SIGNED = 2 ** 52 - 1;
/** 한 리플레이의 표·목록 길이 상한(읽기 보호) */
const MAX_COUNT = 1 << 24;

export class Writer {
  private buffer = new Uint8Array(4096);
  private length = 0;

  private ensure(extra: number): void {
    if (this.length + extra <= this.buffer.length) return;
    const next = new Uint8Array(Math.max(this.buffer.length * 2, this.length + extra));
    next.set(this.buffer.subarray(0, this.length));
    this.buffer = next;
  }

  u8(value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new RangeError(`u8 out of range: ${value}`);
    this.ensure(1);
    this.buffer[this.length++] = value;
  }

  uvar(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`uvar out of range: ${value}`);
    this.ensure(8);
    let rest = value;
    while (rest >= 128) {
      this.buffer[this.length++] = (rest % 128) + 128;
      rest = Math.floor(rest / 128);
    }
    this.buffer[this.length++] = rest;
  }

  svar(value: number): void {
    if (!Number.isSafeInteger(value) || Math.abs(value) > MAX_SIGNED)
      throw new RangeError(`svar out of range: ${value}`);
    this.uvar(value >= 0 ? value * 2 : -value * 2 - 1);
  }

  str(value: string): void {
    const bytes = utf8Encode(value);
    this.uvar(bytes.length);
    this.ensure(bytes.length);
    this.buffer.set(bytes, this.length);
    this.length += bytes.length;
  }

  bytes(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

export class Reader {
  private pos = 0;
  private readonly data: Uint8Array;
  constructor(data: Uint8Array) {
    this.data = data;
  }

  get done(): boolean {
    return this.pos === this.data.length;
  }

  u8(): number {
    if (this.pos >= this.data.length) throw new ProtocolError("battle replay truncated");
    return this.data[this.pos++] ?? 0;
  }

  uvar(): number {
    let result = 0;
    let scale = 1;
    for (let i = 0; i < 8; i++) {
      const byte = this.u8();
      result += (byte % 128) * scale;
      if (byte < 128) {
        if (!Number.isSafeInteger(result)) throw new ProtocolError("battle replay number too large");
        return result;
      }
      scale *= 128;
    }
    throw new ProtocolError("battle replay number too long");
  }

  svar(): number {
    const raw = this.uvar();
    return raw % 2 === 0 ? raw / 2 : -(raw + 1) / 2;
  }

  count(): number {
    const value = this.uvar();
    if (value > MAX_COUNT) throw new ProtocolError("battle replay list too long");
    return value;
  }

  str(): string {
    const length = this.count();
    if (this.pos + length > this.data.length) throw new ProtocolError("battle replay truncated");
    const value = utf8Decode(this.data.subarray(this.pos, this.pos + length));
    this.pos += length;
    return value;
  }

  bool(): boolean {
    const value = this.u8();
    if (value > 1) throw new ProtocolError("battle replay flag out of range");
    return value === 1;
  }

  /** 목록의 번호(0 ≤ 값 < size). −1을 받으면 allowNone */
  index(size: number, allowNone = false): number {
    const value = allowNone ? this.svar() : this.uvar();
    if (value === -1 && allowNone) return -1;
    if (value < 0 || value >= size) throw new ProtocolError("battle replay index out of range");
    return value;
  }

  pick<T>(values: readonly T[]): T {
    const value = values[this.u8()];
    if (value === undefined) throw new ProtocolError("battle replay code out of range");
    return value;
  }

  facing(): Facing {
    const value = this.u8();
    if (value > 7) throw new ProtocolError("battle replay facing out of range");
    // 0~7을 확인했다
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return value as Facing;
  }
}

/** 층(한 변²)을 (값, 길이) 연속 길이로 */
export function writeLayer(w: Writer, layer: Uint8Array, cells: number): void {
  if (layer.length !== cells) throw new RangeError("arena layer must be size × size");
  const runs: [number, number][] = [];
  for (let i = 0; i < cells; i++) {
    const value = layer[i] ?? 0;
    const last = runs.at(-1);
    if (last && last[0] === value) last[1] += 1;
    else runs.push([value, 1]);
  }
  w.uvar(runs.length);
  for (const [value, length] of runs) {
    w.u8(value);
    w.uvar(length);
  }
}

export function readLayer(r: Reader, cells: number): Uint8Array {
  const layer = new Uint8Array(cells);
  const runs = r.count();
  let at = 0;
  for (let i = 0; i < runs; i++) {
    const value = r.u8();
    const length = r.uvar();
    if (length === 0 || at + length > cells) throw new ProtocolError("battle replay layer runs do not fit");
    layer.fill(value, at, at + length);
    at += length;
  }
  if (at !== cells) throw new ProtocolError("battle replay layer runs do not fit");
  return layer;
}
