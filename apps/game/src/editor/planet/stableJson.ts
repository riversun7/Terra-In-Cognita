// 키를 정렬한 JSON 문자열 — 결과 기억 열쇠(미리보기 면 레벨 + 생성기 입력)와 초안이 같은지 견줄 때 쓴다.
// 객체 키는 UTF-16 코드 단위 순서로 늘 같게 정렬하고(실행 환경의 언어 설정과 무관), 배열 순서는 그대로 둔다.
// 값이 undefined인 키는 JSON.stringify처럼 뺀다(생성기 입력의 없는 범위 끝 { min: undefined }와 키가 없는 것을 같게 본다).
// 콘텐츠 패키지의 sortKeys와 같은 규칙이지만, 게임 앱이 @terra/content를 가져오지 않으려고 여기 따로 둔다(ADR 38 구현 메모).

/** 문자열 비교(UTF-16 코드 단위 순) */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** 키를 재귀로 정렬한 값(JSON으로 바꿀 수 있는 값만 다룬다) */
function sorted(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map((item) => sorted(item));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    // 지원 하한 브라우저(Firefox 114)에 toSorted가 없다. Object.keys가 방금 만든 배열이라 바로 정렬해도 된다
    // oxlint-disable-next-line unicorn/no-array-sort -- 방금 만든 배열이라 원본을 바꿔도 된다
    for (const key of Object.keys(value).sort(byCodeUnit)) {
      const item: unknown = Reflect.get(value, key);
      if (item !== undefined) result[key] = sorted(item);
    }
    return result;
  }
  return value;
}

/** 키를 정렬한 JSON 문자열. 내용이 같으면 키 순서가 달라도 같은 문자열이다 */
export function stableJson(value: unknown): string {
  return JSON.stringify(sorted(value)) ?? "null";
}
