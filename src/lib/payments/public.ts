import { supabase } from "@/lib/supabase";
import { readPaymentMethods, type PaymentMethodsConfig } from "@/lib/payments/providers";

/** Customer views: enabled methods for the business behind an approval token or portal token (migration 20261016070000). */
export async function fetchPublicPaymentMethods(link: { token?: string; portal?: string }): Promise<PaymentMethodsConfig> {
  const { data, error } = await supabase.rpc("get_payment_methods", link.portal ? { p_portal: link.portal } : { p_token: link.token || "" });
  if (error || !data) return {};
  const config = readPaymentMethods(Object.fromEntries(Object.entries(data as Record<string, object>).map(([key, value]) => [key, { ...value, enabled: true }])));
  return config;
}
