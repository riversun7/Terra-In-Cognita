// 위키 검사 — 손으로는 못 지키는 것만 본다 (docs/adr/2026-11-09-player-wiki.md 7절).
// 머리 칸·필수 제목·항목끼리의 링크·기획서 링크·결정 ID가 실제로 있는지.
// --stale: 인용한 결정에 "대체" 표시가 있는 항목을 알린다(실패 아님. 미러를 새로 복사한 뒤 쓴다).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fail } from "./lib.mjs";
import {
  DECISION_LOG,
  DESIGN_DIR,
  FIELDS,
  GUIDES_DIR,
  ID_PATTERN,
  SECTIONS,
  STAGE_LABELS,
  STATUS_LABELS,
  WIKI_DIR,
  parseSource,
  readEntries,
  sectionsOf,
  stripFences,
} from "./wiki-lib.mjs";

const problems = [];
const entries = readEntries();

/** 결정 로그를 D-ID → 그 항목 본문으로 가른다 */
function readDecisions() {
  const map = new Map();
  if (!existsSync(DECISION_LOG)) return map;
  const text = readFileSync(DECISION_LOG, "utf8");
  const parts = text.split(/^## (D-\d+)\s*$/m);
  for (let i = 1; i < parts.length; i += 2) map.set(parts[i], parts[i + 1] ?? "");
  return map;
}

const headingCache = new Map();

/** 기획서 파일의 소제목 줄(`#` 뗀 것) */
function designHeadings(file) {
  if (headingCache.has(file)) return headingCache.get(file);
  const full = path.join(DESIGN_DIR, file);
  const list = existsSync(full)
    ? [...readFileSync(full, "utf8").matchAll(/^#{2,4} (.+)$/gm)].map((m) => m[1].trim())
    : [];
  headingCache.set(file, list);
  return list;
}

/** `§2.2 만족도`가 그 기획서 파일에 정말 있는 절인가 */
function sectionExists(file, section) {
  const body = section.replace(/^§\s*/, "").trim();
  const [number, ...rest] = body.split(/\s+/);
  const text = rest.join(" ");
  return designHeadings(file).some(
    (heading) =>
      (heading.startsWith(`${number}.`) || heading.startsWith(`${number} `)) &&
      (text === "" || heading.includes(text)),
  );
}

function checkFront(entry, seen) {
  const { file, front } = entry;
  for (const [key, spec] of Object.entries(FIELDS)) {
    if (spec.required && !Object.hasOwn(front, key)) problems.push(`${file}: 머리 칸 "${key}"가 없다`);
  }
  const base = path.basename(file, ".md");
  if (front.id !== base) problems.push(`${file}: id("${front.id ?? ""}")와 파일명("${base}")이 다르다`);
  if (typeof front.id === "string" && !ID_PATTERN.test(front.id)) {
    problems.push(`${file}: id는 영문 소문자·숫자·하이픈이어야 한다 — "${front.id}"`);
  }
  if (!Object.hasOwn(STATUS_LABELS, front.status ?? "")) {
    problems.push(
      `${file}: status는 ${Object.keys(STATUS_LABELS).join("·")} 중 하나 — "${front.status ?? ""}"`,
    );
  }
  if (!Object.hasOwn(STAGE_LABELS, front.stage ?? "")) {
    problems.push(`${file}: stage는 ${Object.keys(STAGE_LABELS).join("·")} 중 하나 — "${front.stage ?? ""}"`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(front.checked ?? "")) {
    problems.push(`${file}: checked는 YYYY-MM-DD — "${front.checked ?? ""}"`);
  }
  for (const name of [front.title, ...(Array.isArray(front.aliases) ? front.aliases : [])]) {
    if (typeof name !== "string" || name === "") continue;
    if (name.includes(",")) {
      problems.push(`${file}: 이름에 쉼표가 있다 — 목록은 ";"로 나눈다: "${name}"`);
      continue;
    }
    const owner = seen.get(name);
    if (owner) problems.push(`${file}: 이름 "${name}"을 ${owner}도 쓴다(한 개념 = 한 항목)`);
    else seen.set(name, file);
  }
}

function checkSources(entry, decisions) {
  const { file, front } = entry;
  for (const raw of Array.isArray(front.decisions) ? front.decisions : []) {
    if (!/^D-\d+$/.test(raw)) problems.push(`${file}: 결정 ID 모양이 아니다 — "${raw}"`);
    else if (!decisions.has(raw)) problems.push(`${file}: ${raw}이(가) ${DECISION_LOG}에 없다`);
  }
  for (const raw of Array.isArray(front.source) ? front.source : []) {
    const parsed = parseSource(raw);
    if (!parsed) {
      problems.push(`${file}: source는 "<경로>.md §<번호> <제목>" 모양 — "${raw}"`);
      continue;
    }
    if (!existsSync(path.join(DESIGN_DIR, parsed.file))) {
      problems.push(`${file}: 기획서 "${parsed.file}"이 없다`);
      continue;
    }
    if (parsed.section === "") problems.push(`${file}: source에 절(§…)이 없다 — "${raw}"`);
    else if (!sectionExists(parsed.file, parsed.section))
      problems.push(`${file}: "${parsed.file}"에 "${parsed.section}" 절이 없다`);
  }
}

function checkBody(entry) {
  const { file, front, body } = entry;
  const title = /^# (.+)$/m.exec(body)?.[1]?.trim();
  if (title !== front.title) problems.push(`${file}: 본문 제목("${title ?? ""}")과 머리 칸 title이 다르다`);
  const oneLine = /^>\s*\*\*한 줄\*\*:\s*(.+)$/m.exec(body)?.[1]?.trim();
  if (!oneLine) problems.push(`${file}: "> **한 줄**: …" 한 문장이 없다`);
  // 머리 칸 status와 본문의 "지금" 줄이 어긋나면 플레이어에게 거짓말이 된다
  const nowLine = /^\*\*지금\*\*:\s*(.+)$/m.exec(body)?.[1]?.trim();
  const statusLabel = Object.hasOwn(STATUS_LABELS, front.status ?? "") ? STATUS_LABELS[front.status] : "";
  if (!nowLine) problems.push(`${file}: "**지금**: <상태> — <한 마디>" 줄이 없다`);
  else if (statusLabel !== "" && !nowLine.startsWith(statusLabel)) {
    problems.push(`${file}: "지금" 줄이 머리 칸 status(${statusLabel})로 시작하지 않는다 — "${nowLine}"`);
  }
  const found = sectionsOf(entry);
  const allowed = SECTIONS.map((section) => section.name);
  for (const section of SECTIONS) {
    if (section.required && !found.includes(section.name))
      problems.push(`${file}: "## ${section.name}"이 없다`);
  }
  let last = -1;
  for (const name of found) {
    const at = allowed.indexOf(name);
    if (at === -1) {
      problems.push(`${file}: 쓸 수 없는 제목 "## ${name}" (쓸 수 있는 것: ${allowed.join(", ")})`);
      continue;
    }
    if (at < last) problems.push(`${file}: 제목 차례가 규칙과 다르다 — "## ${name}"`);
    last = at;
  }
  if (body.includes("[[")) problems.push(`${file}: [[…]] 링크는 깃허브가 그리지 않는다`);
  for (const [, target] of stripFences(body).matchAll(/]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:)/.test(target)) continue;
    if (target.includes("#")) {
      problems.push(`${file}: 앵커(#)를 쓰지 않는다 — "${target}"`);
      continue;
    }
    if (!existsSync(path.join(path.dirname(file), target)))
      problems.push(`${file}: 링크가 가리키는 파일이 없다 — "${target}"`);
  }
}

/** 손으로 쓴 다른 위키 문서(규칙·길잡이·시작) — 링크만 본다 */
function checkPlainFile(file) {
  const body = stripFences(readFileSync(file, "utf8"));
  for (const [, target] of body.matchAll(/]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:)/.test(target)) continue;
    if (target.includes("#")) {
      problems.push(`${file}: 앵커(#)를 쓰지 않는다 — "${target}"`);
      continue;
    }
    if (!existsSync(path.join(path.dirname(file), target))) {
      problems.push(`${file}: 링크가 가리키는 파일이 없다 — "${target}"`);
    }
  }
}

