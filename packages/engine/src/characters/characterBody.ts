// 캐릭터 몸(다리·몸통·팔) 조각 — 순수 코드. docs/adr/2026-11-11-character-3d.md 2절.
// 다리·팔 조각은 그 묶음(legL·legR·armL·armR)에 넣어 걷기 때 함께 흔들린다. 치마·옷자락은 몸 묶음이다(흔들리지 않는다).
import type { PartContext } from "./characterFrame.ts";
import { GROUP, shadeColor } from "./characterParts.ts";

/** 발 높이(m) */
const FOOT_H = 0.09;
const HALF_TURN = Math.PI;

export function addLegs(c: PartContext): void {
  const { list, f, p, look, lod } = c;
  const L = f.legH;
  const w = f.limb + 0.03;
  const d = f.limb + 0.06;
  const x = f.hipX;
  const { legL, legR } = GROUP;
  const skirt = (): void => {
    // 치마: 아래가 넓은 사다리꼴(무릎 위 ~ 허리)
    const y0 = L * 0.34;
    const h = L + 0.05 - y0;
    list.add("taper", 0, y0 + h / 2, 0, f.torsoW + 0.2, h, f.torsoD + 0.22, shadeColor(p.primary, 0.88));
  };
  if (lod === 1) {
    list.pair(legL, legR, "box", x, L / 2, 0, w, L, d, look.legs === "piston" ? p.metal : p.secondary);
    if (look.legs === "skirt") skirt();
    return;
  }
  const legY0 = FOOT_H;
  const legH = L - legY0;
  const foot = (color: number, grow = 0): void =>
    list.pair(legL, legR, "box", x, FOOT_H / 2, 0.05, w + 0.03 + grow, FOOT_H, d + 0.12 + grow, color);
  switch (look.legs) {
    case "plain":
      list.pair(legL, legR, "box", x, legY0 + legH / 2, 0, w, legH, d, p.secondary);
      foot(shadeColor(p.secondary, 0.62));
      break;
    case "boots": {
      const split = L * 0.46;
      const boot = shadeColor(p.accent, 0.72);
      list.pair(legL, legR, "box", x, (split + L) / 2, 0, w, L - split, d, p.secondary);
      list.pair(legL, legR, "box", x, (legY0 + split) / 2, 0, w + 0.05, split - legY0 + 0.02, d + 0.05, boot);
      foot(boot, 0.04);
      break;
    }
    case "piston": {
      const split = L * 0.52;
      list.pair(legL, legR, "cyl", x, (split + L) / 2, 0, w * 0.6, L - split, w * 0.6, p.metalDark);
      list.pair(legL, legR, "box", x, (legY0 + split) / 2, 0, w + 0.03, split - legY0, d + 0.02, p.metal);
      foot(p.metalDark, 0.02);
      break;
    }
    case "greaves":
      list.pair(legL, legR, "box", x, legY0 + legH / 2, 0, w, legH, d, p.secondary);
      list.pair(legL, legR, "taper", x, legY0 + L * 0.24, d / 2, w + 0.05, L * 0.46, 0.07, p.metal);
      foot(p.metalDark, 0.02);
      break;
    case "skirt":
      list.pair(legL, legR, "box", x, legY0 + legH / 2, 0, w, legH, d, p.secondary);
      foot(shadeColor(p.secondary, 0.62));
      skirt();
      break;
    default: {
      const unknown: never = look.legs;
      return unknown;
    }
  }
}

