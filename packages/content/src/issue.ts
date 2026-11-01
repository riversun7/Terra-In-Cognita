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
  /**
   * 문제 코드(선택, 편집기가 메시지 키로 보인다 — PLAN 8장 "서버는 문장 대신 코드를 보낸다"). 스키마 단계는 Zod 문제 코드
   * (too_small·too_big·invalid_type·invalid_value·unrecognized_keys·invalid_format…)나 규칙 코드(params.rule, 예:
   * item_equip_required), 참조 단계는 ref_missing·id_duplicate·file_unknown·orphan, 아이템 검사는 item_*. 없으면 옛 검사 문구다
   */
  code?: string;
  /** 코드의 값(최솟값·최댓값·허용 값·가리킨 ID 등). 문장에 넣을 값만 */
  params?: Readonly<Record<string, string | number | boolean>>;
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
