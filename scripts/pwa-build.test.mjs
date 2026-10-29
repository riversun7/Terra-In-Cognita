// PWA 빌드 결과 검사 시험 — 실제 빌드(vite-plugin-pwa 2.0.0 + Workbox 7.4.1)와 같은 모양의 가짜 결과로 본다
import { describe, expect, it } from "vitest";
import {
  ALLOWED_NAVIGATIONS,
  ROUTE_NAVIGATIONS,
  extractDenylist,
  findPwaProblems,
  pngSize,
  precacheUrls,
} from "./pwa-build.mjs";

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
<meta name="theme-color" content="#dff2fb" />
<script src="/theme-init.js"></script>
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48" />
<script type="module" crossorigin src="/assets/index-C7aqUyd7.js"></script>
<link rel="stylesheet" crossorigin href="/assets/index-Cvbx1a8l.css">
<link rel="apple-touch-icon" href="/apple-touch-icon-180x180.png" />
<link rel="manifest" href="/manifest.webmanifest"></head><body><div id="root"></div></body></html>`;

const MANIFEST = {
  name: "테라 인코그니타",
  short_name: "테라",
  start_url: "/",
  display: "standalone",
  theme_color: "#dff2fb",
  scope: "/",
  id: "/",
  icons: [
    { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
    { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
    { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

// 빌드된 sw.js(압축됨)에서 검사가 보는 부분
const SW = `define(["./workbox-2178cfdb"],function(e){"use strict";self.addEventListener("message",e=>{e.data&&"SKIP_WAITING"===e.data.type&&self.skipWaiting()}),e.precacheAndRoute([{url:"theme-init.js",revision:"daa4"},{url:"index.html",revision:"3580"},{url:"assets/index-Cvbx1a8l.css",revision:null}],{}),e.cleanupOutdatedCaches(),e.registerRoute(new e.NavigationRoute(e.createHandlerBoundToURL("index.html"),{denylist:[/^\\/(api|ws|health)(\\/|\\?|$)/]}))});`;

/** 빌드된 CSS(글꼴은 파일 주소로) */
const CSS = new TextEncoder().encode(
  '@font-face{font-family:Pretendard;src:url(/assets/Pretendard-Regular.subset-ABCD1234.woff2) format("woff2")}',
);

const FILES = {
  "theme-init.js": new TextEncoder().encode("(() => {})();"),
  "assets/index-Cvbx1a8l.css": CSS,
  "assets/Pretendard-Regular.subset-ABCD1234.woff2": new Uint8Array([0x77, 0x4f, 0x46, 0x32]),
  "favicon.ico": new Uint8Array([0, 0, 1, 0]),
  "apple-touch-icon-180x180.png": fakePng(180, 180),
  "pwa-192x192.png": fakePng(192, 192),
  "pwa-512x512.png": fakePng(512, 512),
  "maskable-icon-512x512.png": fakePng(512, 512),
};

/** 가짜 빌드 결과. overrides.files는 파일을 더하거나 바꾼다(null이면 뺀다) */
function build(overrides = {}) {
  const { files: changed, ...rest } = overrides;
  const files = Object.fromEntries(
    Object.entries({ ...FILES, ...changed }).filter(([, bytes]) => bytes !== null),
  );
  return {
    indexHtml: INDEX_HTML,
    manifest: JSON.stringify(MANIFEST),
    sw: SW,
    readFile: (path) => files[path] ?? null,
    files: Object.keys(files),
    ...rest,
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
      findPwaProblems(build({ manifest: JSON.stringify({ ...MANIFEST, theme_color: "#DFF2FB" }) })),
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

  it("화면 주소 표(packages/shared/src/routes.ts)의 모든 경로 예를 화면 이동 대체에 맡긴다", () => {
    expect(ROUTE_NAVIGATIONS).toEqual(
      expect.arrayContaining(["/", "/map/planet", "/inbox", "/dev/planet-editor"]),
    );
    // 검색어(값에 점·쌍점)를 붙인 경로도 대 본다
    expect(ROUTE_NAVIGATIONS.some((path) => path.includes("?") && path.includes("."))).toBe(true);
    for (const path of ROUTE_NAVIGATIONS) expect(ALLOWED_NAVIGATIONS).toContain(path);
    // 제외 목록이 화면(지도)까지 빼면 그 경로 예마다 실패
    const blocksMap = SW.replace("(api|ws|health)(\\/|\\?|$)", "(api|ws|health|map)(\\/|\\?|$)");
    const problems = findPwaProblems(build({ sw: blocksMap }));
    expect(problems).toEqual(
      ROUTE_NAVIGATIONS.filter((path) => path.startsWith("/map")).map((path) =>
        expect.stringContaining(`화면 경로 ${path}를`),
      ),
    );
    expect(problems.length).toBeGreaterThanOrEqual(2);
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

describe("디자인 시스템 규칙(테마 시작 스크립트·글꼴)", () => {
  it("theme-init.js가 없거나, CSS·앱 스크립트보다 늦거나, 지연 실행이면 실패", () => {
    const missing = INDEX_HTML.replace('<script src="/theme-init.js"></script>', "");
    expect(findPwaProblems(build({ indexHtml: missing }))).toEqual([
      expect.stringContaining('<script src="/theme-init.js"></script>가 없습니다'),
    ]);
    const late = missing.replace("</head>", '<script src="/theme-init.js"></script></head>');
    expect(findPwaProblems(build({ indexHtml: late }))).toEqual([expect.stringContaining("먼저 읽어야")]);
    const deferred = INDEX_HTML.replace(
      '<script src="/theme-init.js">',
      '<script defer src="/theme-init.js">',
    );
    expect(findPwaProblems(build({ indexHtml: deferred }))).toEqual([
      expect.stringContaining("일반 스크립트"),
    ]);
  });

  it("인라인 스크립트가 있거나 theme-init.js를 미리 캐시하지 않으면 실패", () => {
    const inline = INDEX_HTML.replace(
      "</head>",
      "<script>document.documentElement.dataset.theme='dark'</script></head>",
    );
    expect(findPwaProblems(build({ indexHtml: inline }))).toEqual([
      expect.stringContaining("인라인 스크립트"),
    ]);
    const sw = SW.replace('{url:"theme-init.js",revision:"daa4"},', "");
    expect(findPwaProblems(build({ sw }))).toEqual([
      expect.stringContaining("theme-init.js를 미리 캐시하지"),
    ]);
    expect(findPwaProblems(build({ files: { "theme-init.js": null } }))).toEqual([
      expect.stringContaining("theme-init.js가 빌드 결과에 없습니다"),
    ]);
  });

  it("글꼴: 미리 캐시, WOFF, 해시 없는 이름, CSS 인라인이면 실패", () => {
    const sw = SW.replace(
      '{url:"index.html",revision:"3580"}',
      '{url:"index.html",revision:"3580"},{url:"assets/jua-1-400-normal-Q1w2E3r4.woff2",revision:null}',
    );
    expect(findPwaProblems(build({ sw }))).toEqual([expect.stringContaining("글꼴을 미리 캐시합니다")]);
    const woff = findPwaProblems(
      build({ files: { "assets/jua-1-400-normal-Q1w2E3r4.woff": new Uint8Array(4) } }),
    );
    expect(woff).toEqual([expect.stringContaining("WOFF2가 아닌 글꼴")]);
    const unhashed = findPwaProblems(build({ files: { "fonts/Jua.woff2": new Uint8Array(4) } }));
    expect(unhashed).toEqual([expect.stringContaining("/assets/<이름>-<해시>.woff2")]);
    const inlined = new TextEncoder().encode(
      '@font-face{font-family:Jua;src:url(data:font/woff2;base64,d09GMgAB) format("woff2")}',
    );
    expect(findPwaProblems(build({ files: { "assets/index-Cvbx1a8l.css": inlined } }))).toEqual([
      expect.stringContaining("CSS에 글꼴이 인라인"),
    ]);
  });

  it("미리 캐시 주소 목록 읽기", () => {
    expect(precacheUrls(SW)).toEqual(["theme-init.js", "index.html", "assets/index-Cvbx1a8l.css"]);
  });

  it("관리자 셰이더 측정 조각을 미리 캐시하면 실패(누를 때만 받는다)", () => {
    const sw = SW.replace(
      '{url:"index.html",revision:"3580"}',
      '{url:"index.html",revision:"3580"},{url:"assets/gpuBenchTsl-Acw_2DfU.js",revision:null}',
    );
    expect(findPwaProblems(build({ sw }))).toEqual([expect.stringContaining("관리자 측정 조각")]);
    const other = SW.replace(
      '{url:"index.html",revision:"3580"}',
      '{url:"index.html",revision:"3580"},{url:"assets/AdminPage-DFRSzlZB.js",revision:null}',
    );
    expect(findPwaProblems(build({ sw: other }))).toEqual([]);
  });
});
