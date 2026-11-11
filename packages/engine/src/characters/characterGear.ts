// 캐릭터 장식(등 장식·덧장식·겉 장갑) 조각 — 순수 코드. docs/adr/2026-11-11-character-3d.md 2절.
// 등·덧장식은 몸 묶음(걷기 때 흔들리지 않는다). 겉 장갑의 관절 덮개는 팔·다리 묶음, 턱 덮개는 머리 묶음이다.
// 먼 단계(lod 1)는 등 장식의 큰 덩어리 하나만 남기고 덧장식·겉 장갑은 그리지 않는다.
import type { PartContext } from "./characterFrame.ts";
import { headBox } from "./characterHead.ts";
import { GROUP, shadeColor } from "./characterParts.ts";

const QUARTER_TURN = Math.PI / 2;

export function addBack(c: PartContext): void {
  const { list, f, p, look, lod } = c;
  if (look.back === "none") return;
  const L = f.legH;
  const T = f.torsoH;
  const W = f.torsoW;
  const zb = -f.torsoD / 2;
  const { body } = GROUP;
  list.group = body;
  const midY = L + T * 0.55;
  const capeLen = T + L * 0.55;
  const cape = (): void =>
    list.add("box", 0, L + T - capeLen / 2 - 0.02, zb - 0.07, W + 0.1, capeLen, 0.05, p.accent, { rx: 0.14 });
  if (lod === 1) {
    switch (look.back) {
      case "pack":
        list.add("box", 0, midY, zb - 0.1, W * 0.7, T * 0.66, 0.2, shadeColor(p.accent, 0.8));
        break;
      case "tank":
        list.add("box", 0, midY, zb - 0.1, 0.4, T * 0.7, 0.17, p.metal);
        break;
      case "cape":
        cape();
        break;
      case "wings":
        list.add("box", 0, L + T * 0.75, zb - 0.08, W + 0.5, 0.36, 0.04, p.accent);
        break;
      case "array":
        list.add("box", 0, L + T + 0.05, zb - 0.08, 0.3, 0.5, 0.06, p.metalDark);
        break;
      case "shield":
        list.add("box", 0, midY, zb - 0.07, 0.4, 0.4, 0.06, p.metal, { rz: Math.PI / 4 });
        break;
      case "jet":
        list.add("box", 0, L + T * 0.5, zb - 0.09, 0.4, 0.42, 0.16, p.metalDark);
        break;
      default: {
        const unknown: never = look.back;
        return unknown;
      }
    }
    return;
  }
  switch (look.back) {
    case "pack": {
      const bag = shadeColor(p.accent, 0.8);
      list.add("box", 0, midY, zb - 0.1, W * 0.7, T * 0.66, 0.2, bag);
      list.add("box", 0, midY + T * 0.3, zb - 0.1, W * 0.72, 0.1, 0.22, p.accent);
      // 멜빵(앞)
      list.pair(
        body,
        body,
        "box",
        W * 0.28,
        L + T * 0.6,
        f.torsoD / 2 + 0.012,
        0.05,
        T * 0.72,
        0.03,
        shadeColor(p.accent, 0.6),
      );
      break;
    }
    case "tank":
      list.pair(body, body, "cyl", 0.11, midY, zb - 0.1, 0.17, T * 0.7, 0.17, p.metal);
      list.add("box", 0, midY, zb - 0.05, 0.42, 0.08, 0.1, p.metalDark);
      break;
    case "cape":
      cape();
      list.add("box", 0, L + T - 0.02, zb - 0.03, W * 0.9, 0.08, 0.12, shadeColor(p.accent, 0.8));
      break;
    case "wings":
      list.add("box", 0, L + T * 0.7, zb - 0.05, 0.18, 0.2, 0.1, p.metalDark);
      list.pair(body, body, "box", 0.3, L + T * 0.82, zb - 0.1, 0.36, 0.5, 0.04, p.accent, {
        ry: 0.5,
        rz: -0.5,
      });
      break;
    case "array":
      list.add("box", 0, L + T * 0.7, zb - 0.05, 0.3, 0.2, 0.1, p.metalDark);
      list.pair(body, body, "box", 0.14, L + T + 0.1, zb - 0.08, 0.035, 0.56, 0.035, p.metal, { rz: -0.2 });
      list.pair(body, body, "box", 0.2, L + T + 0.39, zb - 0.08, 0.07, 0.07, 0.07, p.glow, { glow: true });
      break;
    case "shield":
      list.add("cyl", 0, midY, zb - 0.07, 0.5, 0.06, 0.5, p.metal, { rx: QUARTER_TURN });
      list.add("box", 0, midY, zb - 0.11, 0.14, 0.14, 0.05, p.accent);
      break;
    case "jet":
      list.add("box", 0, L + T * 0.62, zb - 0.08, 0.34, 0.3, 0.14, p.metalDark);
      list.pair(body, body, "cone", 0.13, L + T * 0.3, zb - 0.09, 0.15, 0.26, 0.15, p.metal);
      list.pair(body, body, "box", 0.13, L + T * 0.3 - 0.14, zb - 0.09, 0.08, 0.04, 0.08, p.glow, {
        glow: true,
      });
      break;
    default: {
      const unknown: never = look.back;
      return unknown;
    }
  }
}

