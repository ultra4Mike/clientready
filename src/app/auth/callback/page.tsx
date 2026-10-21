"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { loadAccountIntoCache } from "@/lib/account-cache";
import { isCrewUser } from "@/lib/crew";
import { afterAuthPath, asPlan, pendingPlan } from "@/lib/pending-plan";

/** R94: where the confirm-email link lands. Crew -> /crew, owners -> dashboard (or checkout for a chosen plan). */
export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Confirming your email…");
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      if (code) await supabase.auth.exchangeCodeForSession(code).catch(() => null);
      // Implicit-flow links put the session in the #hash; the client picks it up on load.
      let { data } = await supabase.auth.getSession();
      for (let i = 0; !data.session && i < 10; i += 1) { await new Promise((done) => setTimeout(done, 300)); ({ data } = await supabase.auth.getSession()); }
      if (!data.session) { setMessage("This link has expired or was already used. Log in to continue (you can resend the confirmation there)."); return; }
      if (await isCrewUser()) { window.location.replace("/crew"); return; }
      await loadAccountIntoCache();
      window.location.replace(afterAuthPath(asPlan(params.get("plan") || "") || pendingPlan()));
    })();
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--cr-bg)] px-4">
      <div className="max-w-md rounded-2xl border border-teal-500/20 bg-[var(--cr-card)] p-6 text-center text-sm" data-testid="auth-callback">
        <p role="status">{message}</p>
        {message.startsWith("This link") && <a href="/login" className="mt-3 inline-flex min-h-11 items-center font-semibold text-teal-600 underline">Log in</a>}
      </div>
    </main>
  );
}
