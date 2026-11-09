// 플레이어 위키(docs/wiki) 공용 읽기 — 색인 생성기와 검사 스크립트가 함께 쓴다.
// 머리 칸은 YAML이 아니라 이 저장소 전용 간단한 형식이다: `key: value`, 목록은 `[a; b]`.
// 규격은 docs/wiki/README.md, 결정은 docs/adr/2026-11-09-player-wiki.md.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export const WIKI_DIR = "docs/wiki";
export const PAGES_DIR = `${WIKI_DIR}/pages`;
export const DESIGN_DIR = "docs/design";
export const DECISION_LOG = `${DESIGN_DIR}/02_Decision_Log.md`;

/** 머리 칸의 칸 이름. 필수 여부와 목록인지 */
export const FIELDS = {
  id: { required: true, list: false },
  title: { required: true, list: false },
  titleEn: { required: true, list: false },
  aliases: { required: false, list: true },
  status: { required: true, list: false },
  stage: { required: true, list: false },
  decisions: { required: true, list: true },
  source: { required: true, list: true },
  checked: { required: true, list: false },
};

/** 기능 상태 — 플레이어에게 아직 없는 기능을 있다고 말하지 않기 위한 칸 */
export const STATUS_LABELS = { live: "지금 되는 것", building: "만드는 중", planned: "기획만 있는 것" };

/** 글 상태 */
export const STAGE_LABELS = { stub: "뼈대", draft: "초안", done: "정리됨" };

/** 본문에 올 수 있는 제목. 이 차례로만 쓴다(`required`는 빠뜨릴 수 없다) */
export const SECTIONS = [
  { name: "쉽게 말하면", required: true },
  { name: "어떻게 보고 쓰나", required: false },
  { name: "자세한 규칙", required: false },
  { name: "같이 보기", required: false },
  { name: "출처", required: true },
];

export const ID_PATTERN = /^[a-z][a-z0-9-]{1,47}$/;

/** 머리 칸 한 줄의 값 — 목록은 `[a; b]`, 빈 목록은 `[]` */
function parseValue(raw, isList) {
  if (!isList) return raw;
  const inner = raw.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (inner === "") return [];
  return inner
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * 항목 파일 하나를 읽는다. 모양이 틀린 것은 던지지 않고 `problems`에 모은다(검사 스크립트가 한 번에 보여 준다).
 */
export function readEntry(file) {
  const text = readFileSync(file, "utf8");
  const problems = [];
  const front = {};
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) {
    return { file, front, body: text, problems: [`${file}: 머리 칸(--- 사이)이 없다`] };
  }
  const [, head, body] = match;
  for (const line of head.split("\n")) {
    if (line.trim() === "") continue;
    const field = /^([A-Za-z]+):\s*(.*)$/.exec(line);
    if (!field) {
      problems.push(`${file}: 머리 칸 줄을 읽을 수 없다 — ${line}`);
      continue;
    }
    const [, key, raw] = field;
    if (!Object.hasOwn(FIELDS, key)) {
      problems.push(`${file}: 모르는 머리 칸 "${key}" (쓸 수 있는 칸: ${Object.keys(FIELDS).join(", ")})`);
      continue;
    }
    if (Object.hasOwn(front, key)) {
      problems.push(`${file}: 머리 칸 "${key}"가 두 번 있다`);
      continue;
    }
    front[key] = parseValue(raw.trim(), FIELDS[key].list);
  }
  return { file, front, body, problems };
}

/** 항목 전부. 파일 이름 순 */
export function readEntries() {
  if (!existsSync(PAGES_DIR)) return [];
  return readdirSync(PAGES_DIR)
    .filter((name) => name.endsWith(".md"))
    .toSorted()
    .map((name) => readEntry(path.join(PAGES_DIR, name)));
}

/** 본문의 `> **한 줄**: …` */
export function oneLineOf(entry) {
  return /^>\s*\*\*한 줄\*\*:\s*(.+)$/m.exec(entry.body)?.[1]?.trim() ?? "";
}

/** 본문의 `## ` 제목 목록 */
export function sectionsOf(entry) {
  return [...entry.body.matchAll(/^## (.+)$/gm)].map((m) => m[1].trim());
}

/** `source` 한 줄을 경로와 절(`§…`)로 나눈다 */
export function parseSource(raw) {
  const match = /^(\S+\.md)(?:\s+(§.*))?$/.exec(raw);
  if (!match) return null;
  return { file: match[1], section: match[2] ?? "" };
}

/** 그 항목의 정본 장 — 첫 출처의 기획서 파일. 분류는 손으로 적지 않고 여기서 뽑는다 */
export function mainChapter(entry) {
  const list = Array.isArray(entry.front.source) ? entry.front.source : [];
  for (const raw of list) {
    const parsed = parseSource(raw);
    if (parsed) return parsed.file;
  }
  return "";
}

const chapterTitles = new Map();

/** 기획서 파일의 첫 제목(`# 42. 맵·영토·건물 (Step 4-2)` → `42. 맵·영토·건물`) */
export function chapterTitle(designFile) {
  if (chapterTitles.has(designFile)) return chapterTitles.get(designFile);
  const full = path.join(DESIGN_DIR, designFile);
  let title = designFile;
  if (existsSync(full)) {
    const line = /^# (.+)$/m.exec(readFileSync(full, "utf8"))?.[1]?.trim();
    if (line) title = line.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }
  chapterTitles.set(designFile, title);
  return title;
}

/** 한국어 가나다 순 */
export function byKorean(a, b) {
  return a.localeCompare(b, "ko");
}
