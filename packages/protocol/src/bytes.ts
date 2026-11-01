// 바이트 도우미 — UTF-8·base64를 전역(TextEncoder·btoa 등) 없이 한다. 이 꾸러미는 DOM·Node 타입을 쓰지 않는다
// (기기·서버·sim 시험이 같이 읽는다). 전투 리플레이 형식(battleReplayCodec.ts)이 쓴다.
import { ProtocolError } from "./errors.ts";

/** 글자 → UTF-8 바이트(짝 없는 대리 문자는 U+FFFD) */
export function utf8Encode(text: string): Uint8Array {
  const out: number[] = [];
  for (const char of text) {
    let code = char.codePointAt(0) ?? 0xfffd;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x1_0000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      out.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63),
        0x80 | (code & 63),
      );
  }
  return Uint8Array.from(out);
}

/** UTF-8 바이트 → 글자. 틀린 바이트(넘친 길이·짧은 꼬리·대리 문자)는 ProtocolError */
export function utf8Decode(bytes: Uint8Array): string {
  let text = "";
  let i = 0;
  const tail = (): number => {
    const byte = bytes[i++];
    if (byte === undefined || (byte & 0xc0) !== 0x80) throw new ProtocolError("text is not UTF-8");
    return byte & 63;
  };
  while (i < bytes.length) {
    const first = bytes[i++] ?? 0;
    let code: number;
    if (first < 0x80) code = first;
    else if (first >= 0xc2 && first < 0xe0) code = ((first & 31) << 6) | tail();
    else if (first >= 0xe0 && first < 0xf0) {
      code = ((first & 15) << 12) | (tail() << 6) | tail();
      if (code < 0x800 || (code >= 0xd800 && code <= 0xdfff)) throw new ProtocolError("text is not UTF-8");
    } else if (first >= 0xf0 && first < 0xf5) {
      code = ((first & 7) << 18) | (tail() << 12) | (tail() << 6) | tail();
      if (code < 0x1_0000 || code > 0x10_ffff) throw new ProtocolError("text is not UTF-8");
    } else throw new ProtocolError("text is not UTF-8");
    text += String.fromCodePoint(code);
  }
  return text;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Map(ALPHABET.split("").map((char, index) => [char, index]));

export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triple = (a << 16) | (b << 8) | c;
    parts.push(
      (ALPHABET[(triple >> 18) & 63] ?? "") +
        (ALPHABET[(triple >> 12) & 63] ?? "") +
        (i + 1 < bytes.length ? (ALPHABET[(triple >> 6) & 63] ?? "") : "=") +
        (i + 2 < bytes.length ? (ALPHABET[triple & 63] ?? "") : "="),
    );
  }
  return parts.join("");
}

export function base64ToBytes(text: string): Uint8Array {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new ProtocolError("not base64");
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - padding);
  let at = 0;
  for (let i = 0; i < text.length; i += 4) {
    let triple = 0;
    for (let j = 0; j < 4; j++) triple = (triple << 6) | (LOOKUP.get(text[i + j] ?? "=") ?? 0);
    for (const shift of [16, 8, 0]) if (at < out.length) out[at++] = (triple >> shift) & 255;
  }
  return out;
}
