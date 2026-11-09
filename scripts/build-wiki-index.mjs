// 위키 색인 생성 — docs/wiki/pages/*.md를 읽어 index.md·categories.md·terms.md를 만든다.
// --check: 파일을 쓰지 않고, 생성물이 최신이 아니면 실패한다 (푸시 전·CI).
// 규칙은 docs/wiki/README.md, 결정은 docs/adr/2026-11-09-player-wiki.md.
import { readFileSync, writeFileSync } from "node:fs";
import { fail } from "./lib.mjs";
import {
  STAGE_LABELS,
  STATUS_LABELS,
  WIKI_DIR,
  byKorean,
  chapterTitle,
  mainChapter,
  oneLineOf,
  readEntries,
} from "./wiki-lib.mjs";

const HEAD = "<!-- 자동 생성 파일 — 직접 고치지 않는다 (pnpm wiki:index) -->";

const entries = readEntries().map((entry) => ({
  id: entry.front.id ?? "",
  title: entry.front.title ?? entry.front.id ?? "",
  titleEn: entry.front.titleEn ?? "",
  aliases: Array.isArray(entry.front.aliases) ? entry.front.aliases : [],
  status: entry.front.status ?? "",
  stage: entry.front.stage ?? "",
  checked: entry.front.checked ?? "",
  chapter: mainChapter(entry),
  oneLine: oneLineOf(entry),
}));

function label(table, key) {
  return Object.hasOwn(table, key) ? table[key] : key;
}

function link(entry) {
  return `[${entry.title}](pages/${entry.id}.md)`;
}

/** 가나다 색인 — 항목과 다른 이름(넘겨주기)을 한 표에 섞어 찾기 쉽게 한다 */
function buildIndex() {
  const rows = [];
  for (const entry of entries) {
    rows.push({
      key: entry.title,
      cells: [
        link(entry),
        entry.oneLine,
        label(STATUS_LABELS, entry.status),
        label(STAGE_LABELS, entry.stage),
      ],
    });
    for (const alias of entry.aliases) {
      rows.push({ key: alias, cells: [`${alias} → ${link(entry)}`, "다른 이름", "", ""] });
    }
  }
  rows.sort((a, b) => byKorean(a.key, b.key));
  return [
    "# 색인",
    "",
    HEAD,
    "",
    `항목 ${entries.length}개. 가나다 순. 쓰는 규칙은 [README.md](README.md), 처음이면 [start.md](start.md).`,
    "",
    "| 항목 | 한 줄 | 기능 | 글 |",
    "|---|---|---|---|",
    ...rows.map((row) => `| ${row.cells.join(" | ")} |`),
    "",
  ].join("\n");
}

/** 장별 목록 + 진행 표. 분류는 기획서 장을 그대로 쓴다(머리 칸에 적지 않고 출처에서 뽑는다) */
function buildCategories() {
  const chapters = new Map();
  for (const entry of entries) {
    const list = chapters.get(entry.chapter) ?? [];
    list.push(entry);
    chapters.set(entry.chapter, list);
  }
  // 장 번호 차례(파일 이름이 "10_", "40_Systems/41_" 처럼 번호로 시작한다)
  const names = [...chapters.keys()].toSorted((a, b) => String(a).localeCompare(String(b)));
  const sections = names.flatMap((chapter) => {
    const list = (chapters.get(chapter) ?? []).toSorted((a, b) => byKorean(a.title, b.title));
    return [
      `## ${chapterTitle(chapter)}`,
      "",
      `기획서: [\`${chapter}\`](../design/${chapter})`,
      "",
      ...list.map((entry) => `- ${link(entry)} — ${entry.oneLine} (${label(STATUS_LABELS, entry.status)})`),
      "",
    ];
  });
  const counts = names.map((chapter) => {
    const list = chapters.get(chapter) ?? [];
    const count = (table, key) => list.filter((entry) => entry[table] === key).length;
    return `| ${chapterTitle(chapter)} | ${list.length} | ${count("status", "live")} | ${count("status", "building")} | ${count("status", "planned")} | ${count("stage", "stub")} | ${count("stage", "draft")} | ${count("stage", "done")} |`;
  });
  return [
    "# 분류 지도",
    "",
    HEAD,
    "",
    "분류는 기획서의 장을 그대로 쓴다. 항목의 첫 출처가 그 항목의 정본 장이다.",
    "",
    "## 진행",
    "",
    "| 장 | 항목 | 지금 되는 것 | 만드는 중 | 기획만 | 뼈대 | 초안 | 정리됨 |",
    "|---|--:|--:|--:|--:|--:|--:|--:|",
    ...counts,
    "",
    ...sections,
  ].join("\n");
}

/** 용어 대조표 — 나중에 영어 번역과 루트 GLOSSARY.md의 바탕 */
function buildTerms() {
  const rows = entries
    .toSorted((a, b) => byKorean(a.title, b.title))
    .map((entry) => `| ${entry.title} | ${entry.titleEn} | ${entry.aliases.join(", ")} | ${link(entry)} |`);
  return [
    "# 용어 대조표",
    "",
    HEAD,
    "",
    "한국어 이름과 영어 이름. 영어 본문은 아직 없다(한국어 먼저, 사용자 결정 2026-11-09).",
    "",
    "| 한국어 | English | 다른 이름 | 항목 |",
    "|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

const outputs = [
  { file: `${WIKI_DIR}/index.md`, content: buildIndex() },
  { file: `${WIKI_DIR}/categories.md`, content: buildCategories() },
  { file: `${WIKI_DIR}/terms.md`, content: buildTerms() },
];

if (process.argv.includes("--check")) {
  const stale = outputs.filter((out) => {
    let current = "";
    try {
      current = readFileSync(out.file, "utf8");
    } catch {
      current = "";
    }
    return current !== out.content;
  });
  if (stale.length > 0) {
    fail([
      ...stale.map((out) => `${out.file}이(가) 최신이 아니다`),
      "`pnpm wiki:index`를 돌려 함께 커밋하세요.",
    ]);
  }
  console.log(`✓ 위키 색인 최신 (항목 ${entries.length}개)`);
} else {
  for (const out of outputs) writeFileSync(out.file, out.content);
  console.log(`✓ 위키 색인 생성 (항목 ${entries.length}개): ${outputs.map((out) => out.file).join(", ")}`);
}
