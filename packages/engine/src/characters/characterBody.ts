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
    list.pair(
      legL,
      legR,
      "taper",
      x,
      L / 2,
      0,
      w + 0.02,
      L,
      d + 0.02,
      look.legs === "piston" ? p.metal : p.secondary,
      {
        rx: HALF_TURN,
      },
    );
    if (look.legs === "skirt") skirt();
    return;
  }
  const legY0 = FOOT_H;
  const legH = L - legY0;
  const foot = (color: number, grow = 0): void =>
    list.pair(legL, legR, "box", x, FOOT_H / 2, 0.05, w + 0.03 + grow, FOOT_H, d + 0.12 + grow, color);
  // 허리·골반 이음매(다리와 몸통 사이가 자연스럽게 이어지게)
  list.group = GROUP.body;
  list.add("box", 0, L - 0.03, 0, f.torsoW * 0.9, 0.1, f.torsoD * 0.92, shadeColor(p.secondary, 0.85));
  switch (look.legs) {
    case "plain": {
      const split = L * 0.48;
      list.pair(legL, legR, "taper", x, (split + L) / 2, 0, w + 0.03, L - split, d + 0.03, p.secondary, {
        rx: HALF_TURN,
      });
      list.pair(
        legL,
        legR,
        "taper",
        x,
        (legY0 + split) / 2,
        0,
        w + 0.01,
        split - legY0 + 0.02,
        d + 0.01,
        shadeColor(p.secondary, 0.86),
      );
      foot(shadeColor(p.secondary, 0.58), 0.02);
      break;
    }
    case "boots": {
      const split = L * 0.48;
      const boot = shadeColor(p.accent, 0.72);
      list.pair(legL, legR, "taper", x, (split + L) / 2, 0, w + 0.03, L - split, d + 0.03, p.secondary, {
        rx: HALF_TURN,
      });
      list.pair(
        legL,
        legR,
        "taper",
        x,
        (legY0 + split) / 2,
        0,
        w + 0.06,
        split - legY0 + 0.02,
        d + 0.06,
        boot,
      );
      foot(shadeColor(boot, 0.78), 0.05);
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
      list.pair(legL, legR, "taper", x, legY0 + legH / 2, 0, w + 0.02, legH, d + 0.02, p.secondary, {
        rx: HALF_TURN,
      });
      list.pair(legL, legR, "taper", x, legY0 + L * 0.24, d / 2, w + 0.06, L * 0.46, 0.08, p.metal);
      foot(p.metalDark, 0.03);
      break;
    case "skirt":
      list.pair(legL, legR, "taper", x, legY0 + legH / 2, 0, w, legH, d, p.secondary, { rx: HALF_TURN });
      foot(shadeColor(p.secondary, 0.62), 0.02);
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
    else list.add("taper", 0, cy, 0, W * 1.06, T, D * 1.04, p.primary, { rx: HALF_TURN });
    return;
  }
  switch (look.torso) {
    case "tunic":
      list.add("taper", 0, cy, 0, W * 1.04, T, D * 1.04, p.primary, { rx: HALF_TURN });
      // 아랫단과 허리띠·깃
      list.add("taper", 0, L + 0.05, 0, W + 0.08, 0.14, D + 0.08, shadeColor(p.primary, 0.82));
      list.add("box", 0, L + T * 0.24, 0, W * 0.94, 0.07, D + 0.04, shadeColor(p.accent, 0.85));
      list.add("box", 0, L + T - 0.04, front * 0.6, W * 0.42, 0.08, D * 0.45, shadeColor(p.primary, 1.2));
      break;
    case "plate":
      list.add("taper", 0, cy, 0, W * 1.04, T, D * 1.02, p.primary, { rx: HALF_TURN });
      list.add("taper", 0, L + T * 0.68, front * 0.85, W * 0.9, T * 0.52, 0.1, p.metal, { rx: HALF_TURN });
      list.add("box", 0, L + T * 0.14, 0, W * 0.96, T * 0.24, D + 0.05, p.metalDark);
      list.add("box", 0, L + T * 0.88, 0, W * 1.08, 0.1, D + 0.04, p.accent);
      break;
    case "jacket":
      list.add("taper", 0, cy, 0, W * 1.06, T, D * 1.05, p.primary, { rx: HALF_TURN });
      list.add("box", 0, cy - 0.02, front, W * 0.22, T * 0.86, 0.04, shadeColor(p.primary, 1.32));
      list.add("box", 0, L + T - 0.04, 0, W * 0.78, 0.1, D + 0.08, p.accent);
      list.add("box", 0, L + 0.05, 0, W * 0.96, 0.07, D + 0.06, shadeColor(p.primary, 0.72));
      break;
    case "robe":
      drape(L * 0.3, 0.16, p.primary);
      // 어깨(팔이 붙는 자리)와 허리끈·앞 띠
      list.add("taper", 0, L + T - 0.1, 0, W * 1.06, 0.22, D * 1.04, p.primary, { rx: HALF_TURN });
      list.add("box", 0, L + T * 0.3, 0, W + 0.03, 0.08, D + 0.11, p.accent);
      list.add("box", 0, L + T * 0.62, front + 0.02, W * 0.26, T * 0.62, 0.04, p.accent);
      break;
    case "vest":
      list.add("taper", 0, cy, 0, W * 0.96, T, D * 0.96, shadeColor(p.secondary, 1.18), { rx: HALF_TURN });
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
      list.add("box", 0, L + 0.06, 0, W * 0.96, 0.07, D + 0.06, p.accent);
      break;
    case "core":
      list.add("taper", 0, cy, 0, W * 1.04, T, D * 1.02, p.primary, { rx: HALF_TURN });
      list.add("box", 0, L + T * 0.6, front, 0.27, 0.27, 0.05, p.metalDark);
      list.add("cyl", 0, L + T * 0.6, front + 0.03, 0.19, 0.07, 0.19, p.glow, {
        rx: Math.PI / 2,
        glow: true,
      });
      break;
    case "suit":
      list.add("taper", 0, cy, 0, W * 1.0, T, D * 0.98, p.primary, { rx: HALF_TURN });
      list.add("box", 0, L + T * 0.72, 0, W * 1.02, 0.08, D + 0.04, p.accent);
      list.add("box", 0, L + 0.05, 0, W * 0.96, 0.08, D + 0.04, shadeColor(p.primary, 0.7));
      list.add("box", 0, L + T * 0.45, front + 0.01, W * 0.22, T * 0.36, 0.04, p.metal);
      break;
    case "poncho":
      list.add("box", 0, L + T * 0.2, 0, W * 0.9, T * 0.4, D * 0.9, p.secondary);
      drape(L + T * 0.2, 0.32, p.primary);
      list.add("box", 0, L + T - 0.03, 0, W * 0.62, 0.09, D + 0.11, p.accent);
      list.add("box", 0, L + T * 0.22, 0, W + 0.3, 0.06, D + 0.32, p.accent);
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
    list.pair(
      armL,
      armR,
      "taper",
      x,
      cy,
      0,
      a + 0.02,
      h,
      d + 0.02,
      look.arms === "piston" ? p.metal : p.primary,
      {
        rx: HALF_TURN,
      },
    );
    return;
  }
  switch (look.arms) {
    case "plain": {
      const [uy, uh] = span(0, 0.44);
      const [ly, lh] = span(0.44, 0.84);
      const [hy, hh] = span(0.84, 1);
      list.pair(armL, armR, "taper", x, uy, 0, a + 0.04, uh, d + 0.04, p.primary, { rx: HALF_TURN });
      list.pair(armL, armR, "taper", x, ly, 0, a + 0.01, lh, d + 0.01, p.skin, { rx: HALF_TURN });
      list.pair(armL, armR, "box", x, hy, 0.01, a * 0.92, hh, d * 0.96, shadeColor(p.skin, 0.92));
      break;
    }
    case "sleeve": {
      const [uy, uh] = span(0, 0.72);
      const [cy, ch] = span(0.72, 0.84);
      const [hy, hh] = span(0.84, 1);
      list.pair(armL, armR, "taper", x, uy, 0, a + 0.04, uh, d + 0.04, p.primary, { rx: HALF_TURN });
      list.pair(armL, armR, "box", x, cy, 0, a + 0.05, ch, d + 0.05, p.accent);
      list.pair(armL, armR, "box", x, hy, 0.01, a * 0.92, hh, d * 0.94, p.skin);
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
      const [uy, uh] = span(0, 0.48);
      const [ly, lh] = span(0.48, 0.86);
      const [hy, hh] = span(0.86, 1.02);
      list.pair(armL, armR, "taper", x, uy, 0, a + 0.03, uh, d + 0.03, p.primary, { rx: HALF_TURN });
      list.pair(armL, armR, "taper", x, ly, 0, a + 0.08, lh, d + 0.08, p.metal);
      list.pair(armL, armR, "box", x, hy, 0.01, a + 0.05, hh, d + 0.05, p.metalDark);
      break;
    }
    case "claw": {
      const [uy, uh] = span(0, 0.5);
      const [ly, lh] = span(0.5, 0.78);
      const [cy, ch] = span(0.78, 1.08);
      list.pair(armL, armR, "taper", x, uy, 0, a + 0.03, uh, d + 0.03, p.primary, { rx: HALF_TURN });
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
