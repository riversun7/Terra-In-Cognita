// 임시 앱 아이콘 만들기 — 고리 있는 행성 모양. 디자인 시스템 ADR 때 진짜 아이콘으로 바꾼다.
// 의존성 없이 PNG·ICO를 직접 쓴다(node:zlib). 결과는 apps/game/public/에 두고 git에 넣는다(ADR 2026-10-28-pwa-and-browser-baseline).
// 실행: node apps/game/scripts/placeholder-icons.mjs
import { writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";

const OUT_DIR = new URL("../public/", import.meta.url);
// 배경색 — vite.config.ts의 THEME_COLOR와 같다
const BACKGROUND = [11, 16, 32];
const PLANET_LIT = [111, 182, 255];
const PLANET_DARK = [22, 46, 112];
const RING = [230, 233, 242];
/** 한 픽셀을 SAMPLES×SAMPLES 점으로 나눠 평균한다(가장자리 부드럽게) */
const SAMPLES = 4;

const mix = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);
const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * 한 점(아이콘 중심 기준, 단위: 바깥 반지름 R=1)의 색. 아무것도 없으면 null.
 * 그리는 순서: 고리 뒤쪽 → 행성 → 고리 앞쪽(행성 위에서는 배경색 틈을 둔다)
 */
function markColor(x, y) {
  const planetRadius = 0.5;
  const ringBand = 0.12;
  const ringGap = 0.05;
  const ringA = 1 / (1 + ringBand);
  const ringB = ringA * 0.34;
  const tilt = (-18 * Math.PI) / 180;
  // 고리 좌표계로 돌린다
  const u = x * Math.cos(tilt) + y * Math.sin(tilt);
  const v = -x * Math.sin(tilt) + y * Math.cos(tilt);
  const ringDistance = Math.abs(Math.hypot(u / ringA, v / ringB) - 1);
  const front = v > 0;
  const inPlanet = x * x + y * y <= planetRadius * planetRadius;

  if (front && ringDistance <= ringBand) return RING;
  if (front && inPlanet && ringDistance <= ringBand + ringGap) return BACKGROUND;
  if (inPlanet) {
    // 왼쪽 위에서 빛이 오는 공 모양 음영
    const nx = x / planetRadius;
    const ny = y / planetRadius;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const light = clamp01(nx * -0.5 + ny * -0.6 + nz * 0.62);
    return mix(PLANET_DARK, PLANET_LIT, 0.15 + 0.85 * light);
  }
  if (!front && ringDistance <= ringBand) return mix(RING, BACKGROUND, 0.35);
  return null;
}

/**
 * RGBA 픽셀(0~255)을 만든다.
 * shape: "square"(꽉 찬 불투명 배경) | "rounded"(둥근 사각형, 모서리 투명)
 * extent: 표시(고리 바깥 끝)의 반지름 ÷ 아이콘 한 변
 */
function render(size, { shape, extent }) {
  const pixels = new Float64Array(size * size * 4);
  const markRadius = extent * size;
  const corner = 0.22 * size;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const fx = px + (sx + 0.5) / SAMPLES;
          const fy = py + (sy + 0.5) / SAMPLES;
          if (shape === "rounded") {
            // 모서리 원 밖이면 투명
            const dx = Math.max(corner - fx, 0, fx - (size - corner));
            const dy = Math.max(corner - fy, 0, fy - (size - corner));
            if (dx * dx + dy * dy > corner * corner) continue;
          }
          const color = markColor((fx - size / 2) / markRadius, (fy - size / 2) / markRadius) ?? BACKGROUND;
          sum[0] += color[0];
          sum[1] += color[1];
          sum[2] += color[2];
          sum[3] += 1;
        }
      }
      const offset = (py * size + px) * 4;
      const count = SAMPLES * SAMPLES;
      // 색은 덮인 점들만 평균하고, 투명도는 덮인 비율로
      for (let i = 0; i < 3; i++) pixels[offset + i] = sum[3] > 0 ? sum[i] / sum[3] : 0;
      pixels[offset + 3] = (sum[3] / count) * 255;
    }
  }
  return pixels;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** PNG 줄 필터 중 바이트 절댓값 합이 가장 작은 것을 고른다(압축이 잘 되는 흔한 방법) */
function filterRow(row, previous, bytesPerPixel) {
  const candidates = [0, 1, 2, 3, 4].map((type) => {
    const out = Buffer.alloc(row.length + 1);
    out[0] = type;
    for (let i = 0; i < row.length; i++) {
      const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
      const up = previous[i];
      const upLeft = i >= bytesPerPixel ? previous[i - bytesPerPixel] : 0;
      let predictor = 0;
      if (type === 1) predictor = left;
      else if (type === 2) predictor = up;
      else if (type === 3) predictor = (left + up) >> 1;
      else if (type === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[i + 1] = (row[i] - predictor) & 0xff;
    }
    let cost = 0;
    for (let i = 1; i < out.length; i++) cost += out[i] < 128 ? out[i] : 256 - out[i];
    return { out, cost };
  });
  return candidates.reduce((best, next) => (next.cost < best.cost ? next : best)).out;
}

/** alpha: false면 불투명 RGB PNG(작다), true면 RGBA PNG */
function encodePng(pixels, size, alpha) {
  const bytesPerPixel = alpha ? 4 : 3;
  const rows = [];
  let previous = Buffer.alloc(size * bytesPerPixel);
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * bytesPerPixel);
    for (let x = 0; x < size; x++) {
      for (let i = 0; i < bytesPerPixel; i++) {
        row[x * bytesPerPixel + i] = Math.round(pixels[(y * size + x) * 4 + i]);
      }
    }
    rows.push(filterRow(row, previous, bytesPerPixel));
    previous = row;
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 채널당 8비트
  header[9] = alpha ? 6 : 2; // 6 = RGBA, 2 = RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** PNG를 그대로 담은 ICO (Windows Vista 이후 형식, 모든 주요 브라우저가 읽는다) */
function encodeIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // 종류: 아이콘
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4); // 색 평면
    entry.writeUInt16LE(32, 6); // 픽셀당 비트
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

const write = (name, data) => {
  writeFileSync(new URL(name, OUT_DIR), data);
  console.log(`${name}: ${data.length} bytes`);
};
const png = (size, options) => encodePng(render(size, options), size, options.shape === "rounded");

// 일반 아이콘: 둥근 사각형. 마스크 아이콘: 꽉 찬 배경, 표시는 가운데 80% 원(반지름 40%) 안쪽
write("pwa-192x192.png", png(192, { shape: "rounded", extent: 0.4 }));
write("pwa-512x512.png", png(512, { shape: "rounded", extent: 0.4 }));
write("maskable-icon-512x512.png", png(512, { shape: "square", extent: 0.34 }));
// iOS는 투명한 곳을 검게 칠하고 모서리를 스스로 둥글게 깎는다 → 불투명 꽉 찬 배경
write("apple-touch-icon-180x180.png", png(180, { shape: "square", extent: 0.38 }));
// 탭 아이콘은 작아서 표시를 크게
write(
  "favicon.ico",
  encodeIco([16, 32, 48].map((size) => ({ size, png: png(size, { shape: "rounded", extent: 0.46 }) }))),
);
