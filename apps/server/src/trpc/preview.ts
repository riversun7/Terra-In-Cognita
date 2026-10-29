// 시안 자료 권한 — inbox.list·summary.get·dashboard.cards의 preview(ADR 2026-10-29-app-shell 6절, 사용자 결정 2).
// preview: true는 권한 home: preview(dev·admin)가 있어야 한다. 아니면 FORBIDDEN(403)이다(기본 거부, src/auth/permissions.ts).
// preview가 없거나 false면 누구나 자기 자료를 받는다.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { rolesAllow } from "../auth/permissions.ts";
import type { Viewer } from "./context.ts";

/** 입력의 preview 칸 */
export const previewField = z.boolean().optional();

/** 시안 자료를 줄지. 요청했는데 권한이 없으면 FORBIDDEN */
export function previewRequested(viewer: Viewer, preview: boolean | undefined): boolean {
  if (preview !== true) return false;
  if (!rolesAllow(viewer.roles, { home: ["preview"] })) {
    throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN" });
  }
  return true;
}
