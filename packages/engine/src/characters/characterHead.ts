// 캐릭터 머리(머리 모양·얼굴·머리카락·머리 장비) 조각 — 순수 코드. docs/adr/2026-11-11-character-3d.md 2절.
// 모두 머리 묶음이다. 얼굴은 머리 앞면(+z)에 붙고, 머리카락·장비는 머리 실제 크기(headBox)에 맞춘다.
import type { CharacterLook } from "@terra/shared/characterLook";
import type { CharacterFrame, PartContext } from "./characterFrame.ts";
import { GROUP, shadeColor } from "./characterParts.ts";

const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;
/** 뿔 색(상아) */
const HORN = 0xf3ead2;

/** 머리 실제 크기: 폭·높이·두께와 얼굴이 붙는 앞면 z */
export interface HeadBox {
  readonly w: number;
  readonly h: number;
  readonly d: number;
  /** 머리 바닥·꼭대기 y */
  readonly y0: number;
  readonly y1: number;
}

/** 머리 모양마다 기본 크기에 곱하는 값(폭·높이·두께) */
const HEAD_SCALE: Readonly<Record<CharacterLook["head"], readonly [number, number, number]>> = {
  round: [1, 1, 1],
  block: [0.94, 0.94, 0.94],
  tall: [0.84, 1.12, 0.88],
  wide: [1.14, 0.88, 0.94],
  egg: [0.9, 1.12, 0.92],
  dome: [0.92, 1, 0.92],
  // 6각 기둥은 평평한 면이 앞을 보게 돌린다: 앞뒤 두께는 지름 × cos 30°
  hex: [1, 0.96, 0.87],
  jaw: [1, 1, 0.96],
};

export function headBox(look: CharacterLook, f: CharacterFrame): HeadBox {
  const [kw, kh, kd] = HEAD_SCALE[look.head];
  const h = f.headH * kh;
  return { w: f.headW * kw, h, d: f.headD * kd, y0: f.headY, y1: f.headY + h };
}

export function addHead(c: PartContext): void {
  const { list, f, p, look, lod } = c;
  const b = headBox(look, f);
  const cy = b.y0 + b.h / 2;
  list.group = GROUP.head;
  if (lod === 1) {
    const rounded =
      look.head === "round" || look.head === "egg" || look.head === "jaw" || look.head === "dome";
    list.add(rounded ? "taper" : "box", 0, cy, 0, b.w * 0.96, b.h, b.d * 0.96, p.skin);
    return;
  }
  // 목(머리와 몸통 이음매)
  list.add("taper", 0, b.y0 - 0.01, 0, b.w * 0.42, 0.11, b.d * 0.42, shadeColor(p.skin, 0.88));
  switch (look.head) {
    case "round":
    case "egg":
      list.add("ball", 0, cy, 0, b.w, b.h, b.d, p.skin);
      break;
    case "block":
    case "tall":
    case "wide":
      list.add("box", 0, cy, 0, b.w, b.h, b.d, p.skin);
      break;
    case "dome":
      list.add("box", 0, b.y0 + b.h * 0.28, 0, b.w, b.h * 0.56, b.d, p.skin);
      list.add("dome", 0, b.y0 + b.h * 0.78, 0, b.w, b.h * 0.44, b.d, p.skin);
      break;
    case "hex":
      list.add("cyl", 0, cy, 0, b.w, b.h, b.d / 0.87, p.skin, { ry: Math.PI / 6 });
      break;
    case "jaw":
      // 위가 넓고 턱이 좁다(사다리꼴을 뒤집는다)
      list.add("taper", 0, cy, 0, b.w, b.h, b.d, p.skin, { rx: HALF_TURN });
      break;
    default: {
      const unknown: never = look.head;
      return unknown;
    }
  }
}

