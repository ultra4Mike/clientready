import { DOC_BASE_KEY, writeBases } from "@/lib/three-way";
import { markFetched } from "@/lib/sync-status";
import { clientFromRow, readCachedClients } from "@/lib/client-rows";
import { supabase } from "@/lib/supabase";
import { fetchCloudDocuments, type CloudDoc } from "@/lib/cloud-docs";
import { flushDeletes } from "@/lib/doc-tombstones";

/** Late fee settings from the profile row; before migration 120000 (no columns) keep this device's values. */
/** Set-aside % and profit alert margin: the account value when saved there (migration 20261020090000), else this device's value. */
function moneySettings(row: Record<string, unknown>) {
  let local: Record<string, unknown> = {};
  try { local = JSON.parse(window.localStorage.getItem("clientready-profile") || "{}") || {}; } catch { local = {}; }
  const pick = (cloud: unknown, mine: unknown, fallback: string) => (typeof cloud === "string" && cloud.trim() ? cloud : typeof mine === "string" && mine.trim() ? mine : fallback);
  return { setAsidePercent: pick(row.set_aside_percent, local.setAsidePercent, "30"), profitAlertMargin: pick(row.profit_alert_margin, local.profitAlertMargin, "20"), overtimeHours: pick(row.overtime_hours, local.overtimeHours, "40") };
}

function lateFeeFields(row: Record<string, unknown>) {
  let local: Record<string, unknown> = {};
  try {
    local = JSON.parse(window.localStorage.getItem("clientready-profile") || "{}") || {};
  } catch {
    local = {};
  }
  const has = "late_fee_type" in row;
  return {
    lateFeeType: has ? row.late_fee_type || "off" : local.lateFeeType || "off",
    lateFeeValue: has ? row.late_fee_value ?? "" : local.lateFeeValue ?? "",
    lateFeeGraceDays: has ? row.late_fee_grace_days ?? "0" : local.lateFeeGraceDays ?? "0",
    reviewLink: "review_link" in row ? row.review_link ?? "" : local.reviewLink ?? "",
  };
}
import { DOCS_KEY, mergeDocs, OWNER_KEY, parkDocsFor, parkUnsyncedDocs, syncLocalDocs, takeParkedDocs } from "@/lib/doc-sync";

const keys = [
  "clientready-profile",
  "clientready-clients",
  "clientready-documents",
  "clientready-employees",
  "clientready-open-document",
  "clientready-new-type",
  "clientready-clock-entries",
  "clientready-unsynced-ids",
  "clientready-id-remap",
  "clientready-deleted-docs",
  "clientready-pending-deletes",
  "clientready-packages",
  "clientready-mileage",
  "clientready-inventory",
  "clientready-payment-methods",
  "clientready-followups-opened",
  DOC_BASE_KEY,
];


/** Wipes the business cache (sign-out). Never-uploaded documents are parked for the same account first. */
export function clearLocalBusiness() {
  parkUnsyncedDocs();
  keys.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.removeItem(OWNER_KEY);
}

function readLocalDocs(): CloudDoc[] {
  try {
    const raw = window.localStorage.getItem(DOCS_KEY);
    return raw ? (JSON.parse(raw) as CloudDoc[]) : [];
  } catch {
    return [];
  }
}

/**
 * Refreshes the local cache from Supabase without ever deleting local work:
 * - Signed out, or any fetch fails: local data is left exactly as it is.
 * - Same account (or a cache with no owner yet): cloud and local documents are merged by id
 *   (newer updatedAt wins) and local-only/newer documents are uploaded.
 * - A different account signs in: the previous account's never-uploaded documents are parked
 *   under that account, and this account starts from its own cloud data only.
 */
let inFlight: Promise<boolean> | null = null;
export async function loadAccountIntoCache(): Promise<boolean> {
  // Callers at the same moment (page + sync pill) share one server fetch.
  if (!inFlight) inFlight = loadAccountOnce().catch(() => false).then((ok) => { markFetched(ok); return ok; }).finally(() => { inFlight = null; });
  return inFlight;
}

// Speed audit #4: every profile column except the (large, base64) logo; the logo is fetched only when the
// profile changed since it was cached. Older databases missing a column fall back to select("*").
const PROFILE_COLUMNS = "id,business_name,owner_name,email,phone,address,website,payment_terms,tax_id,payment_link,set_aside_percent,updated_at,late_fee_type,late_fee_value,late_fee_grace_days,timezone,review_link,packages,mileage,inventory,payment_methods,late_fee_rules,plan,subscription_status,plan_period_end,cancel_at_period_end,stripe_customer_id,stripe_subscription_id,subscription_event_at,profit_alert_margin,overtime_hours,automations,api_enabled,trial_exempt";
async function fetchProfile(userId: string, switching: boolean) {
  const first = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("id", userId).maybeSingle();
  if (first.error) return supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const row = first.data as Record<string, unknown> | null;
  if (!row) return first;
  let cached: { logo?: string; logoAt?: string } = {};
  try { cached = switching ? {} : JSON.parse(window.localStorage.getItem("clientready-profile") || "{}"); } catch { cached = {}; }
  if (cached.logoAt && cached.logoAt === String(row.updated_at || "")) return { data: { ...row, logo: cached.logo || "" }, error: null };
  const logo = await supabase.from("profiles").select("logo").eq("id", userId).maybeSingle();
  return { data: { ...row, logo: (logo.data as { logo?: string } | null)?.logo || "" }, error: null };
}