/** 위키 폴더의 손으로 쓴 문서 목록(자동 생성물은 뺀다) */
function plainFiles() {
  const generated = new Set(["index.md", "categories.md", "terms.md"]);
  const top = existsSync(WIKI_DIR)
    ? readdirSync(WIKI_DIR)
        .filter((name) => name.endsWith(".md") && !generated.has(name))
        .map((name) => path.join(WIKI_DIR, name))
    : [];
  const guides = existsSync(GUIDES_DIR)
    ? readdirSync(GUIDES_DIR)
        .filter((name) => name.endsWith(".md"))
        .map((name) => path.join(GUIDES_DIR, name))
    : [];
  return [...top, ...guides];
}

const decisions = readDecisions();
const seen = new Map();
for (const file of plainFiles()) checkPlainFile(file);
for (const entry of entries) {
  problems.push(...entry.problems);
  if (entry.problems.length > 0) continue;
  checkFront(entry, seen);
  checkSources(entry, decisions);
  checkBody(entry);
}

if (problems.length > 0) fail(problems);

if (process.argv.includes("--stale")) {
  const lines = [];
  for (const entry of entries) {
    for (const id of Array.isArray(entry.front.decisions) ? entry.front.decisions : []) {
      const block = decisions.get(id) ?? "";
      const hit = block.split("\n").find((line) => line.includes("대체"));
      if (hit) lines.push(`${entry.file}: ${id} — ${hit.trim().slice(0, 120)}`);
    }
  }
  if (lines.length === 0) console.log("✓ 인용한 결정에 대체 표시가 없다");
  else
    console.log(
      [
        "다시 볼 항목 (인용한 결정에 '대체' 표시가 있다. 기획서와 맞춰 보고 checked를 새로 적는다):",
        ...lines,
      ].join("\n"),
    );
}

console.log(`✓ 위키 검사 통과 (항목 ${entries.length}개)`);
