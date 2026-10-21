/** Feature flags (code-level, off until the owner of ClientReady decides). */
// R38: card processing fee pass-through is hidden everywhere until the user decides.
export const CARD_FEE_PASS_THROUGH = false;
// R79: Settings > Integrations (API keys; QuickBooks/Xero later) stays hidden until it's ready to launch.
export const INTEGRATIONS = process.env.NEXT_PUBLIC_FLAG_INTEGRATIONS === "1";
