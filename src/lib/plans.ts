/**
 * The one place plan tiers and prices live (/plans, home page pricing, trial-ended screens).
 * PLACEHOLDER: prices are not final and there is no checkout yet. "Subscribe" shows "Coming soon".
 * Billing (e.g. Stripe) is added later; the trial lock logic in src/lib/trial.ts is unchanged.
 */
export const PRICES_ARE_PLACEHOLDERS = true;
export const TRIAL_DAYS = 14;

export type Plan = {
  id: string;
  name: string;
  price: string;
  period: string;
  blurb: string;
  features: string[];
  highlight?: boolean;
  /** No subscribe button (the free trial). */
  free?: boolean;
};

export const PLANS: Plan[] = [
  { id: "trial", name: "Trial", price: `${TRIAL_DAYS} days`, period: "free", blurb: "Full tools. No card. Then old work stays viewable.", features: ["Invoices, proposals and approvals", "Calendar and crew app", "Reports and year packet"], free: true },
  { id: "monthly", name: "Monthly", price: "$7.99", period: "per month", blurb: "After the trial. Keep saving new jobs.", features: ["Everything in the trial", "Unlimited invoices and clients", "Cancel any time"], highlight: true },
  { id: "quarterly", name: "3 months", price: "$19.99", period: "every 3 months", blurb: "Same tools, paid ahead.", features: ["Everything in Monthly", "Pay once a quarter"] },
];

export const paidPlans = () => PLANS.filter((plan) => !plan.free);
/** Short price line for banners, e.g. "$7.99 per month or $19.99 every 3 months". */
export const priceSummary = () => paidPlans().map((plan) => `${plan.price} ${plan.period}`).join(" or ");
