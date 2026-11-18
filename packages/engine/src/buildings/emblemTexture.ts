// 국가 깃발·배너 문양 텍스처(three CanvasTexture) — docs/adr/2026-11-10-nation-editor.md, @terra/shared/nationEmblem.
// - 만든 마크(spec·color)는 Canvas 2D Path2D로 즉시 그린다(비동기 기다림 없음).
// - 사용자가 올린 그림(uploaded sha256)이 있으면 /api/nation-emblems/<hash>.png를 비동기로 받아 덮어쓴다.
import { type NationEmblemView, nationEmblemUrl } from "@terra/shared/nationEditor";
import { emblemColors, emblemParts } from "@terra/shared/nationEmblem";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

export type EmblemKind = "flag" | "banner";

const TRANSLATE_RE = /translate\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/g;
const SCALE_RE = /scale\(\s*([-\d.]+)\s*\)/;

function drawEmblemVector(
  ctx: CanvasRenderingContext2D,
  emblem: NationEmblemView,
  boxX: number,
  boxY: number,
  boxSize: number,
): void {
  const parts = emblemParts(emblem.spec, emblem.color);
  const scale = boxSize / 100;
  ctx.save();
  ctx.translate(boxX, boxY);
  ctx.scale(scale, scale);

  const shapePath = new Path2D(parts.shape);
  ctx.save();
  ctx.clip(shapePath);
  for (const layer of parts.layers) {
    ctx.save();
    if (layer.transform) {
      // emblemParts는 "translate(cx cy) scale(s) translate(-50 -50)" 차례만 쓴다
      const tokens = layer.transform.split(/\)\s*/).filter(Boolean);
      for (const token of tokens) {
        const text = `${token})`;
        TRANSLATE_RE.lastIndex = 0;
        const tr = TRANSLATE_RE.exec(text);
        if (tr) {
          ctx.translate(Number(tr[1]), Number(tr[2]));
          continue;
        }
        const sc = SCALE_RE.exec(text);
        if (sc) {
          const factor = Number(sc[1]);
          ctx.scale(factor, factor);
        }
      }
    }
    const layerPath = new Path2D(layer.d);
    ctx.fillStyle = layer.fill;
    const fillPath = ctx.fill.bind(ctx);
    fillPath(layerPath, layer.evenodd ? "evenodd" : "nonzero");
    ctx.restore();
  }
  ctx.restore();

  ctx.strokeStyle = parts.outline;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.stroke(shapePath);
  ctx.restore();
}

function paintCloth(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  emblem: NationEmblemView,
  kind: EmblemKind,
): { boxX: number; boxY: number; boxSize: number } {
  const colors = emblemColors(emblem.color, emblem.spec.scheme);
  // 깃발·배너 바탕은 국가 시그니처 컬러를 그대로 쓰고, 위아래(또는 둘레) 테두리만 어울리는 색으로 가른다
  ctx.fillStyle = emblem.color;
  ctx.fillRect(0, 0, w, h);

  if (kind === "flag") {
    const stripe = Math.round(h * 0.1);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(0, 0, w, stripe);
    ctx.fillRect(0, h - stripe, w, stripe);
    const boxSize = Math.round(h * 0.72);
    return { boxX: Math.round((w - boxSize) / 2), boxY: Math.round((h - boxSize) / 2), boxSize };
  }

  const border = Math.round(w * 0.06);
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = border;
  ctx.strokeRect(border / 2, border / 2, w - border, h - border);
  const boxSize = Math.round(w * 0.76);
  return { boxX: Math.round((w - boxSize) / 2), boxY: Math.round((h - boxSize) / 2), boxSize };
}

export function emblemTextureKey(emblem: NationEmblemView, kind: EmblemKind): string {
  const { shape, division, charge, scheme } = emblem.spec;
  return `${kind}:${emblem.color}:${shape}:${division}:${charge}:${String(scheme)}:${emblem.uploaded ?? ""}`;
}

export class EmblemTextureCache {
  private readonly textures = new Map<string, CanvasTexture>();

  get(emblem: NationEmblemView, kind: EmblemKind): CanvasTexture | null {
    if (typeof document === "undefined" || typeof Path2D === "undefined") return null;
    const key = emblemTextureKey(emblem, kind);
    const existing = this.textures.get(key);
    if (existing) return existing;

    const w = kind === "flag" ? 256 : 192;
    const h = kind === "flag" ? 160 : 192;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const box = paintCloth(ctx, w, h, emblem, kind);
    drawEmblemVector(ctx, emblem, box.boxX, box.boxY, box.boxSize);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;
    this.textures.set(key, texture);

    if (emblem.uploaded && typeof Image !== "undefined") {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.addEventListener(
        "load",
        () => {
          if (this.textures.get(key) !== texture) return;
          const nextBox = paintCloth(ctx, w, h, emblem, kind);
          ctx.drawImage(img, nextBox.boxX, nextBox.boxY, nextBox.boxSize, nextBox.boxSize);
          texture.needsUpdate = true;
        },
        { once: true },
      );
      img.src = nationEmblemUrl(emblem.uploaded);
    }

    return texture;
  }

  dispose(): void {
    for (const texture of this.textures.values()) texture.dispose();
    this.textures.clear();
  }
}
