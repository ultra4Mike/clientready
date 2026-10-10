"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "@/components/AppShell";

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
      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-8 max-w-2xl space-y-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6"
      >
        <h1 className="text-xl font-semibold">Your business details</h1>
        <p className="text-sm text-[var(--cr-muted)]">
          Payment instructions print on customer invoices. This is not a card processor.
        </p>
        <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Business name" value={profile.businessName} onChange={(event) => update("businessName", event.target.value)} />
        <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Your name" value={profile.ownerName} onChange={(event) => update("ownerName", event.target.value)} />
        <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Business email" value={profile.email} onChange={(event) => update("email", event.target.value)} />
        <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Phone" value={profile.phone} onChange={(event) => update("phone", event.target.value)} />
        <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Address" value={profile.address} onChange={(event) => update("address", event.target.value)} />
        <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Website" value={profile.website} onChange={(event) => update("website", event.target.value)} />
        <input className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Tax ID / EIN" value={profile.taxId} onChange={(event) => update("taxId", event.target.value)} />
        <textarea className="min-h-20 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Default payment terms" value={profile.paymentTerms} onChange={(event) => update("paymentTerms", event.target.value)} />
        <label className="block text-sm text-[var(--cr-muted)]">
          How customers pay you
          <input className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2 text-base" placeholder="Venmo, Cash App, Zelle, or a payment URL" value={profile.paymentLink} onChange={(event) => update("paymentLink", event.target.value)} />
        </label>
        <label className="block text-sm text-[var(--cr-muted)]">
          Set aside % of profit
          <input className="mt-1 w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2 text-base" placeholder="30" value={profile.setAsidePercent} onChange={(event) => update("setAsidePercent", event.target.value)} />
        </label>
        <p className="text-sm text-[var(--cr-muted)]">Default is 30%. This is a cushion for taxes. It is not a tax return.</p>
        <label className="block text-sm text-[var(--cr-muted)]">
          Logo
          <input type="file" accept="image/*" className="mt-1 block w-full text-sm" onChange={(event) => handleLogo(event.target.files?.[0])} />
        </label>
        {profile.logo && <img src={profile.logo} alt="Business logo" className="h-16 w-auto" />}
        <button type="submit" className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950">
          {saved ? "Saved" : "Save profile"}
        </button>
        {message && <p className="text-sm text-[var(--cr-muted)]">{message}</p>}
      </form>

      <form onSubmit={changePassword} className="mx-auto mt-6 max-w-2xl space-y-4 rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6">
        <h2 className="text-lg font-semibold">Login password</h2>
        <p className="text-sm text-[var(--cr-muted)]">Login email: {loginEmail || "Not signed in"}</p>
        <input type="password" className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="Current password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
        <input type="password" className="w-full rounded-lg border border-teal-500/30 bg-transparent px-3 py-2" placeholder="New password" value={nextPassword} onChange={(event) => setNextPassword(event.target.value)} />
        <button type="submit" className="rounded-lg bg-teal-400 px-4 py-2 text-sm font-medium text-slate-950">Update password</button>
        {passwordMessage && <p className="text-sm text-[var(--cr-muted)]">{passwordMessage}</p>}
      </form>
    </AppShell>
  );
}