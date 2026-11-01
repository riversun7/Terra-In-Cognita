// 49 설정 칸 목록(JSON) 만들기 — 기획 D-462(질문 207 다), docs/adr/2026-11-01-dev-settings-panel.md "바뀜: D-462".
// 기획 미러 docs/design/40_Systems/49_Settings.md의 칸 표(| T1 | 설정 칸 | 무엇을 정하나 | 단위 | 출발값 | 근거 | 비고 |)를 읽어
// 개발자 설정 칸 패널(/dev/tuning)의 "49 칸 중 N개 연결" 목록이 읽는 JSON을 만든다. 손으로 고치지 않는다(다시 만든다).
// 9장 충돌 처리(X1~X16)는 칸이 아니라 판단 기록이라 넣지 않는다.
// 사용: pnpm settings:cells          — JSON을 다시 쓴다
//       pnpm settings:cells --check  — 49와 JSON이 다르면 종료 코드 1(시험 scripts/build-settings-cells.test.mjs도 같은 것을 본다)
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const SOURCE = "docs/design/40_Systems/49_Settings.md";
export const TARGET = "apps/game/src/editor/tuning/settingsCells.json";

/** 표 한 줄을 칸으로 나눈다(\| 는 칸 안의 글자). 앞뒤 빈 칸은 뺀다 */
function splitRow(line) {
  const cells = [];
  let current = "";
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (char === "\\" && line[index + 1] === "|") {
      current += "|";
      index += 1;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  return cells.slice(1, -1);
}

const CODE = /^[A-Z][0-9]{1,2}$/;
/** 출발값이 없다: 출발값 칸이 —로 시작하거나 비고에 "출발값 없음" */
const noValueOf = (start, note) => start.startsWith("—") || note.includes("출발값 없음");

/** 49 문서(마크다운) → 칸 목록. 같은 코드가 두 번 나오거나 칸 수가 틀리면 던진다 */
export function parseSettingsCells(markdown) {
  const cells = [];
  const seen = new Set();
  let section = "";
  for (const line of markdown.split("\n")) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    if (!line.startsWith("| ")) continue;
    const row = splitRow(line);
    const code = row[0] ?? "";
    if (!CODE.test(code) || code.startsWith("X")) continue;
    if (row.length !== 7) throw new Error(`${code}: 칸이 7개가 아닙니다(${row.length}개)`);
    if (seen.has(code)) throw new Error(`${code}: 두 번 나옵니다`);
    seen.add(code);
    const [, name, what, unit, start, basis, note] = row;
    cells.push({ code, section, name, what, unit, start, basis, noValue: noValueOf(start, note) });
  }
  return cells;
}

/** 쓰는 JSON 글(Biome 포맷과 같은 모양: JSON.stringify 두 칸 들여쓰기 + 줄바꿈) */
export function settingsCellsJson(markdown) {
  const document = {
    source: SOURCE,
    generator: "scripts/build-settings-cells.mjs",
    cells: parseSettingsCells(markdown),
  };
  return `${JSON.stringify(document, null, 2)}\n`;
}

function main(argv) {
  const text = settingsCellsJson(readFileSync(`${ROOT}${SOURCE}`, "utf8"));
  const target = `${ROOT}${TARGET}`;
  if (argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(target, "utf8");
    } catch {
      current = "";
    }
    if (current !== text) {
      console.error(`✗ ${TARGET}이(가) ${SOURCE}와 다릅니다 → pnpm settings:cells`);
      return 1;
    }
    console.log("✓ 49 설정 칸 목록이 최신입니다");
    return 0;
  }
  writeFileSync(target, text);
  console.log(`✓ ${TARGET} (${JSON.parse(text).cells.length}칸)`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exit(main(process.argv));
