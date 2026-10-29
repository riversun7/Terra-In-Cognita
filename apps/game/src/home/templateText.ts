// 템플릿 이름(0단계 키 template_*) — 홈 머리의 표시(dev·admin)와 편집 시트의 템플릿 칸이 쓴다. 템플릿이 늘면 타입 오류가 난다
import type { HomeTemplate } from "@terra/shared/dashboard";
import { m } from "../paraglide/messages.js";

const TEMPLATE_TEXT = {
  dt_grid: m.template_dt_grid,
  dt_inbox: m.template_dt_inbox,
  dt_timeline: m.template_dt_timeline,
  dt_city: m.template_dt_city,
  dt_brief: m.template_dt_brief,
  dt_hybrid: m.template_dt_hybrid,
} satisfies Record<HomeTemplate, () => string>;

export function templateName(template: HomeTemplate): string {
  return TEMPLATE_TEXT[template]();
}
