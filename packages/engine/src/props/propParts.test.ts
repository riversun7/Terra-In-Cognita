// 소품 부품 시험: 그림마다 모델이 지어지고, 부품·삼각형 수가 가시거리 표의 예산(모델 약 40삼각형) 근처이며, 같은 칸이면 같은 모습이다
import { MAP_PROP_ARTS, RETIRED_MAP_PROP_ARTS } from "@terra/shared";
import { describe, expect, it } from "vitest";
import { type ClutterKind, propLook } from "./propLook.ts";
import {
  PARTS,
  type Part,
  type PartSink,
  type ShapeContext,
  buildClutter,
  buildShape,
  buildUndergrowth,
  partGeometry,
} from "./propParts.ts";
import { Color } from "three";

/** 부품 하나의 삼각형 수 */
const TRIANGLES = new Map<Part, number>(
  PARTS.map((part) => {
    const geometry = partGeometry(part);
    const count = geometry.index ? geometry.index.count : geometry.getAttribute("position").count;
    geometry.dispose();
    return [part, count / 3];
  }),
);

function context(seed: number, snowy = false): ShapeContext {
  return {
    x: 10,
    y: 2,
    z: 20,
    size: 1,
    turn: 0.7,
    shade: 1,
    snowy,
    r: (k) => (((Math.sin((k + 1) * 12.9898 + seed * 78.233) * 43_758.5453) % 1) + 1) % 1,
    ground: () => 2,
  };
}

/** 지은 부품 목록(부품, 자리·크기·색 문자열) */
function record(build: (put: PartSink) => void): { parts: Part[]; text: string[] } {
  const parts: Part[] = [];
  const text: string[] = [];
  build((part, x, y, z, sx, sy, sz, yaw, tilt, color) => {
    parts.push(part);
    text.push([part, x, y, z, sx, sy, sz, yaw, tilt, color.getHexString()].join(","));
    expect([x, y, z, sx, sy, sz, yaw, tilt].every(Number.isFinite)).toBe(true);
    expect(sx > 0 && sy > 0 && sz > 0).toBe(true);
  });
  return { parts, text };
}

const triangles = (parts: readonly Part[]): number =>
  parts.reduce((sum, part) => sum + (TRIANGLES.get(part) ?? 0), 0);

describe("소품 부품", () => {
  it("부품은 여섯이고(그리기 호출 상한), 삼각형 수가 작다", () => {
    expect(PARTS.length).toBe(6);
    for (const part of PARTS) expect(TRIANGLES.get(part)).toBeLessThanOrEqual(36);
  });

  it("그림마다 모델이 지어지고 부품 1~8개, 삼각형 90개 이하(변형·눈 덮인 것까지)", () => {
    let total = 0;
    let models = 0;
    for (let code = 1; code < MAP_PROP_ARTS.length; code++) {
      const name = MAP_PROP_ARTS[code];
      // 지운 그림은 겉모습이 없다(propLook.test.ts가 본다)
      if (name !== undefined && RETIRED_MAP_PROP_ARTS.includes(name)) continue;
      const look = propLook(code);
      expect(look, name).toBeDefined();
      if (!look) continue;
      for (let seed = 0; seed < 12; seed++) {
        const { parts } = record((put) => buildShape(put, look, context(seed, seed % 3 === 0)));
        expect(parts.length, `${MAP_PROP_ARTS[code]} ${seed}`).toBeGreaterThan(0);
        expect(parts.length).toBeLessThanOrEqual(8);
        expect(triangles(parts), `${MAP_PROP_ARTS[code]} ${seed}`).toBeLessThanOrEqual(90);
        total += triangles(parts);
        models += 1;
      }
    }
    // 평균은 가시거리 표의 "모델 약 40삼각형" 근처
    expect(total / models).toBeLessThanOrEqual(45);
  });

  it("같은 칸 해시면 같은 모습, 다른 해시면 변형이 생긴다(나무 모양 셋)", () => {
    const tree = propLook(MAP_PROP_ARTS.indexOf("tree_broadleaf"));
    if (!tree) throw new Error("no look");
    const a = record((put) => buildShape(put, tree, context(3)));
    const b = record((put) => buildShape(put, tree, context(3)));
    expect(a.text).toEqual(b.text);
    const shapes = new Set<string>();
    for (let seed = 0; seed < 40; seed++)
      shapes.add(
        record((put) => buildShape(put, tree, context(seed)))
          .text.map((entry) => `${entry.split(",")[0]}:${entry.split(",")[9]}`)
          .slice(0, 1)
          .concat(record((put) => buildShape(put, tree, context(seed))).parts.join("+"))
          .join("|"),
      );
    expect(shapes.size).toBeGreaterThanOrEqual(3);
  });

  it("눈 지표면 침엽수·바위에 흰 색이 얹힌다", () => {
    const conifer = propLook(MAP_PROP_ARTS.indexOf("tree_conifer"));
    if (!conifer) throw new Error("no look");
    const snowy = record((put) => buildShape(put, conifer, context(1, true))).text.join(";");
    const plain = record((put) => buildShape(put, conifer, context(1, false))).text.join(";");
    expect(snowy).not.toBe(plain);
  });

  it("땅 잔소품·숲 아래 덤불은 부품 4개·삼각형 24개 이하(작게, 많이)", () => {
    const kinds: ClutterKind[] = [
      "tuft",
      "sedge",
      "pebbles",
      "shell",
      "snowLump",
      "iceShard",
      "cattail",
      "blossom",
    ];
    for (const kind of kinds) {
      for (let seed = 0; seed < 6; seed++) {
        const { parts } = record((put) => buildClutter(put, kind, context(seed)));
        expect(parts.length, kind).toBeGreaterThan(0);
        expect(parts.length).toBeLessThanOrEqual(4);
        expect(triangles(parts), kind).toBeLessThanOrEqual(24);
      }
    }
    for (let seed = 0; seed < 6; seed++) {
      const { parts } = record((put) => buildUndergrowth(put, context(seed), new Color(0.3, 0.5, 0.3)));
      expect(parts.length).toBeGreaterThan(0);
      expect(triangles(parts)).toBeLessThanOrEqual(24);
    }
  });
});