async function loadAccountOnce(): Promise<boolean> {
  // Speed audit #1: the stored session (no network trip), then profile / clients / team / deletes+documents in parallel.
  const { data: sessionData } = await supabase.auth.getSession();
  let user = sessionData.session?.user || null;
  if (!user) {
    const { data, error: userError } = await supabase.auth.getUser();
    if (userError || !data.user) return false;
    user = data.user;
  }
  const owner = window.localStorage.getItem(OWNER_KEY);
  const switching = Boolean(owner && owner !== user.id);
  const uid = user.id;
  const [{ data: profile, error: profileError }, { data: clients, error: clientsError }, , cloud] = await Promise.all([
    fetchProfile(uid, switching),
    supabase.from("clients").select("*").eq("user_id", uid),
    refreshEmployeesCache(uid),
    // Deletes made offline go first, then nothing deleted (here or on another device) is merged back in.
    flushDeletes(uid).then(() => fetchCloudDocuments(uid)),
  ]);
  if (profileError) return false;
  if (switching) window.localStorage.removeItem("clientready-profile");
  if (profile) {
    window.localStorage.setItem(
      "clientready-profile",
      JSON.stringify({
        businessName: profile.business_name || "",
        ownerName: profile.owner_name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        address: profile.address || "",
        website: profile.website || "",
        paymentTerms: profile.payment_terms || "Payment is due within 14 days.",
        taxId: profile.tax_id || "",
        logo: profile.logo || "",
        logoAt: String(profile.updated_at || ""),
        paymentLink: profile.payment_link || "",
        ...lateFeeFields(profile),
        ...moneySettings(profile),
        // Backlog 13 (migration 20261021130000): the account's automation switches; before it, this device's.
        ...("automations" in profile ? { automations: profile.automations || {} } : (() => { try { const l = JSON.parse(window.localStorage.getItem("clientready-profile") || "{}"); return l.automations ? { automations: l.automations } : {}; } catch { return {}; } })()),
      })
    );
    // Payment methods shown to customers (migration 20261016070000).
    if ("payment_methods" in profile) window.localStorage.setItem("clientready-payment-methods", JSON.stringify(profile.payment_methods || {}));
    // Job packages (migration 20261016020000): merge with this device's list; the invoice editor pushes local changes.
    if ("packages" in profile) {
      const { mergePackages, PACKAGES_KEY } = await import("@/lib/packages");
      let local: unknown = [];
      try { local = switching ? [] : JSON.parse(window.localStorage.getItem(PACKAGES_KEY) || "[]"); } catch { local = []; }
      window.localStorage.setItem(PACKAGES_KEY, JSON.stringify(mergePackages(profile.packages, local)));
    }
  }

  if (!clientsError && clients) window.localStorage.setItem(
    "clientready-clients",
    JSON.stringify(
      clients.map((row) => clientFromRow(row as Record<string, unknown>, readCachedClients()))
    )
  );

  if (!cloud) return false; // fetch failed: keep local documents untouched

  let local = readLocalDocs();
  if (switching && owner) {
    parkDocsFor(owner, local);
    local = [];
    window.localStorage.removeItem("clientready-open-document");
  }
  local = [...local, ...takeParkedDocs(user.id)];
  const { merged, pushUp } = mergeDocs(local, cloud);
  // The cloud copies just read become each document's merge base, except ones this device is about to
  // push (their base is updated after the upload succeeds).
  const pushing = new Set(pushUp.map((doc) => doc.id));
  writeBases(cloud.filter((doc) => !pushing.has(doc.id)).map((doc) => ({ id: doc.id, data: doc.data })));
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(merged));
  window.localStorage.setItem(OWNER_KEY, user.id);
  const synced = await syncLocalDocs(merged, pushUp);
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(synced));
  return true;
}

/** R81: re-read the team from the cloud into this device's cache (the crew picker must never miss an Active person). */
export async function refreshEmployeesCache(userId?: string): Promise<boolean> {
  let uid = userId;
  if (!uid) { const { data } = await supabase.auth.getUser(); uid = data.user?.id; }
  if (!uid) return false;
  const user = { id: uid };
  const { data: people, error: peopleError } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", user.id);

  if (!peopleError && people) window.localStorage.setItem(
    "clientready-employees",
    JSON.stringify(
      people.map((row) => ({
        id: row.id,
        name: row.name || "",
        email: row.email || "",
        phone: row.phone || "",
        role: row.role || "",
        kind: row.kind === "contractor" ? "contractor" : "employee",
        rate: row.rate || "",
        hireDate: row.hire_date || "",
        active: row.active !== false,
        rateHistory: row.rate_history || [],
        paySettings: row.pay_settings || {},
      }))
    )
  );
  return !peopleError && Boolean(people);
}
