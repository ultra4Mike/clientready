"use client";

import { lateFeeRulesFromRow, lateFeeRulesToRow } from "@/lib/late-fees";
import PlanSection from "@/components/PlanSection";
import PushSettings from "@/components/PushSettings";
import PaymentMethodsSettings from "@/components/PaymentMethodsSettings";
import TimezoneCombobox from "@/components/TimezoneCombobox";
import LegalLinks from "@/components/LegalLinks";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import StripeSetup from "@/components/StripeSetup";
import AppShell from "@/components/AppShell";
import PageHeader from "@/components/PageHeader";

const emptyProfile = {
  businessName: "",
  ownerName: "",
  email: "",
  phone: "",
  address: "",
  website: "",
  paymentTerms: "Payment is due within 14 days.",
  taxId: "",
  logo: "",
  paymentLink: "",
  setAsidePercent: "30",
  profitAlertMargin: "20",
  overtimeHours: "40",
  lateFeeType: "off",
  lateFeeValue: "",
  lateFeeGraceDays: "0",
  lateFeeMax: "",
  lateFeeMinBalance: "",
  lateFeeRepeatDays: "",
  reviewLink: "",
};

export default function ProfilePage() {
  const [profile, setProfile] = useState(emptyProfile);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [timezone, setTimezone] = useState("America/Chicago");

  useEffect(() => {
    async function load() {
      const raw = window.localStorage.getItem("clientready-profile");
      const local = raw ? { ...emptyProfile, ...JSON.parse(raw) } : emptyProfile;
      setProfile(local);
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago");

      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      setLoginEmail(user.email || "");

      const { data: row } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (!row) return;
      if (typeof row.timezone === "string" && row.timezone) setTimezone(row.timezone);
      setProfile({
        businessName: row.business_name || "",
        ownerName: row.owner_name || "",
        email: row.email || "",
        phone: row.phone || "",
        address: row.address || "",
        website: row.website || "",
        paymentTerms: row.payment_terms || "Payment is due within 14 days.",
        taxId: row.tax_id || "",
        logo: row.logo || "",
        paymentLink: row.payment_link || "",
        setAsidePercent: (typeof row.set_aside_percent === "string" && row.set_aside_percent.trim()) || local.setAsidePercent || "30",
        profitAlertMargin: (typeof row.profit_alert_margin === "string" && row.profit_alert_margin.trim()) || (local.profitAlertMargin ?? "20"),
        overtimeHours: (typeof row.overtime_hours === "string" && row.overtime_hours.trim()) || (local.overtimeHours ?? "40"),
        lateFeeType: row.late_fee_type || local.lateFeeType || "off",
        lateFeeValue: row.late_fee_value ?? local.lateFeeValue ?? "",
        lateFeeGraceDays: row.late_fee_grace_days ?? local.lateFeeGraceDays ?? "0",
        ...(row.late_fee_rules && Object.keys(row.late_fee_rules).length ? lateFeeRulesFromRow(row.late_fee_rules) : { lateFeeMax: local.lateFeeMax || "", lateFeeMinBalance: local.lateFeeMinBalance || "", lateFeeRepeatDays: local.lateFeeRepeatDays || "" }),
        reviewLink: row.review_link ?? local.reviewLink ?? "",
      });
    }

    load();
  }, []);

  function update(field: keyof typeof emptyProfile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function handleLogo(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => update("logo", String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const pct = String(profile.setAsidePercent ?? "").trim();
    if (pct !== "" && !(/^\d+(\.\d+)?$/.test(pct) && Number(pct) <= 100)) {
      setMessage("Set aside must be a number from 0 to 100.");
      return;
    }
    window.localStorage.setItem("clientready-profile", JSON.stringify(profile));

    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      const row = {
        id: user.id,
        business_name: profile.businessName,
        owner_name: profile.ownerName,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
        website: profile.website,
        tax_id: profile.taxId,
        payment_terms: profile.paymentTerms,
        payment_link: profile.paymentLink,
        logo: profile.logo,
        updated_at: new Date().toISOString(),
      };
      const lateFees = { late_fee_type: profile.lateFeeType, late_fee_value: profile.lateFeeValue, late_fee_grace_days: profile.lateFeeGraceDays };
      let { error } = await supabase.from("profiles").upsert({ ...row, ...lateFees, late_fee_rules: lateFeeRulesToRow(profile), review_link: profile.reviewLink });
      // Before migration 20261017100000 (late_fee_rules): save without the rules (they stay on this device).
      if (error && /late_fee_rules/.test(error.message || "")) ({ error } = await supabase.from("profiles").upsert({ ...row, ...lateFees, review_link: profile.reviewLink }));
      // Before migration 20261015150000 (review_link) runs: save without it (the link stays on this device).
      if (error && /review_link/.test(error.message || "")) ({ error } = await supabase.from("profiles").upsert({ ...row, ...lateFees }));
      // Before migration 20261015120000 runs there are no late fee columns: save the rest (late fees stay on this device).
      if (error && /late_fee/.test(error.message || "")) ({ error } = await supabase.from("profiles").upsert(row));
      // Set-aside % and profit alert margin (migration 20261020090000). Ignored quietly before it runs (they stay on this device).
      // set_aside_percent is an original profiles column; profit_alert_margin needs migration 20261020090000.
      if (!error) {
        const money = await supabase.from("profiles").update({ set_aside_percent: String(profile.setAsidePercent ?? ""), profit_alert_margin: String(profile.profitAlertMargin ?? "") }).eq("id", user.id);
        // Overtime hours (migration 20261021090000): its own update so an older database still saves the rest.
        await supabase.from("profiles").update({ overtime_hours: String(profile.overtimeHours ?? "") }).eq("id", user.id);
        if (money.error && /profit_alert_margin/.test(money.error.message || "")) await supabase.from("profiles").update({ set_aside_percent: String(profile.setAsidePercent ?? "") }).eq("id", user.id);
      }
      if (error) {
        setMessage("Saved on this computer. Cloud save failed: " + error.message);
        setSaved(true);
        return;
      }
      // Business timezone (card payment dates). Ignored quietly before migration 20261015130000 adds the column.
      await supabase.from("profiles").update({ timezone }).eq("id", user.id);
      setMessage("Saved on this computer and in your account.");
    } else {
      setMessage("Saved on this computer. Log in to save to your account.");
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordMessage("");
    if (nextPassword.length < 6) {
      setPasswordMessage("Use at least 6 characters.");
      return;
    }
    const { error: check } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: currentPassword,
    });
    if (check) {
      setPasswordMessage("Current password is wrong.");
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) {
      setPasswordMessage(error.message);
      return;
    }
    setCurrentPassword("");
    setNextPassword("");
    setPasswordMessage("Password updated.");
  }

  return (
    <AppShell title="Settings">
      <PageHeader title="Settings" subtitle="Your business details, how customers pay you, and your login." />
      <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav className="print-hide hidden lg:block">
          <div className="sticky top-20 space-y-1 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-2 text-sm font-medium">
            <a href="#business" className="block rounded-lg px-3 py-2 transition hover:bg-teal-500/10">Business info</a>
            <a href="#payments" className="block rounded-lg px-3 py-2 transition hover:bg-teal-500/10">Payments &amp; logo</a>
            <a href="#password" className="block rounded-lg px-3 py-2 transition hover:bg-teal-500/10">Login password</a>
          </div>
        </nav>
        <div className="min-w-0">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6"
      >
        <h1 className="text-xl font-bold tracking-tight">Your business details</h1>
        <p className="text-sm text-[var(--cr-muted)]">
          Payment instructions print on customer invoices. This is not a card processor.
        </p>
        <div id="business" className="scroll-mt-24 grid gap-4 rounded-xl border border-teal-500/20 p-4 sm:grid-cols-2 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600 sm:col-span-2">Business info</h2>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Business name
          <input name="businessName" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Business name" value={profile.businessName} onChange={(event) => update("businessName", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Your name
          <input name="ownerName" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Your name" value={profile.ownerName} onChange={(event) => update("ownerName", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Business email
          <input name="email" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Business email" value={profile.email} onChange={(event) => update("email", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Phone
          <input name="phone" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Phone" value={profile.phone} onChange={(event) => update("phone", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Address
          <input name="address" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Address" value={profile.address} onChange={(event) => update("address", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Website
          <input name="website" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Website" value={profile.website} onChange={(event) => update("website", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Tax ID / EIN
          <input name="taxId" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Tax ID / EIN" value={profile.taxId} onChange={(event) => update("taxId", event.target.value)} />
        </label>
        <TimezoneCombobox value={timezone} onChange={setTimezone} address={profile.address} />
        <label className="block text-sm font-medium text-[var(--cr-muted)] sm:col-span-2">
          Default payment terms
          <textarea name="paymentTerms" className="mt-1.5 min-h-24 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Default payment terms" value={profile.paymentTerms} onChange={(event) => update("paymentTerms", event.target.value)} />
        </label>
        </div>
        <div id="payments" className="scroll-mt-24 space-y-3 rounded-xl border border-teal-500/20 p-4 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Payments, savings & logo</h2>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          How customers pay you
          <input name="paymentLink" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Venmo, Cash App, Zelle, or a payment URL" value={profile.paymentLink} onChange={(event) => update("paymentLink", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Set aside % of profit
          <input name="setAsidePercent" data-testid="set-aside-percent" type="number" min={0} max={100} step="any" inputMode="decimal" className="mt-1.5 min-h-11 w-full max-w-[10rem] tabular-nums rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="30" value={profile.setAsidePercent} onChange={(event) => update("setAsidePercent", event.target.value)} />
        </label>
        <p className="-mt-1 text-xs text-[var(--cr-muted)]">Default is 30%. This is a cushion for taxes. It is not a tax return.</p>
        {/* Backlog 10: less-used settings live under one fold so the main settings stay short. */}
        <details className="rounded-xl border border-teal-500/20 p-3" data-testid="more-settings">
          <summary className="cursor-pointer text-sm font-semibold">More settings <span className="font-normal text-xs text-[var(--cr-muted)]">profit alerts, overtime warning, late fees</span></summary>
        <div className="mt-3 space-y-4">
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Profit alert below % left after job costs
          <input name="profitAlertMargin" data-testid="profit-alert-margin" inputMode="numeric" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="20" value={profile.profitAlertMargin} onChange={(event) => update("profitAlertMargin", event.target.value)} />
        </label>
        <p className="-mt-1 text-xs text-[var(--cr-muted)]">Jobs under this margin, jobs that lose money, and jobs where the crew spent more than your costs are flagged on the invoice and dashboard. 0 turns off the margin alert (losses are always flagged). Only you see this.</p>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Overtime warning above hours per week
          <input name="overtimeHours" data-testid="overtime-hours" type="number" min={0} max={168} inputMode="numeric" className="mt-1.5 min-h-11 w-full max-w-[10rem] tabular-nums rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="40" value={profile.overtimeHours} onChange={(event) => update("overtimeHours", event.target.value)} />
        </label>
        <p className="-mt-1 text-xs text-[var(--cr-muted)]">A warning only, per worker, Monday to Sunday, when scheduling and on Timesheets. Pay is never changed. 0 turns it off.</p>
        <fieldset className="space-y-2" data-testid="late-fee-settings">
          <legend className="text-sm font-medium text-[var(--cr-muted)]">Late fee (suggested only, you add it yourself)</legend>
          <div className="grid grid-cols-3 gap-2">
            <select name="lateFeeType" aria-label="Late fee type" data-testid="late-fee-type" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm" value={profile.lateFeeType} onChange={(event) => update("lateFeeType", event.target.value)}>
              <option value="off">Off</option>
              <option value="flat">Flat $</option>
              <option value="percent">% of unpaid</option>
            </select>
            <input name="lateFeeValue" aria-label="Late fee amount" data-testid="late-fee-value" inputMode="decimal" placeholder={profile.lateFeeType === "percent" ? "5" : "25"} className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm" value={profile.lateFeeValue} onChange={(event) => update("lateFeeValue", event.target.value)} disabled={profile.lateFeeType === "off"} />
            <input name="lateFeeGraceDays" aria-label="Grace days after due date" data-testid="late-fee-grace" inputMode="numeric" placeholder="Grace days" className="rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm" value={profile.lateFeeGraceDays} onChange={(event) => update("lateFeeGraceDays", event.target.value)} disabled={profile.lateFeeType === "off"} />
          </div>
          {profile.lateFeeType !== "off" && (
            <div className="grid grid-cols-3 gap-2" data-testid="late-fee-rules">
              <label className="text-xs text-[var(--cr-muted)]">Max total $<input name="lateFeeMax" data-testid="late-fee-max" inputMode="decimal" placeholder="No cap" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm" value={profile.lateFeeMax} onChange={(event) => update("lateFeeMax", event.target.value)} /></label>
              <label className="text-xs text-[var(--cr-muted)]">Only if unpaid ≥ $<input name="lateFeeMinBalance" data-testid="late-fee-min" inputMode="decimal" placeholder="Any" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm" value={profile.lateFeeMinBalance} onChange={(event) => update("lateFeeMinBalance", event.target.value)} /></label>
              <label className="text-xs text-[var(--cr-muted)]">Again every (days)<input name="lateFeeRepeatDays" data-testid="late-fee-repeat" inputMode="numeric" placeholder="Once" className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm" value={profile.lateFeeRepeatDays} onChange={(event) => update("lateFeeRepeatDays", event.target.value)} /></label>
            </div>
          )}
          <p className="text-xs text-[var(--cr-muted)]">After the due date plus grace days, an unpaid invoice shows a suggested late fee. Nothing is added or sent unless you tap it.</p>
        </fieldset>
        </div>
        </details>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Review link
          <input name="reviewLink" type="url" inputMode="url" autoComplete="url" data-testid="review-link" className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="https://g.page/r/your-business/review" value={profile.reviewLink} onChange={(event) => update("reviewLink", event.target.value)} />
          <span className="mt-1 block text-xs">After an invoice is paid, you can open a ready-made review request in your own text or email app. Nothing is sent for you.</span>
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Logo
          <input type="file" accept="image/*" className={`mt-1.5 block w-full rounded-lg border border-dashed border-teal-500/40 p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-teal-500 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-slate-950! ${profile.logo ? "text-[var(--cr-muted)]/60 text-xs" : ""}`} onChange={(event) => handleLogo(event.target.files?.[0])} />
        </label>
        {profile.logo && <img src={profile.logo} alt="Business logo" className="h-16 w-auto rounded-lg border border-teal-500/20 bg-white p-1" />}
        <StripeSetup />
        </div>
        <button type="submit" className="w-full rounded-lg bg-teal-500 px-6 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50 sm:w-auto">
          {saved ? "Saved" : "Save profile"}
        </button>
        {message && <p className="rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-[var(--cr-muted)]">{message}</p>}
      </form>

      <PaymentMethodsSettings />

      <PlanSection />

      <form id="password" onSubmit={changePassword} className="scroll-mt-24 mt-6 space-y-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6">
        <h2 className="text-lg font-bold tracking-tight">Login password</h2>
        <p className="text-sm text-[var(--cr-muted)]">Login email: {loginEmail || "Not signed in"}</p>
        <input type="password" name="currentPassword" aria-label="Current password" autoComplete="current-password" className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        <input type="password" name="newPassword" aria-label="New password" autoComplete="new-password" className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="New password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
        <button type="submit" className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50 w-full sm:w-auto">Update password</button>
        {passwordMessage && <p className="rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-[var(--cr-muted)]">{passwordMessage}</p>}
      </form>

      <PushSettings />

      <section id="delete-account" className="scroll-mt-24 mt-6 rounded-2xl border border-rose-500/40 bg-rose-500/5 p-4 shadow-sm sm:p-6" data-testid="settings-delete">
        <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight text-rose-700 dark:text-rose-300"><span aria-hidden="true">⚠️</span>Delete account</h2>
        <p className="mt-1 text-sm text-[var(--cr-muted)]">Permanently delete your login and all your business data.</p>
        <a href="/account/delete" className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-rose-500/60 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-600 hover:text-white dark:text-rose-300" data-testid="settings-delete-open">Delete account</a>
      </section>
        </div>
      </div>
      <div data-testid="settings-legal" className="mt-6 flex items-center gap-3 border-t border-teal-500/15 pt-4 text-sm">
        <span className="font-medium text-[var(--cr-muted)]">Legal</span>
        <LegalLinks className="text-sm" />
      </div>
    </AppShell>
  );
}