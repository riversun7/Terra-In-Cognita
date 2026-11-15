// PWA 빌드 결과 검사 — 순수 함수(시험: pwa-build.test.mjs). 파일 읽기는 check-pwa.mjs가 한다.
// ADR 2026-10-28-pwa-and-browser-baseline: 설치 조건(manifest·아이콘), 화면 이동 대체에서 뺄 경로, 새 버전 적용 메시지
// 화면 주소 표는 TS 원본을 상대 경로로 바로 읽는다(Node 24 타입 지우기. packages/shared는 지울 수 있는 문법만 쓴다,
// ADR 2026-10-29-app-shell 1절). 표에 화면을 더하면 이 검사가 저절로 그 경로를 본다.
import { routePathExamples } from "../packages/shared/src/routes.ts";

/** 서비스 워커가 화면 이동 대체(index.html)를 하면 안 되는 경로 — 소셜 로그인 콜백 등 */
export const DENIED_NAVIGATIONS = [
  "/api",
  "/api/",
  "/api/auth/callback/google?code=1",
  "/api?x=1",
  "/ws",
  "/health",
];
/** 화면 주소 표의 모든 경로 예(검색어를 붙인 것 포함) — 서비스 워커가 index.html로 열어야 한다 */
export const ROUTE_NAVIGATIONS = routePathExamples();
/** 화면 이동 대체가 맡아야 하는 화면 경로: 주소 표의 경로 예 + 앞머리만 닮은 경로(제외 목록이 너무 넓지 않은지) */
export const ALLOWED_NAVIGATIONS = [
  ...ROUTE_NAVIGATIONS,
  "/game",
  "/apiary",
  "/healthy",
  "/wsx",
  "/settings/api",
];

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** manifest 아이콘의 용도 목록(없으면 any) */
const purposes = (icon) => String(icon.purpose ?? "any").split(/\s+/);

/** HTML의 태그 속성 읽기 (빌드된 index.html 정도만 다룬다) */
function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gi"))].map((match) => {
    const attributes = {};
    for (const attr of match[1].matchAll(/([\w-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attributes[attr[1].toLowerCase()] = attr[3] ?? attr[4] ?? attr[5] ?? "";
    }
    return attributes;
  });
}

/** 사이트 안 주소 → dist 안 경로("/a/b.png" → "a/b.png"). 다른 사이트 주소면 null */
function localPath(href, base = "/") {
  const url = new URL(href, new URL(base, "https://app.invalid"));
  return url.origin === "https://app.invalid" ? decodeURIComponent(url.pathname).replace(/^\/+/, "") : null;
}

