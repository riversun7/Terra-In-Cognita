// 콘텐츠 팩 불러오기 — 서버 시작 때 1·2·4a단계(스키마·참조·ID 변경표)를 검사한다 (PLAN 7장).
// 하나라도 틀리면 시작하지 않는다 → 컨테이너가 healthy가 되지 않아 배포가 직전 버전으로 되돌린다(ops/deploy.sh 7단계).
import { type ContentPack, type PackSource, formatIssue, hasErrors, parseJson } from "@terra/content";
import { loadContentPack } from "@terra/content/node";

export interface ServerContent {
  /** "<팩 ID>@<팩 버전>" — /health, WebSocket welcome, tRPC system.info */
  version: string;
  /** 정규 JSON의 SHA-256 — /health (배포 점검이 CI 값과 비교) */
  hash: string;
  /** 기획 확정 전 임시 팩인지 */
  placeholder: boolean;
}

/** 팩 파일에 적힌 그대로의 항목(JSON) — 행성 편집기 정의 조회가 보낸다(ADR 38 11절 "원본 항목") */
export interface RawPackEntries {
  /** planets.json entries (파일 순서) */
  planets: readonly unknown[];
  /** biomes.json entries (파일 순서) */
  biomes: readonly unknown[];
  /** planet_templates.json entries (파일 순서, 없으면 빈 배열). 편집기 시작점만이고 서버가 굽지 않는다 */
  planetTemplates: readonly unknown[];
  /** map_props.json entries (파일 순서 = 흩기 우선순위, 없으면 빈 배열). 편집기 2차맵 미리보기의 소품 규칙 */
  mapProps: readonly unknown[];
}

export type ContentLoadResult =
  /** pack: 검증을 통과한 항목(행성 원본을 만든다, src/planet/sources.ts planetSpecsFromPack). raw: 같은 항목의 파일 JSON */
  | {
      ok: true;
      content: ServerContent;
      pack: ContentPack;
      raw: RawPackEntries;
      /** 팩 파일(분류 스키마로 다시 읽는 곳: 유닛·사이보그 화면 자료 src/roster/catalog.ts) */
      source: PackSource;
      warnings: string[];
    }
  | { ok: false; lines: string[] };

/** 분류 파일의 entries(파일 JSON 그대로). 파일이 없으면 빈 배열. 검증을 통과한 팩이라 모양은 맞다 */
function rawEntriesOf(source: PackSource, file: string): readonly unknown[] {
  const text = source.files.get(file);
  if (text === undefined) return [];
  const parsed: unknown = parseJson(text);
  const entries: unknown =
    typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "entries") : undefined;
  if (!Array.isArray(entries)) return [];
  const list: readonly unknown[] = entries;
  return list;
}

export function loadServerContent(dir: string): ContentLoadResult {
  const loaded = loadContentPack(dir);
  const lines = loaded.issues.map((issue) => formatIssue(issue, `${dir}/`));
  if (hasErrors(loaded.issues) || !loaded.pack || !loaded.version || !loaded.hash || !loaded.source) {
    return { ok: false, lines: [...lines, `콘텐츠 팩 검증 실패(${dir}) — 서버를 시작하지 않습니다`] };
  }
  return {
    ok: true,
    content: {
      version: loaded.version,
      hash: loaded.hash,
      placeholder: loaded.pack.manifest.placeholder === true,
    },
    pack: loaded.pack,
    source: loaded.source,
    raw: {
      planets: rawEntriesOf(loaded.source, "planets.json"),
      biomes: rawEntriesOf(loaded.source, "biomes.json"),
      planetTemplates: rawEntriesOf(loaded.source, "planet_templates.json"),
      mapProps: rawEntriesOf(loaded.source, "map_props.json"),
    },
    warnings: lines,
  };
}
