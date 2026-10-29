// 홈 자료 조회의 입력·출력 타입이 공용 전송 타입과 같은지 — inbox.list·summary.get·dashboard.cards(ADR 2026-10-29-app-shell 6·7·8절).
// 입력 검사(Zod)는 프로시저 파일에, 기기가 보내는 모양은 @terra/shared에 따로 적혀 있어서 한쪽만 바뀌면 어긋난다
// (기기가 보낸 칸을 서버가 400으로 막거나, 서버가 공용 타입에 없는 칸을 받는다). 타입 검사(pnpm typecheck)가 이 파일을 본다.
// Zod 선택 칸은 `칸?: 값 | undefined`이고 공용 타입은 exactOptionalPropertyTypes의 `칸?: 값`이라, readonly와 선택 칸의 undefined를
// 지운 모양으로 견준다.
import type { DashboardCardsRequest, DashboardCardsResponse } from "@terra/shared/dashboard";
import type {
  InboxListRequest,
  InboxListResponse,
  SummaryGetRequest,
  SummaryGetResponse,
} from "@terra/shared/inbox";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { describe, expectTypeOf, it } from "vitest";
import type { AppRouter } from "./router.ts";

/** 견주는 모양: readonly를 떼고 선택 칸 값의 undefined를 뺀다(배열은 안쪽까지) */
type Shape<T> = T extends readonly (infer Element)[]
  ? Shape<Element>[]
  : T extends object
    ? { -readonly [K in keyof T]: Shape<Exclude<T[K], undefined>> }
    : T;

type Inputs = inferRouterInputs<AppRouter>;
type Outputs = inferRouterOutputs<AppRouter>;

/** 입력을 빼도 되는 조회의 입력 타입(void | 객체 | undefined)에서 객체 부분 */
type InputObject<T> = Extract<T, object>;

/** 서로 넣을 수 있는지(출력은 JSON 모양으로 바뀌어 글자 그대로는 같지 않다: 교차 타입이 펴지고 색인 서명 모양이 바뀐다) */
type Interchangeable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe("홈 자료 조회 타입", () => {
  it("입력: Zod 스키마 = 공용 요청 타입", () => {
    expectTypeOf<Shape<InputObject<Inputs["inbox"]["list"]>>>().toEqualTypeOf<Shape<InboxListRequest>>();
    expectTypeOf<Shape<InputObject<Inputs["summary"]["get"]>>>().toEqualTypeOf<Shape<SummaryGetRequest>>();
    expectTypeOf<Shape<Inputs["dashboard"]["cards"]>>().toEqualTypeOf<Shape<DashboardCardsRequest>>();
  });

  it("입력을 빼도 되는 조회는 빼도 된다(기기는 시안 자료가 아니면 입력 없이 부른다)", () => {
    expectTypeOf<Exclude<Inputs["inbox"]["list"], object>>().toEqualTypeOf<void | undefined>();
    expectTypeOf<Exclude<Inputs["summary"]["get"], object>>().toEqualTypeOf<void | undefined>();
  });

  it("출력: 공용 응답 타입과 서로 넣을 수 있다(JSON으로 바뀐 모양)", () => {
    expectTypeOf<
      Interchangeable<Shape<Outputs["inbox"]["list"]>, Shape<InboxListResponse>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      Interchangeable<Shape<Outputs["summary"]["get"]>, Shape<SummaryGetResponse>>
    >().toEqualTypeOf<true>();
    expectTypeOf<
      Interchangeable<Shape<Outputs["dashboard"]["cards"]>, Shape<DashboardCardsResponse>>
    >().toEqualTypeOf<true>();
  });
});