export function addTorso(c: PartContext): void {
  const { list, f, p, look, lod } = c;
  const L = f.legH;
  const T = f.torsoH;
  const W = f.torsoW;
  const D = f.torsoD;
  const cy = L + T / 2;
  const front = D / 2;
  list.group = GROUP.body;
  /** 옷자락이 길게 내려오는 사다리꼴(로브·판초): y0에서 어깨까지 */
  const drape = (y0: number, grow: number, color: number): void => {
    const h = L + T + 0.02 - y0;
    list.add("taper", 0, y0 + h / 2, 0, W + grow, h, D + grow + 0.02, color);
  };
  if (lod === 1) {
    if (look.torso === "robe") drape(L * 0.3, 0.16, p.primary);
    else if (look.torso === "poncho") drape(L + T * 0.2, 0.32, p.primary);
    else list.add("box", 0, cy, 0, W, T, D, p.primary);
    return;
  }
  switch (look.torso) {
    case "tunic":
      list.add("box", 0, cy, 0, W, T, D, p.primary);
      // 아랫단
      list.add("box", 0, L + 0.03, 0, W + 0.06, 0.12, D + 0.06, shadeColor(p.primary, 0.82));
      break;
    case "plate":
      list.add("box", 0, cy, 0, W, T, D, p.primary);
      list.add("box", 0, L + T * 0.68, front, W * 0.82, T * 0.5, 0.07, p.metal);
      list.add("box", 0, L + T * 0.14, 0, W * 0.94, T * 0.24, D + 0.04, p.metalDark);
      break;
    case "jacket":
      list.add("box", 0, cy, 0, W, T, D, p.primary);
      list.add("box", 0, cy - 0.02, front, W * 0.2, T * 0.86, 0.03, shadeColor(p.primary, 1.3));
      list.add("box", 0, L + T - 0.04, 0, W * 0.72, 0.09, D + 0.07, p.accent);
      break;
    case "robe":
      drape(L * 0.3, 0.16, p.primary);
      // 어깨(팔이 붙는 자리)와 허리끈
      list.add("box", 0, L + T - 0.09, 0, W, 0.18, D, p.primary);
      list.add("box", 0, L + T * 0.3, 0, W + 0.02, 0.07, D + 0.1, p.accent);
      break;
    case "vest":
      list.add("box", 0, cy, 0, W * 0.96, T, D * 0.96, shadeColor(p.secondary, 1.18));
      list.pair(
        GROUP.body,
        GROUP.body,
        "box",
        W * 0.31,
        cy + 0.02,
        0,
        W * 0.36,
        T * 0.9,
        D + 0.05,
        p.primary,
      );
      break;
    case "core":
      list.add("box", 0, cy, 0, W, T, D, p.primary);
      list.add("box", 0, L + T * 0.6, front, 0.27, 0.27, 0.05, p.metalDark);
      list.add("cyl", 0, L + T * 0.6, front + 0.03, 0.19, 0.07, 0.19, p.glow, {
        rx: Math.PI / 2,
        glow: true,
      });
      break;
    case "suit":
      list.add("box", 0, cy, 0, W * 0.94, T, D * 0.94, p.primary);
      list.add("box", 0, L + T * 0.7, 0, W * 0.96, 0.07, D * 0.98, p.accent);
      list.add("box", 0, L + 0.04, 0, W * 0.96, 0.07, D * 0.98, shadeColor(p.primary, 0.7));
      break;
    case "poncho":
      list.add("box", 0, L + T * 0.2, 0, W * 0.9, T * 0.4, D * 0.9, p.secondary);
      drape(L + T * 0.2, 0.32, p.primary);
      list.add("box", 0, L + T - 0.03, 0, W * 0.6, 0.08, D + 0.1, p.accent);
      break;
    default: {
      const unknown: never = look.torso;
      return unknown;
    }
  }
}

export function addArms(c: PartContext): void {
  const { list, f, p, look, lod } = c;
  const { armL, armR } = GROUP;
  const x = f.shoulderX;
  const a = f.limb;
  const d = a + 0.02;
  const top = f.shoulderY + 0.07;
  const len = f.armH;
  /** 위에서 from ~ to(0~1) 구간의 가운데 y와 길이 */
  const span = (from: number, to: number): readonly [number, number] => [
    top - (len * (from + to)) / 2,
    len * (to - from),
  ];
  if (lod === 1) {
    const [cy, h] = span(0, 1);
    list.pair(armL, armR, "box", x, cy, 0, a, h, d, look.arms === "piston" ? p.metal : p.primary);
    return;
  }
  switch (look.arms) {
    case "plain": {
      const [uy, uh] = span(0, 0.45);
      const [ly, lh] = span(0.45, 1);
      list.pair(armL, armR, "box", x, uy, 0, a + 0.02, uh, d + 0.02, p.primary);
      list.pair(armL, armR, "box", x, ly, 0, a, lh, d, p.skin);
      break;
    }
    case "sleeve": {
      const [uy, uh] = span(0, 0.82);
      const [ly, lh] = span(0.82, 1);
      list.pair(armL, armR, "box", x, uy, 0, a + 0.03, uh, d + 0.03, p.primary);
      list.pair(armL, armR, "box", x, ly, 0, a, lh, d, p.skin);
      break;
    }
    case "piston": {
      const [uy, uh] = span(0, 0.46);
      const [ly, lh] = span(0.46, 1);
      list.pair(armL, armR, "cyl", x, uy, 0, a * 0.62, uh, a * 0.62, p.metalDark);
      list.pair(armL, armR, "box", x, ly, 0, a + 0.04, lh, d + 0.04, p.metal);
      break;
    }
    case "gauntlet": {
      const [uy, uh] = span(0, 0.5);
      const [ly, lh] = span(0.5, 1);
      list.pair(armL, armR, "box", x, uy, 0, a + 0.02, uh, d + 0.02, p.primary);
      list.pair(armL, armR, "box", x, ly, 0, a + 0.07, lh, d + 0.07, p.metal);
      break;
    }
    case "claw": {
      const [uy, uh] = span(0, 0.5);
      const [ly, lh] = span(0.5, 0.78);
      const [cy, ch] = span(0.78, 1.08);
      list.pair(armL, armR, "box", x, uy, 0, a + 0.02, uh, d + 0.02, p.primary);
      list.pair(armL, armR, "box", x, ly, 0, a + 0.05, lh, d + 0.05, p.metalDark);
      // 집게: 아래를 보는 쐐기
      list.pair(armL, armR, "wedge", x, cy, 0, a + 0.03, ch, d, p.accent, { rx: HALF_TURN });
      break;
    }
    default: {
      const unknown: never = look.arms;
      return unknown;
    }
  }
}
