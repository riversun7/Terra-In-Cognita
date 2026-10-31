// economy 라우터 — 경제 화면(창고·생산·거래창·내 주문·환전) 조회. ADR 37 끝 "구현하며 정한 것 (경제·거래창 화면)".
// 응답 타입은 @terra/shared/economy. 게임 상태를 바꾸는 명령(주문·취소·생산 예약)은 넣지 않는다(WebSocket으로만, AGENTS 4장).
// preview: true는 홈과 같은 권한 home: preview(dev·admin)다(preview.ts). 아니면 FORBIDDEN, 로그인 안 했으면 UNAUTHORIZED.
// 오류(error.data.code): UNAUTHORIZED, FORBIDDEN, BAD_REQUEST(입력 형식), NOT_FOUND(data.reason unknown_item·unknown_city)
import { z } from "zod";
import { router, signedInProcedure } from "./init.ts";
import { previewField, previewRequested } from "./preview.ts";

/** 팩 ID·도시 ID 모양(주소 매개변수 규칙 id와 같다: 숫자·영문 소문자·_ 1~64자, ADR 37 1절) */
const idField = z.string().regex(/^[a-z0-9_]{1,64}$/);

const previewOnly = z.strictObject({ preview: previewField }).optional();
const itemInput = z.strictObject({ item: idField, preview: previewField });
const bookInput = z.strictObject({ item: idField, city: idField, preview: previewField });

export const economyRouter = router({
  /** 팩 목록(물건·시설·레시피·화폐·생필품). 실제 자료다 */
  catalog: signedInProcedure.query(({ ctx }) => ctx.economy.catalog()),
  /** 내 원장 잔고(+ 시안 자료) */
  holdings: signedInProcedure.input(previewOnly).query(({ ctx, input }) =>
    ctx.economy.holdings(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
  /** 시설·생산 예약·반복 예약·급여 */
  production: signedInProcedure.input(previewOnly).query(({ ctx, input }) =>
    ctx.economy.production(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
  /** 거래창 물건 목록 */
  marketItems: signedInProcedure.input(previewOnly).query(({ ctx, input }) =>
    ctx.economy.marketItems(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
  /** 물건 하나의 도시별 목록(D-6032) */
  marketCities: signedInProcedure.input(itemInput).query(({ ctx, input }) =>
    ctx.economy.marketCities(ctx.viewer, input.item, {
      preview: previewRequested(ctx.viewer, input.preview),
      now: ctx.now(),
    }),
  ),
  /** 도시 하나 × 물건 하나의 호가창·체결·봉·주문표 자료 */
  marketBook: signedInProcedure.input(bookInput).query(({ ctx, input }) =>
    ctx.economy.marketBook(ctx.viewer, input.item, input.city, {
      preview: previewRequested(ctx.viewer, input.preview),
      now: ctx.now(),
    }),
  ),
  /** 내 주문(걸린 것·끝난 것·남은 주문 수) */
  orders: signedInProcedure.input(previewOnly).query(({ ctx, input }) =>
    ctx.economy.orders(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
  /** 환전(기준 통화 짝 동시호가) */
  exchange: signedInProcedure.input(previewOnly).query(({ ctx, input }) =>
    ctx.economy.exchange(ctx.viewer, {
      preview: previewRequested(ctx.viewer, input?.preview),
      now: ctx.now(),
    }),
  ),
});
