"use client";

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
};

export default function ProfilePage() {
  const [profile, setProfile] = useState(emptyProfile);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");

  useEffect(() => {
    async function load() {
      const raw = window.localStorage.getItem("clientready-profile");
      const local = raw ? { ...emptyProfile, ...JSON.parse(raw) } : emptyProfile;
      setProfile(local);

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
        setAsidePercent: local.setAsidePercent || "30",
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
    window.localStorage.setItem("clientready-profile", JSON.stringify(profile));

    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      const { error } = await supabase.from("profiles").upsert({
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
      });
      if (error) {
        setMessage("Saved on this computer. Cloud save failed: " + error.message);
        setSaved(true);
        return;
      }
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
    <AppShell title="Profile">
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
        className="max-w-3xl space-y-5 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:mt-6 sm:p-6"
      >
        <h1 className="text-xl font-bold tracking-tight">Your business details</h1>
        <p className="text-sm text-[var(--cr-muted)]">
          Payment instructions print on customer invoices. This is not a card processor.
        </p>
        <div id="business" className="scroll-mt-24 grid gap-4 rounded-xl border border-teal-500/20 p-4 sm:grid-cols-2 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600 sm:col-span-2">Business info</h2>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Business name
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Business name" value={profile.businessName} onChange={(event) => update("businessName", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Your name
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Your name" value={profile.ownerName} onChange={(event) => update("ownerName", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Business email
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Business email" value={profile.email} onChange={(event) => update("email", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Phone
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Phone" value={profile.phone} onChange={(event) => update("phone", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Address
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Address" value={profile.address} onChange={(event) => update("address", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Website
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Website" value={profile.website} onChange={(event) => update("website", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Tax ID / EIN
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Tax ID / EIN" value={profile.taxId} onChange={(event) => update("taxId", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)] sm:col-span-2">
          Default payment terms
          <textarea className="mt-1.5 min-h-24 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Default payment terms" value={profile.paymentTerms} onChange={(event) => update("paymentTerms", event.target.value)} />
        </label>
        </div>
        <div id="payments" className="scroll-mt-24 space-y-3 rounded-xl border border-teal-500/20 p-4 sm:p-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-teal-600">Payments, savings & logo</h2>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          How customers pay you
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Venmo, Cash App, Zelle, or a payment URL" value={profile.paymentLink} onChange={(event) => update("paymentLink", event.target.value)} />
        </label>
        <label className="block text-sm font-medium text-[var(--cr-muted)]">
          Set aside % of profit
          <input className="mt-1.5 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="30" value={profile.setAsidePercent} onChange={(event) => update("setAsidePercent", event.target.value)} />
        </label>
        <p className="-mt-1 text-xs text-[var(--cr-muted)]">Default is 30%. This is a cushion for taxes. It is not a tax return.</p>
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

      <form id="password" onSubmit={changePassword} className="scroll-mt-24 mt-6 max-w-3xl space-y-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-4 shadow-sm max-sm:border-0 max-sm:bg-transparent max-sm:p-0 max-sm:shadow-none sm:p-6">
        <h2 className="text-lg font-bold tracking-tight">Login password</h2>
        <p className="text-sm text-[var(--cr-muted)]">Login email: {loginEmail || "Not signed in"}</p>
        <input type="password" className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        <input type="password" className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2.5 text-sm outline-none transition focus:border-teal-400 focus:ring-2 focus:ring-teal-400/30" placeholder="New password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
        <button type="submit" className="rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-slate-950! shadow-sm transition hover:bg-teal-400 disabled:opacity-50 w-full sm:w-auto">Update password</button>
        {passwordMessage && <p className="rounded-lg border border-teal-500/30 px-3 py-2 text-sm text-[var(--cr-muted)]">{passwordMessage}</p>}
      </form>
        </div>
      </div>
    </AppShell>
  );
}