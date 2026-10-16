import { supabase } from "@/lib/supabase";
import { fetchCloudDocuments, type CloudDoc } from "@/lib/cloud-docs";
import { flushDeletes } from "@/lib/doc-tombstones";

/** Late fee settings from the profile row; before migration 120000 (no columns) keep this device's values. */
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
export async function loadAccountIntoCache(): Promise<boolean> {
  const { data, error: userError } = await supabase.auth.getUser();
  const user = data.user;
  if (userError || !user) return false;
  const owner = window.localStorage.getItem(OWNER_KEY);
  const switching = Boolean(owner && owner !== user.id);

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

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
        paymentLink: profile.payment_link || "",
        setAsidePercent: profile.set_aside_percent || "30",
        ...lateFeeFields(profile),
      })
    );
  }

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", user.id);

  if (!clientsError && clients) window.localStorage.setItem(
    "clientready-clients",
    JSON.stringify(
      clients.map((row) => ({
        id: row.id,
        name: row.name || "",
        company: row.company || "",
        email: row.email || "",
        phone: row.phone || "",
        address: row.address || "",
        nextVisit: row.next_visit || "",
        visitTime: row.visit_time || "",
        notes: row.notes || "",
      }))
    )
  );

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
        phone: row.phone || "",
        role: row.role || "",
        kind: row.kind === "contractor" ? "contractor" : "employee",
        rate: row.rate || "",
        hireDate: row.hire_date || "",
        active: row.active !== false,
        rateHistory: row.rate_history || [],
      }))
    )
  );

  // Deletes made offline go first, then nothing deleted (here or on another device) is merged back in.
  // (fetchCloudDocuments drops tombstoned rows and mergeDocs drops tombstoned local copies.)
  await flushDeletes(user.id);
  const cloud = await fetchCloudDocuments();
  if (!cloud) return false; // fetch failed: keep local documents untouched

  let local = readLocalDocs();
  if (switching && owner) {
    parkDocsFor(owner, local);
    local = [];
    window.localStorage.removeItem("clientready-open-document");
  }
  local = [...local, ...takeParkedDocs(user.id)];
  const { merged, pushUp } = mergeDocs(local, cloud);
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(merged));
  window.localStorage.setItem(OWNER_KEY, user.id);
  const synced = await syncLocalDocs(merged, pushUp);
  window.localStorage.setItem(DOCS_KEY, JSON.stringify(synced));
  return true;
}
