// Reports & Taxes: one page with Overview / Taxes / Accountant tabs, deep links, and the old year routes redirecting.
import { readFileSync } from "node:fs";
import { CALENDAR_VIEWS, OLD_ROUTE_REDIRECTS, REPORT_TABS, reportsParams, calendarView } from "../src/lib/view-routes";

let failed = 0;
const ok = (cond: unknown, name: string) => { if (cond) console.log("ok", name); else { failed++; console.log("FAIL", name); } };

ok(JSON.stringify(REPORT_TABS.map(([k]) => k)) === '["overview","income","expenses","payroll","taxes","export"]', "six tabs in order");
ok(reportsParams("?tab=accountant").tab === "export", "old accountant links open Export");
ok(reportsParams("?tab=taxes&year=2025").tab === "taxes" && reportsParams("?tab=taxes&year=2025").year === "2025", "deep link tab + year");
ok(reportsParams("").tab === "overview" && reportsParams("").year === null, "default tab is overview");
ok(reportsParams("?tab=bogus&year=20x5").tab === "overview" && reportsParams("?tab=bogus&year=20x5").year === null, "bad params fall back");
ok(!CALENDAR_VIEWS.some(([k]) => (k as string) === "year"), "Year is gone from the Calendar switcher");
ok(calendarView("?view=year") === "week", "calendar no longer renders the year view");
ok(OLD_ROUTE_REDIRECTS.find((r) => r.source === "/year")?.destination === "/reports?tab=taxes", "/year redirects to Taxes");

const cfg = readFileSync("next.config.ts", "utf8");
ok(/source: "\/calendar", has: \[\{ type: "query" as const, key: "view", value: "year" \}\], destination: "\/reports\?tab=taxes"/.test(cfg), "/calendar?view=year redirects to Taxes");
const cal = readFileSync("src/app/calendar/page.tsx", "utf8");
ok(!cal.includes("YearView") && cal.includes('window.location.replace(`/reports?tab=taxes'), "calendar client fallback redirect");
const nav = readFileSync("src/components/MobileNav.tsx", "utf8");
ok(nav.includes('{ href: "/reports", label: "Reports & Taxes" }') && /label: "Money", links: \[[^\]]*"\/reports"/.test(nav), "menu: Reports & Taxes under Money");

const page = readFileSync("src/app/reports/page.tsx", "utf8");
ok(page.includes('title="Reports & Taxes"'), "page title");
ok(page.includes("<YearView embedded year={year} onData={setYearData}") && (page.match(/<YearView /g) || []).length === 1, "one YearView (shared year) feeds the totals and is the packet");
ok(page.includes('<div hidden={tab !== "export"} data-testid="year-packet-wrap">') && page.includes('data-testid="reports-accountant" className="space-y-3 print:hidden"'), "print shows only the cover + packet");
for (const id of ["pl-cards", "month-chart", "reports-income", "inc-kept-separate", "reports-expenses", "exp-uncategorized", "reports-payroll", "pay-nec", "sched-c", "quarterly", "sales-tax", "checklist", "not-covered", "packet-cover", "reports-help", "reports-disclaimer"]) ok(page.includes(`data-testid="${id}"`), `has ${id}`);
for (const id of ["inc-payments", "inc-clients", "exp-job-costs", "exp-crew-receipts", "exp-lines", "pay-workers", "quarterly-table", "sales-tax-table", "report-jobs-table"]) ok(page.includes(`testid="${id}"`), `sortable/filterable table ${id}`);
ok(page.includes("<BusinessExpenses ") && page.includes("business, bizOcc)"), "business expenses on Expenses and in the zip");
ok((page.match(/data-testid="report-year"/g) || []).length === 1, "one shared year picker");
ok(page.includes("useState<ReportTab | null>(null)") && page.includes('{!tab && <p data-testid="reports-loading"'), "no flash: no tab body until the URL tab is read");
const order = ["reports-overview", "report-months", "best-customers", "reports-taxes", "sched-c", "tax-categories", "not-covered", "reports-accountant", "report-export-accountant", "report-export-months", "report-export-jobs"].map((id) => page.indexOf(`data-testid="${id}"`));
ok(order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])), "sections sit in their tabs; testids kept");
ok(/flex flex-wrap items-center gap-3 print:hidden/.test(page) && page.includes('<div className="print:hidden"><PageHeader'), "print shows only the Taxes packet (header, tabs, picker hidden)");
const yv = readFileSync("src/components/views/YearView.tsx", "utf8");
ok(yv.includes("const year = yearProp ?? yearOwn;") && yv.includes("{!embedded && <input"), "YearView uses the page year when embedded");

console.log(failed ? `${failed} failed` : "all passed");
if (failed) process.exit(1);
