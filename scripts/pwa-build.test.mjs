// PWA 빌드 결과 검사 시험 — 실제 빌드(vite-plugin-pwa 2.0.0 + Workbox 7.4.1)와 같은 모양의 가짜 결과로 본다
import { describe, expect, it } from "vitest";
import { extractDenylist, findPwaProblems, pngSize } from "./pwa-build.mjs";

/** 가로·세로만 맞춘 PNG 머리(검사는 IHDR까지만 읽는다) */
function fakePng(width, height) {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

const INDEX_HTML = `<!doctype html><html lang="ko"><head>
<meta name="theme-color" content="#0b1020" />
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
<link rel="manifest" href="/manifest.webmanifest"></head><body><div id="root"></div></body></html>`;

const MANIFEST = {
  name: "테라 인코그니타",
  short_name: "테라",
  start_url: "/",
  display: "standalone",
  theme_color: "#0b1020",
  scope: "/",
  id: "/",
  icons: [
    { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
    { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
    { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

// 빌드된 sw.js(압축됨)에서 검사가 보는 부분
const SW = `define(["./workbox-2178cfdb"],function(e){"use strict";self.addEventListener("message",e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()}),e.precacheAndRoute([{url:"index.html",revision:"3580"}],{}),e.cleanupOutdatedCaches(),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html"),{denylist:[/^\\/(api|ws|health)(\\/|\\?|$)/]}))});`;

const FILES = {
  "favicon.ico": new Uint8Array([0, 0, 1, 0]),
  "apple-touch-icon-180x180.png": fakePng(180, 180),
  "pwa-192x192.png": fakePng(192, 192),
  "pwa-512x512.png": fakePng(512, 512),
  "maskable-icon-512x512.png": fakePng(512, 512),
};

function build(overrides = {}) {
  const files = { ...FILES, ...overrides.files };
  return {
    indexHtml: INDEX_HTML,
    manifest: JSON.stringify(MANIFEST),
    sw: SW,
    readFile: (path) => files[path] ?? null,
    ...overrides,
  };
}

describe("PWA 빌드 결과 검사", () => {
  it("올바른 빌드는 통과한다", () => {
    expect(findPwaProblems(build())).toEqual([]);
  });

  it("manifest 링크가 없으면 실패", () => {
    const indexHtml = INDEX_HTML.replace('<link rel="manifest" href="/manifest.webmanifest">', "");
    expect(findPwaProblems(build({ indexHtml }))).toEqual([expect.stringContaining('<link rel="manifest"')]);
  });

  it("theme_color가 meta와 다르면 실패 (대소문자는 무시)", () => {
    expect(
      findPwaProblems(build({ manifest: JSON.stringify({ ...MANIFEST, theme_color: "#0B1020" }) })),
    ).toEqual([]);
    expect(
      findPwaProblems(build({ manifest: JSON.stringify({ ...MANIFEST, theme_color: "#ffffff" }) })),
    ).toEqual([expect.stringContaining("theme_color")]);
  });

  it("필수 필드·아이콘 누락, 크기가 틀린 아이콘, 없는 파일", () => {
    const manifest = JSON.stringify({
      ...MANIFEST,
      short_name: "",
      display: "browser",
      icons: [
        { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
        { src: "missing.png", sizes: "512x512", type: "image/png" },
      ],
    });
    const problems = findPwaProblems(build({ manifest, files: { "pwa-192x192.png": fakePng(96, 96) } }));
    expect(problems).toEqual([
      expect.stringContaining("short_name"),
      expect.stringContaining("display"),
      expect.stringContaining("maskable"),
      expect.stringContaining("96x96"),
      expect.stringContaining("missing.png"),
    ]);
  });

  it("index.html의 아이콘 링크가 가리키는 파일이 없으면 실패", () => {
    const problems = findPwaProblems(
      build({ readFile: (path) => (path === "favicon.ico" ? null : FILES[path]) }),
    );
    expect(problems).toEqual([expect.stringContaining("/favicon.ico")]);
  });

  it("sw.js: SKIP_WAITING·화면 이동 대체·제외 목록이 없으면 실패", () => {
    const sw = SW.replace('"SKIP_WAITING"===e.data.type&&self.skipWaiting()', "0").replace(
      ",{denylist:[/^\\/(api|ws|health)(\\/|\\?|$)/]}",
      "",
    );
    expect(findPwaProblems(build({ sw }))).toEqual([
      expect.stringContaining("SKIP_WAITING"),
      expect.stringContaining("denylist"),
    ]);
    expect(findPwaProblems(build({ sw: null }))).toEqual(["sw.js가 없습니다."]);
  });

  it("제외 목록이 /api 콜백을 놓치거나 화면 경로까지 빼면 실패", () => {
    const tooNarrow = SW.replace("(api|ws|health)(\\/|\\?|$)", "(ws|health)$");
    expect(findPwaProblems(build({ sw: tooNarrow }))).toEqual(
      expect.arrayContaining([expect.stringContaining("/api/auth/callback/google")]),
    );
    const tooWide = SW.replace("(api|ws|health)(\\/|\\?|$)", "(api|ws|health)");
    expect(findPwaProblems(build({ sw: tooWide }))).toEqual(
      expect.arrayContaining([expect.stringContaining("/apiary")]),
    );
  });
});

describe("도우미", () => {
  it("denylist 정규식 꺼내기: 압축·비압축, [...] 안의 /와 플래그", () => {
    expect(extractDenylist("{denylist:[/^\\/(api|ws)(\\/|$)/]}")?.map(String)).toEqual([
      "/^\\/(api|ws)(\\/|$)/",
    ]);
    expect(extractDenylist("{ denylist: [/^\\/a[/]b/i, /^\\/c/] }")?.map(String)).toEqual([
      "/^\\/a[/]b/i",
      "/^\\/c/",
    ]);
    expect(extractDenylist("{allowlist:[/x/]}")).toBeNull();
  });

  it("PNG 크기 읽기", () => {
    expect(pngSize(fakePng(192, 180))).toEqual({ width: 192, height: 180 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