export function addFace(c: PartContext): void {
  const { list, f, p, look, lod } = c;
  const b = headBox(look, f);
  const zf = b.d / 2;
  const eyeY = b.y0 + b.h * 0.55;
  const { head } = GROUP;
  list.group = head;
  /** 사이보그 눈은 빛난다(겉 장갑이 있으면), 아니면 짙은 눈 */
  const litEyes = look.plating > 0;
  const eyeColor = litEyes ? p.glow : p.ink;
  if (lod === 1) {
    if (look.face === "eyes")
      // 먼 단계에서도 두 눈이 갈려 보이게(한 줄 검은 막대처럼 보이지 않게)
      list.pair(head, head, "box", b.w * 0.2, eyeY, zf, b.w * 0.14, b.h * 0.16, 0.05, eyeColor, {
        glow: litEyes,
      });
    else if (look.face === "mask")
      list.add("box", 0, b.y0 + b.h * 0.26, zf, b.w * 0.9, b.h * 0.38, 0.06, p.accent);
    else list.add("box", 0, eyeY, zf, b.w * 0.7, b.h * 0.16, 0.05, p.glow, { glow: true });
    return;
  }
  const eyes = (w: number, h: number, color: number, glow: boolean): void =>
    list.pair(head, head, "box", b.w * 0.2, eyeY, zf, b.w * w, b.h * h, 0.06, color, { glow });
  switch (look.face) {
    case "visor":
      list.add("box", 0, eyeY, zf, b.w * 0.88, b.h * 0.28, 0.07, p.ink);
      list.add("box", 0, eyeY, zf + 0.015, b.w * 0.72, b.h * 0.1, 0.06, p.glow, { glow: true });
      break;
    case "eyes":
      eyes(0.14, 0.18, eyeColor, litEyes);
      // 눈썹(표정 입체감)
      list.pair(
        head,
        head,
        "box",
        b.w * 0.2,
        eyeY + b.h * 0.15,
        zf + 0.005,
        b.w * 0.18,
        b.h * 0.05,
        0.05,
        p.secondary,
      );
      break;
    case "mono":
      list.add("box", 0, eyeY, zf, b.w * 0.5, b.h * 0.4, 0.06, p.ink);
      list.add("cyl", 0, eyeY, zf + 0.02, b.w * 0.3, 0.07, b.w * 0.3, p.glow, {
        rx: QUARTER_TURN,
        glow: true,
      });
      break;
    case "grill":
      list.add("box", 0, b.y0 + b.h * 0.28, zf, b.w * 0.6, b.h * 0.26, 0.06, p.ink);
      eyes(0.15, 0.08, p.glow, true);
      break;
    case "goggles":
      list.add("box", 0, eyeY, 0, b.w + 0.03, b.h * 0.13, b.d + 0.03, p.accent);
      list.pair(head, head, "cyl", b.w * 0.2, eyeY, zf + 0.02, b.w * 0.3, 0.08, b.w * 0.3, p.glow, {
        rx: QUARTER_TURN,
        glow: true,
      });
      break;
    case "mask":
      list.add("box", 0, b.y0 + b.h * 0.24, zf - 0.02, b.w * 0.9, b.h * 0.38, 0.1, p.accent);
      eyes(0.13, 0.13, eyeColor, litEyes);
      break;
    case "screen":
      list.add("box", 0, b.y0 + b.h * 0.5, zf, b.w * 0.8, b.h * 0.62, 0.05, p.ink);
      eyes(0.12, 0.14, p.glow, true);
      list.add("box", 0, b.y0 + b.h * 0.32, zf + 0.01, b.w * 0.3, b.h * 0.05, 0.05, p.glow, { glow: true });
      break;
    case "slit":
      list.add("box", 0, eyeY, zf, b.w * 0.9, b.h * 0.14, 0.06, p.ink);
      list.add("box", 0, eyeY, zf + 0.01, b.w * 0.62, b.h * 0.05, 0.06, p.glow, { glow: true });
      break;
    default: {
      const unknown: never = look.face;
      return unknown;
    }
  }
}

