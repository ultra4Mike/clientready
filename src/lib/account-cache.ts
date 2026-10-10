import { supabase } from "@/lib/supabase";
import { loadCloudDocuments } from "@/lib/cloud-docs";

const keys = [
  "clientready-profile",
  "clientready-clients",
  "clientready-documents",
  "clientready-employees",
  "clientready-open-document",
  "clientready-new-type",
];

export function clearLocalBusiness() {
  keys.forEach((key) => window.localStorage.removeItem(key));
}

export async function loadAccountIntoCache() {
  clearLocalBusiness();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

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
      })
    );
  }

  const { data: clients } = await supabase
    .from("clients")
    .select("*")
    .eq("user_id", user.id);

  window.localStorage.setItem(
    "clientready-clients",
    JSON.stringify(
      (clients || []).map((row) => ({
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

const { data: people } = await supabase
    .from("employees")
    .select("*")
    .eq("user_id", user.id);

  window.localStorage.setItem(
    "clientready-employees",
    JSON.stringify(
      (people || []).map((row) => ({
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

  const docs = await loadCloudDocuments();
  window.localStorage.setItem("clientready-documents", JSON.stringify(docs || []));
}