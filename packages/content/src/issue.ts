// 검증 결과 한 건 — 검사 스크립트, 서버 시작, (나중에) 편집기가 같은 모양으로 보여준다

/** 검증 단계 (PLAN 7장): 1 스키마, 2 참조 무결성, 4a ID 변경표, 4b 이전 버전 호환 */
export type ContentStage = "schema" | "references" | "idChanges" | "compat";

export interface ContentIssue {
  stage: ContentStage;
  /** error는 실패, warning은 알리기만 한다 */
  level: "error" | "warning";
  /** 팩 폴더 안의 파일 이름 (예: items.json) */
  file?: string;
  /** 문제가 있는 항목의 ID */
  id?: string;
  /** 항목(또는 파일) 안의 위치 (예: name.en, cost[0].item) */
  path?: string;
  /** JSON 문법 오류 위치 (1부터) */
  line?: number;
  column?: number;
  /** "문제. 고칠 방법." 형식의 한국어 문장 */
  message: string;
}

export const STAGE_LABELS: Readonly<Record<ContentStage, string>> = {
  schema: "스키마",
  references: "참조",
  idChanges: "변경표",
  compat: "호환",
};

/**
 * 한 줄로 보여준다: `✗ [단계] 파일 › ID › 경로: 문제. 고칠 방법.`
 * @param location 파일 이름 앞에 붙일 팩 폴더 경로 (예: "content/core/")
 */
export function formatIssue(issue: ContentIssue, location = ""): string {
  const mark = issue.level === "error" ? "✗" : "!";
  let file = issue.file === undefined ? undefined : `${location}${issue.file}`;
  if (file !== undefined && issue.line !== undefined) {
    file += `:${issue.line}${issue.column === undefined ? "" : `:${issue.column}`}`;
  }
  const where = [file, issue.id, issue.path].filter((part) => part !== undefined && part !== "").join(" › ");
  return `${mark} [${STAGE_LABELS[issue.stage]}] ${where === "" ? "" : `${where}: `}${issue.message}`;
}

export function hasErrors(issues: readonly ContentIssue[]): boolean {
  return issues.some((issue) => issue.level === "error");
}