export function addTop(c: PartContext): void {
  const { list, f, p, look, lod } = c;
  if (look.top === "none") return;
  const b = headBox(look, f);
  const { head } = GROUP;
  const hair = p.secondary;
  const back = -b.d / 2;
  list.group = head;
  /** 정수리 덮개(머리카락·모자의 윗부분): 머리보다 grow만큼 크고 위에서 part(0~1)만큼 덮는다 */
  const cap = (color: number, grow: number, part: number): void =>
    list.add("box", 0, b.y1 - (b.h * part) / 2 + 0.03, 0, b.w + grow, b.h * part, b.d + grow, color);
  /** 뒷머리 판 */
  const backPanel = (color: number, part: number, grow: number): void =>
    list.add("box", 0, b.y1 - (b.h * part) / 2, back - 0.01, b.w + grow, b.h * part, 0.09, color);
  /** 용마루가 앞뒤로 놓인 쐐기(볏·모히칸) */
  const fin = (color: number, height: number, thick: number, lift: number): void =>
    list.add("wedge", 0, b.y1 + lift + (b.h * height) / 2, 0, b.d * 0.92, b.h * height, thick, color, {
      ry: QUARTER_TURN,
    });
  if (lod === 1) {
    switch (look.top) {
      case "mohawk":
        fin(hair, 0.36, 0.14, 0);
        break;
      case "crest":
        fin(p.accent, 0.42, 0.1, 0.02);
        break;
      case "cap":
        cap(p.accent, 0.06, 0.3);
        break;
      case "helm":
        cap(p.metal, 0.08, 0.44);
        break;
      case "hood":
        list.add("box", 0, b.y1 - b.h * 0.24, -0.04, b.w + 0.1, b.h * 0.58, b.d + 0.1, p.primary);
        break;
      case "antenna":
        list.add("box", 0, b.y1 + 0.16, 0, 0.05, 0.32, 0.05, p.metal);
        break;
      case "horns":
        list.pair(head, head, "pyramid", b.w * 0.36, b.y1 + 0.1, 0, 0.14, 0.3, 0.14, HORN, { rz: -0.45 });
        break;
      default:
        cap(hair, 0.05, 0.3);
    }
    return;
  }
  switch (look.top) {
    case "short":
      cap(hair, 0.06, 0.32);
      backPanel(hair, 0.54, 0.06);
      // 옆머리·앞머리 볼륨
      list.pair(
        head,
        head,
        "box",
        b.w / 2 + 0.01,
        b.y1 - b.h * 0.24,
        -b.d * 0.05,
        0.06,
        b.h * 0.38,
        b.d * 0.62,
        hair,
      );
      break;
    case "bob":
      cap(hair, 0.05, 0.3);
      backPanel(hair, 0.78, 0.05);
      list.pair(
        head,
        head,
        "box",
        b.w / 2 + 0.01,
        b.y1 - b.h * 0.36,
        -b.d * 0.08,
        0.08,
        b.h * 0.66,
        b.d * 0.72,
        hair,
      );
      break;
    case "spiky":
      cap(hair, 0.05, 0.26);
      list.add("pyramid", 0, b.y1 + 0.13, 0, 0.24, 0.28, 0.26, hair);
      list.pair(head, head, "pyramid", b.w * 0.3, b.y1 + 0.1, -0.02, 0.2, 0.22, 0.22, hair, { rz: -0.4 });
      break;
    case "ponytail":
      cap(hair, 0.05, 0.3);
      backPanel(hair, 0.42, 0.05);
      list.add("box", 0, b.y1 - b.h * 0.52, back - 0.13, 0.13, b.h * 0.62, 0.13, hair, { rx: 0.35 });
      break;
    case "mohawk":
      fin(hair, 0.36, 0.14, 0);
      break;
    case "bun":
      cap(hair, 0.05, 0.3);
      list.add("ball", 0, b.y1 + 0.05, back * 0.6, 0.27, 0.27, 0.27, hair);
      break;
    case "cap":
      cap(p.accent, 0.06, 0.3);
      // 챙
      list.add("box", 0, b.y1 - b.h * 0.24, b.d / 2 + 0.1, b.w * 0.8, 0.04, 0.22, p.accent);
      break;
    case "helm":
      cap(p.metal, 0.08, 0.44);
      list.pair(
        head,
        head,
        "box",
        b.w / 2 + 0.02,
        b.y1 - b.h * 0.62,
        -b.d * 0.1,
        0.07,
        b.h * 0.5,
        b.d * 0.52,
        p.metal,
      );
      fin(p.accent, 0.2, 0.08, 0.02);
      break;
    case "hood":
      cap(p.primary, 0.1, 0.36);
      list.add("box", 0, b.y1 - b.h * 0.48, back - 0.03, b.w + 0.1, b.h * 0.92, 0.12, p.primary);
      list.pair(
        head,
        head,
        "box",
        b.w / 2 + 0.03,
        b.y1 - b.h * 0.48,
        -b.d * 0.08,
        0.08,
        b.h * 0.84,
        b.d * 0.76,
        p.primary,
      );
      break;
    case "antenna":
      list.add("box", 0, b.y1 + 0.03, 0, 0.14, 0.06, 0.14, p.metalDark);
      list.add("box", 0, b.y1 + 0.2, 0, 0.035, 0.3, 0.035, p.metal);
      list.add("box", 0, b.y1 + 0.38, 0, 0.08, 0.08, 0.08, p.glow, { glow: true });
      break;
    case "crest":
      list.add("box", 0, b.y1 + 0.02, 0, b.w * 0.4, 0.06, b.d * 0.9, p.metal);
      fin(p.accent, 0.42, 0.1, 0.04);
      break;
    case "horns":
      list.add("box", 0, b.y1 - b.h * 0.12, 0, b.w + 0.04, 0.07, b.d + 0.04, p.accent);
      list.pair(head, head, "cone", b.w * 0.36, b.y1 + 0.1, 0, 0.14, 0.32, 0.14, HORN, { rz: -0.45 });
      break;
    default: {
      const unknown: never = look.top;
      return unknown;
    }
  }
}