export function addExtra(c: PartContext): void {
  const { list, f, p, look, lod } = c;
  if (look.extra === "none" || lod === 1) return;
  const L = f.legH;
  const T = f.torsoH;
  const W = f.torsoW;
  const D = f.torsoD;
  const front = D / 2;
  const { body } = GROUP;
  list.group = body;
  switch (look.extra) {
    case "scarf":
      list.add("box", 0, L + T + 0.01, 0, W * 0.7, 0.1, D + 0.12, p.accent);
      list.add("box", W * 0.18, L + T - 0.15, front + 0.04, 0.12, 0.3, 0.04, p.accent);
      break;
    case "pads":
      list.pair(
        body,
        body,
        "dome",
        f.shoulderX,
        f.shoulderY + 0.1,
        0,
        f.limb + 0.16,
        0.14,
        f.limb + 0.18,
        p.metal,
      );
      break;
    case "belt": {
      const strap = shadeColor(p.accent, 0.9);
      list.add("box", 0, L + 0.06, 0, W + 0.04, 0.08, D + 0.04, strap);
      list.pair(
        body,
        body,
        "box",
        W * 0.3,
        L + 0.02,
        front + 0.04,
        0.12,
        0.13,
        0.08,
        shadeColor(p.accent, 0.72),
      );
      break;
    }
    case "collar":
      list.add("box", 0, L + T + 0.02, 0, W * 0.62, 0.12, D + 0.06, p.metal);
      list.add("box", 0, L + T + 0.02, front + 0.04, 0.08, 0.06, 0.04, p.glow, { glow: true });
      break;
    case "badge":
      list.add("box", W * 0.2, L + T * 0.72, front + 0.015, 0.16, 0.16, 0.03, p.metalDark);
      list.add("box", W * 0.2, L + T * 0.72, front + 0.03, 0.1, 0.1, 0.03, p.glow, { glow: true });
      break;
    case "sash":
      list.add("box", 0, L + T * 0.52, 0, W * 1.22, 0.1, D + 0.05, p.accent, { rz: 0.6 });
      list.add("box", -W * 0.4, L + T * 0.16, front * 0.6, 0.12, 0.12, 0.1, shadeColor(p.accent, 0.8));
      break;
    case "lamp":
      list.add("box", -f.shoulderX + 0.02, f.shoulderY + 0.14, 0, 0.1, 0.12, 0.1, p.metalDark);
      list.add("box", -f.shoulderX + 0.02, f.shoulderY + 0.15, 0.08, 0.09, 0.09, 0.08, p.glow, {
        glow: true,
      });
      break;
    default: {
      const unknown: never = look.extra;
      return unknown;
    }
  }
}

/** 겉 장갑: 1 = 관절 덮개(무릎·팔꿈치), 2 = + 턱 덮개·가슴 판, 3 = + 허벅지 판·등뼈 */
export function addPlating(c: PartContext): void {
  const { list, f, p, look, lod } = c;
  if (look.plating <= 0 || lod === 1) return;
  const L = f.legH;
  const T = f.torsoH;
  const { armL, armR, legL, legR, body, head } = GROUP;
  const a = f.limb;
  const elbowY = f.shoulderY + 0.07 - f.armH * 0.48;
  list.pair(legL, legR, "box", f.hipX, L * 0.5, 0.01, a + 0.1, 0.1, a + 0.13, p.metalDark);
  list.pair(armL, armR, "box", f.shoulderX, elbowY, 0, a + 0.07, 0.09, a + 0.09, p.metalDark);
  if (look.plating < 2) return;
  const b = headBox(look, f);
  list.group = head;
  list.add("box", 0, b.y0 + b.h * 0.08, 0.02, b.w * 0.7, b.h * 0.16, b.d * 0.72, p.metal);
  list.group = body;
  list.add("box", 0, L + T * 0.36, f.torsoD / 2 + 0.01, f.torsoW * 0.34, T * 0.36, 0.05, p.metal);
  if (look.plating < 3) return;
  list.pair(legL, legR, "box", f.hipX, L * 0.78, 0, a + 0.11, L * 0.26, a + 0.14, p.metal);
  list.add("box", 0, L + T * 0.5, -f.torsoD / 2 - 0.02, 0.12, T * 0.8, 0.07, p.metalDark);
}