/** PNG 머리(IHDR)의 가로·세로. PNG가 아니면 null */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24 || PNG_SIGNATURE.some((value, i) => bytes[i] !== value)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** 압축된 sw.js에서 `denylist:[/.../, ...]`의 정규식들을 꺼낸다. 없으면 null */
export function extractDenylist(source) {
  const start = /denylist\s*:\s*\[/.exec(source);
  if (!start) return null;
  const regexes = [];
  let i = start.index + start[0].length;
  while (i < source.length) {
    const ch = source[i];
    if (ch === "]") return regexes;
    if (ch !== "/") {
      i += 1;
      continue;
    }
    // 정규식 리터럴: 이스케이프와 [...] 안의 /를 건너뛴다
    let body = "";
    let inClass = false;
    let j = i + 1;
    for (; j < source.length; j++) {
      const c = source[j];
      if (c === "\\") {
        body += c + (source[j + 1] ?? "");
        j += 1;
        continue;
      }
      if (c === "/" && !inClass) break;
      if (c === "[") inClass = true;
      else if (c === "]") inClass = false;
      body += c;
    }
    let flags = "";
    let k = j + 1;
    while (k < source.length && /[a-z]/.test(source[k])) flags += source[k++];
    try {
      regexes.push(new RegExp(body, flags));
    } catch {
      return null;
    }
    i = k;
  }
  return null;
}

/** 글꼴 파일 */
const FONT_FILE = /\.(woff2?|ttf|otf|eot)$/i;
/** 빌드가 내용 해시를 붙인 /assets/ 파일 이름: <이름>-<해시>.<확장자> */
const HASHED_ASSET = /^assets\/(?:[^/]+\/)*[^/]+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/;

/** sw.js가 미리 캐시하는 주소들(precacheAndRoute 목록의 url) */
export function precacheUrls(sw) {
  return [...sw.matchAll(/\burl\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

/**
 * 개발자 도구 조각(ADR 2026-10-29-planet-editor-stage1 1절) — 셰이더 측정(gpuBench…), 행성 편집기(planetEditor…),
 * 항성계 편집기(starSystem…, ADR 2026-10-31-star-system-editor), 2차맵 시험(secondMapLab…), 설정 칸 패널(tuningPanel…,
 * ADR 2026-11-01-dev-settings-panel), 밸런스 화면(balancePanel…, ADR 2026-11-01-balance-screen), 스킬 편집기(skillEditor…,
 * ADR 2026-11-01-skill-editor), 아이템 편집기(itemEditor…, ADR 2026-11-01-item-editor), 건물 편집기(buildingEditor…,
 * ADR 2026-11-02-building-editor — 2차맵 모습 3D 미리 보기 buildingEditorPreview… 포함), 1차 생산 티어 확률(gatherTier…, 같은 ADR
 * "바뀜 (2026-11-09)" — 지금은 생산 편집기 productionEditor…의 확률 분포 탭, ADR 2026-11-11-production-six)과 편집기들이 같이 쓰는 부품(contentEditor…), 효과 사전(effectDictionary…, 아이템·스킬 편집기가
 * 같이 쓰는 고리 EffectDictionaryLinks도 이 앞머리, ADR 2026-11-01-item-editor "바뀜 (2026-11-09)"),
 * 전투 다시보기(battleReplayLab…, ADR 2026-11-01-battle-replay)의 화면·코드·워커·CSS. 개발자 도구를
 * 열 때만 받는다(셰이더 측정의 three/webgpu는 약 690kB).
 * 미리 캐시하면 모든 플레이어가 서비스 워커 설치 때 받는다. vite.config.ts의 workbox.globIgnores가 같은 파일을 뺀다.
 * 조각 이름은 진입 파일 이름을 따른다: 개발자 도구의 지연 로딩·워커 진입 파일은 이 앞머리로 짓는다
 * (대문자로 시작하는 화면 파일 PlanetEditorScreen.tsx·StarSystemScreen.tsx도 걸리게 [Pp]·[Ss]. 시험이 진입 파일 이름을 본다).
 * 개발자 홈(DevHome)은 작은 목록이라 이 규칙 밖이다(미리 캐시된다).
 */
export const DEV_ONLY_CHUNK =
  /^assets\/(gpuBench|[Pp]lanetEditor|[Ss]tarSystem|[Ss]econdMapLab|[Tt]uningPanel|[Bb]alancePanel|[Ss]econdaryStats|[Ss]killEditor|[Ii]temEditor|[Bb]uildingEditor|[Gg]atherTier|[Pp]roductionEditor|[Cc]reatureEditor|[Nn]ationEditor|[Tt]erritoryLab|[Ww]orldLayout|[Ee]ffectDictionary|generator-|cellReport-|analysis-|[Cc]ontentEditor|[Bb]attleReplayLab|[Rr]ecruitLab|[Tt]errainObjects|[Gg]atherObjects)[^/]*\.(js|css)$/;

/**
 * 개발자 도구만 쓰는 소스(소스 맵의 sources 경로). 개발자 도구 둘(행성 편집기·항성계 편집기)이 같이 쓰는 모듈은 따로 한 조각이
 * 되고, 그 이름은 묶인 모듈에서 정해진다(ADR 2026-10-31-star-system-editor): 이름이 DEV_ONLY_CHUNK에 걸린다는 보장이 없다.
 * 그래서 미리 캐시하는 JS의 소스 맵에 이 소스가 있으면 실패한다(개발자 홈 DevHome·devIcons는 미리 캐시되는 작은 목록이라 뺀다).
 * 이름으로 묶는 rolldown codeSplitting 무리는 쓰지 않는다: 무리에 든 모듈이 가져오는 react·api까지 끌려가 플레이어 화면이
 * 미리 캐시되지 않은 조각을 받게 됐다(2026-10-31 빌드로 확인).
 */
export const DEV_ONLY_SOURCE =
  /(^|\/)src\/editor\/(planet|starSystem|gpuBench|secondMapLab|tuning|balance|secondaryStats|skills|items|buildings|gatherTiers|production|creatures|nations|territory|content|battleReplayLab|recruit|worldLayout|effects|terrainObjects|gatherObjects)\/|(^|\/)packages\/planet\/src\/generator\/|(^|\/)packages\/engine\/src\/buildings\/(buildingPreview|previewEntry)\.ts$/;

/** 소스 맵(JSON 바이트)의 sources 중 개발자 도구 소스. 맵이 없거나 읽지 못하면 빈 목록 */
function devSourcesOf(mapBytes) {
  if (!mapBytes) return [];
  try {
    const sources = JSON.parse(new TextDecoder().decode(mapBytes)).sources;
    return Array.isArray(sources) ? sources.filter((source) => DEV_ONLY_SOURCE.test(String(source))) : [];
  } catch {
    return [];
  }
}

/**
 * 디자인 시스템 규칙(ADR 2026-10-28-design-system)
 * - 테마 시작 스크립트(theme-init.js): <head>에서 CSS·앱 스크립트보다 먼저, 외부 파일로(인라인 아님). 앱 껍데기로 미리 캐시한다.
 * - 글꼴: WOFF2만, /assets/<이름>-<해시>.woff2로 내보낸다. CSS에 인라인하지 않고, 서비스 워커가 미리 캐시하지 않는다.
 */
function findDesignProblems({ indexHtml, sw, files, readFile }) {
  const problems = [];
  const head = indexHtml.slice(0, Math.max(0, indexHtml.search(/<\/head>/i)));
  const init = head.search(/<script\b[^>]*\bsrc="\/theme-init\.js"[^>]*>\s*<\/script>/i);
  if (init < 0) {
    problems.push('index.html <head>에 <script src="/theme-init.js"></script>가 없습니다.');
  } else {
    const initTag = /<script\b[^>]*\bsrc="\/theme-init\.js"[^>]*>/i.exec(head.slice(init))?.[0] ?? "";
    if (/\b(type="module"|async|defer)\b/i.test(initTag)) {
      problems.push("theme-init.js는 바로 실행되는 일반 스크립트여야 합니다(type=module·async·defer 없이).");
    }
    const firstStyle = head.search(/<link\b[^>]*rel="stylesheet"/i);
    const firstModule = head.search(/<script\b[^>]*type="module"/i);
    if ((firstStyle >= 0 && firstStyle < init) || (firstModule >= 0 && firstModule < init)) {
      problems.push(
        "theme-init.js는 CSS·앱 스크립트보다 먼저 읽어야 합니다(첫 화면이 다른 색으로 번쩍인다).",
      );
    }
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(indexHtml)) {
    problems.push(
      "index.html에 인라인 스크립트가 있습니다(나중에 넣을 콘텐츠 보안 정책). 외부 파일로 두세요.",
    );
  }
  if (readFile("theme-init.js") === null) problems.push("theme-init.js가 빌드 결과에 없습니다(public/).");
  if (sw !== null) {
    const urls = precacheUrls(sw);
    if (!urls.includes("theme-init.js")) problems.push("sw.js가 theme-init.js를 미리 캐시하지 않습니다.");
    for (const url of urls.filter((u) => FONT_FILE.test(u))) {
      problems.push(`sw.js가 글꼴을 미리 캐시합니다(처음 쓸 때 받아야 함): ${url}`);
    }
    for (const url of urls.filter((u) => DEV_ONLY_CHUNK.test(u))) {
      problems.push(`sw.js가 개발자 도구 조각을 미리 캐시합니다(도구를 열 때만 받아야 함): ${url}`);
    }
    for (const url of urls.filter((u) => u.endsWith(".js"))) {
      const leaked = devSourcesOf(readFile(`${url}.map`));
      if (leaked.length > 0) {
        problems.push(`sw.js가 개발자 도구 모듈이 든 조각을 미리 캐시합니다: ${url} ← ${leaked.join(", ")}`);
      }
    }
  }
  const fonts = files.filter((file) => FONT_FILE.test(file));
  for (const file of fonts) {
    if (!/\.woff2$/i.test(file)) problems.push(`WOFF2가 아닌 글꼴 파일이 있습니다: ${file}`);
    else if (!HASHED_ASSET.test(file))
      problems.push(`글꼴은 /assets/<이름>-<해시>.woff2로 내보냅니다: ${file}`);
  }
  for (const css of files.filter((file) => /\.css$/i.test(file))) {
    const bytes = readFile(css);
    const text = bytes ? new TextDecoder().decode(bytes) : "";
    if (/url\(\s*["']?data:(?:font|application\/(?:font|x-font)|[^)]*woff)/i.test(text)) {
      problems.push(`CSS에 글꼴이 인라인돼 있습니다(파일로 내보내야 함): ${css}`);
    }
  }
  return problems;
}

/**
 * 빌드 결과의 문제 목록. 비어 있으면 통과.
 * @param {{ indexHtml: string | null, manifest: string | null, sw: string | null,
 *           readFile: (path: string) => Uint8Array | null, files?: string[] }} build
 *   path·files는 dist 기준 상대 경로(/로 나눔). files는 dist의 모든 파일
 * @returns {string[]}
 */
export function findPwaProblems({ indexHtml, manifest, sw, readFile, files = [] }) {
  const problems = [];
  if (indexHtml === null) return ["index.html이 없습니다."];
  problems.push(...findDesignProblems({ indexHtml, sw, files, readFile }));

  // index.html: manifest 링크, theme-color, 아이콘 링크가 가리키는 파일
  const links = tags(indexHtml, "link");
  const manifestLinks = links.filter((link) => link.rel?.toLowerCase() === "manifest");
  if (manifestLinks.length !== 1 || manifestLinks[0].href !== "/manifest.webmanifest") {
    problems.push('index.html에 <link rel="manifest" href="/manifest.webmanifest">가 하나 있어야 합니다.');
  }
  for (const link of links.filter((l) => /^(icon|apple-touch-icon)$/i.test(l.rel ?? ""))) {
    const path = link.href ? localPath(link.href) : null;
    if (!path || readFile(path) === null)
      problems.push(`index.html의 ${link.rel} 파일이 없습니다: ${link.href}`);
  }
  const themeMeta = tags(indexHtml, "meta").find((meta) => meta.name?.toLowerCase() === "theme-color");

  // manifest: 설치 조건(Chrome·삼성 인터넷)과 우리 값
  let data = null;
  if (manifest === null) problems.push("manifest.webmanifest가 없습니다.");
  else {
    try {
      data = JSON.parse(manifest);
    } catch (error) {
      problems.push(`manifest.webmanifest가 JSON이 아닙니다: ${error.message}`);
    }
  }
  if (data) {
    for (const field of ["name", "short_name", "start_url", "id", "scope"]) {
      if (typeof data[field] !== "string" || data[field].trim() === "") {
        problems.push(`manifest의 ${field}가 비어 있습니다.`);
      }
    }
    if (data.display !== "standalone")
      problems.push(`manifest의 display가 "${data.display}"입니다(standalone).`);
    if (!themeMeta?.content) problems.push('index.html에 <meta name="theme-color">가 없습니다.');
    else if (String(data.theme_color).toLowerCase() !== themeMeta.content.toLowerCase()) {
      problems.push(
        `manifest의 theme_color(${data.theme_color})와 index.html의 theme-color(${themeMeta.content})가 다릅니다.`,
      );
    }
    const icons = Array.isArray(data.icons) ? data.icons : [];
    const hasIcon = (size, purpose) =>
      icons.some(
        (icon) => String(icon.sizes).split(/\s+/).includes(size) && purposes(icon).includes(purpose),
      );
    if (!hasIcon("192x192", "any")) problems.push("manifest에 192x192 아이콘이 없습니다.");
    if (!hasIcon("512x512", "any")) problems.push("manifest에 512x512 아이콘이 없습니다.");
    if (!icons.some((icon) => purposes(icon).includes("maskable"))) {
      problems.push("manifest에 maskable 아이콘이 없습니다.");
    }
    for (const icon of icons) {
      const path = typeof icon.src === "string" ? localPath(icon.src, "/manifest.webmanifest") : null;
      const bytes = path ? readFile(path) : null;
      if (!bytes) {
        problems.push(`manifest 아이콘 파일이 없습니다: ${icon.src}`);
        continue;
      }
      if (icon.type !== "image/png") continue;
      const size = pngSize(bytes);
      if (!size) problems.push(`manifest 아이콘이 PNG가 아닙니다: ${icon.src}`);
      else if (!String(icon.sizes).split(/\s+/).includes(`${size.width}x${size.height}`)) {
        problems.push(
          `manifest 아이콘 크기가 다릅니다: ${icon.src}는 ${size.width}x${size.height}(${icon.sizes})`,
        );
      }
    }
  }

  // sw.js: 새 버전 적용 메시지, 화면 이동 대체와 제외 경로, 껍데기 캐시
  if (sw === null) return [...problems, "sw.js가 없습니다."];
  if (!/["']SKIP_WAITING["']/.test(sw) || !sw.includes("skipWaiting()")) {
    problems.push("sw.js가 SKIP_WAITING 메시지를 받지 않습니다(src/pwa/updates.ts가 보낸다).");
  }
  if (!/createHandlerBoundToURL\(\s*["']index\.html["']\s*\)/.test(sw)) {
    problems.push("sw.js에 화면 이동 대체(index.html)가 없습니다.");
  }
  if (!/url\s*:\s*["']index\.html["']/.test(sw))
    problems.push("sw.js가 index.html을 미리 캐시하지 않습니다.");
  const denylist = extractDenylist(sw);
  if (!denylist) problems.push("sw.js에 화면 이동 대체 제외 목록(denylist)이 없습니다.");
  else {
    const denied = (path) => denylist.some((regex) => regex.test(path));
    for (const path of DENIED_NAVIGATIONS.filter((p) => !denied(p))) {
      problems.push(`sw.js가 ${path} 화면 이동을 index.html로 대신합니다(제외해야 함).`);
    }
    for (const path of ALLOWED_NAVIGATIONS.filter(denied)) {
      problems.push(`sw.js가 화면 경로 ${path}를 화면 이동 대체에서 뺍니다.`);
    }
  }
  return problems;
}
