import { supabase } from "@/lib/supabase";

export type TrialState = {
  expired: boolean;
  daysLeft: number;
  plan: string;
};

export async function getTrialState(): Promise<TrialState> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { expired: false, daysLeft: 14, plan: "trial" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  const plan = profile?.plan || "trial";
  if (plan === "owner" || plan === "active") {
    return { expired: false, daysLeft: 999, plan };
  }

  const started = new Date(user.created_at).getTime();
  const ends = started + 14 * 24 * 60 * 60 * 1000;
  const daysLeft = Math.max(Math.ceil((ends - Date.now()) / (24 * 60 * 60 * 1000)), 0);
  return { expired: true, daysLeft: 0, plan };
}