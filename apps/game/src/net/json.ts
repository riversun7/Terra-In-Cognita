// 모르는 JSON 읽기 도우미 — 서버 응답을 타입 단언 없이 한 칸씩 확인하며 읽는다

/** 객체에서 키 하나를 읽는다. 객체가 아니면 undefined */
export function field(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  const result: unknown = Reflect.get(value, key);
  return result;
}
