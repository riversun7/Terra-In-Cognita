// 49 설정 칸 목록 시험 — 표 읽기 규칙과, 저장소의 JSON이 지금 49 문서와 같은지(다르면 pnpm settings:cells로 다시 만든다)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SOURCE, TARGET, parseSettingsCells, settingsCellsJson } from "./build-settings-cells.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

const SAMPLE = `# 49
## 1. 시간·유닛 (4-1)
| # | 설정 칸 | 무엇을 정하나 | 단위 | 출발값 (잠정) | 근거 | 비고 |
|---|---|---|---|---|---|---|
| T2 | 계절 | 한 해 길이 | 실제 시간 | "7시간 \\| 계절 1개" | D-091 | 구조 값 |
| T6 | 부상 회복 | 낫는 시간 | 실제 시간 | — | D-145 | 출발값 없음 |
| T10 | 보정 | 분포 | 비율 | "방향만" | D-094 | 출발값 없음 (방향만) |
## 9. 충돌 처리
| 번호 | 내용 | 판단 | 칸 |
| X1 | 수율 | 출발값 30% | P7 |
`;

describe("49 설정 칸 목록(D-462)", () => {
  it("칸 표만 읽고(X 충돌 기록 빼고) 칸 안의 \\|는 글자로, 출발값이 —이거나 비고가 '출발값 없음'이면 값 없음", () => {
    expect(parseSettingsCells(SAMPLE)).toEqual([
      {
        code: "T2",
        section: "1. 시간·유닛 (4-1)",
        name: "계절",
        what: "한 해 길이",
        unit: "실제 시간",
        start: '"7시간 | 계절 1개"',
        basis: "D-091",
        noValue: false,
      },
      expect.objectContaining({ code: "T6", noValue: true }),
      expect.objectContaining({ code: "T10", noValue: true }),
    ]);
  });

  it("코드 끝에 영문 소문자 하나가 붙은 칸(C16a 등, 기존 칸 사이에 끼운 칸)도 읽는다", () => {
    const cells = parseSettingsCells(
      "| C16a | 웨이브 결과 목표 | 목표 승률 | ‰ | 약 333‰ | D-468 | — |\n| C16ab | x | x | x | 1 | x | — |\n",
    );
    expect(cells.map((cell) => cell.code)).toEqual(["C16a"]);
  });

  it("칸 수가 틀리거나 같은 코드가 두 번이면 던진다", () => {
    expect(() => parseSettingsCells("| T1 | a | b |\n")).toThrow(/7개/);
    const row = "| T1 | a | b | c | d | e | f |\n";
    expect(() => parseSettingsCells(row + row)).toThrow(/두 번/);
  });

  it(`저장소의 ${TARGET}은 지금 ${SOURCE}에서 만든 것과 같다(다르면 pnpm settings:cells)`, () => {
    const expected = settingsCellsJson(readFileSync(`${ROOT}${SOURCE}`, "utf8"));
    expect(readFileSync(`${ROOT}${TARGET}`, "utf8")).toBe(expected);
  });
});
