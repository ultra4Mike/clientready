import { supabase } from "@/lib/supabase";

/** Customer satisfaction rating (migration 20261016050000). Kept outside document data so money fields never change. */
export type Rating = { stars: number; comment: string };
export type RatingTarget = { token?: string; portal?: { p: string; d: string } | null };

const args = (target: RatingTarget) => (target.portal ? { p_portal: target.portal.p, p_doc_id: target.portal.d } : { p_token: target.token || "" });

export async function getMyRating(target: RatingTarget): Promise<Rating | null> {
  const { data, error } = await supabase.rpc("get_job_rating", args(target));
  return error || !data ? null : (data as Rating);
}
export async function submitRating(target: RatingTarget, stars: number, comment: string): Promise<Rating | null> {
  const { data, error } = await supabase.rpc("submit_job_rating", { p_stars: stars, p_comment: comment.slice(0, 1000), ...args(target) });
  if (error) throw error;
  return (data as Rating) || null;
}
/** Owner view (RLS: owner_id = auth.uid()). Null when none or the table isn't there yet. */
export async function ownerRating(docId: string): Promise<(Rating & { updated_at?: string }) | null> {
  const { data, error } = await supabase.from("job_ratings").select("stars, comment, updated_at").eq("doc_id", docId).maybeSingle();
  return error || !data ? null : (data as Rating & { updated_at?: string });
}
export const starsText = (stars: number) => "★★★★★".slice(0, stars) + "☆☆☆☆☆".slice(0, 5 - stars);
