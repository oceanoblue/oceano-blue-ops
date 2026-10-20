import { z } from "zod";
const item = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(3000).default(""),
  price_cents: z.number().int().min(1).max(100000000),
});
export const experienceBlockSchema = z.object({
  id: z.string().uuid(),
  kind: z.literal("experience"),
  title: z.string().trim().min(1).max(180),
  packages: z.array(item).min(1).max(12),
  addons: z.array(item).max(20).default([]),
  terms: z.string().trim().max(30000),
  session_slug: z
    .string()
    .max(80).regex(/^$|^[a-z0-9]+(-[a-z0-9]+)*$/)
    .default(""),
  deposit_percent: z.number().int().min(1).max(100).default(100),
  balance_days: z.number().int().min(1).max(365).default(30),
  tax_bps: z.number().int().min(0).max(2500).default(0),
});
export type ExperienceBlock = z.infer<typeof experienceBlockSchema>;
export const acceptanceSchema = z.object({
  action: z.literal("accept"),
  package_id: z.string().uuid(),
  addon_ids: z.array(z.string().uuid()).max(20),
  signer_name: z.string().trim().min(2).max(120),
  signer_email: z
    .string()
    .trim()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  consent: z.literal(true),
  answers: z.record(z.string().max(10000)).default({}),
});
export const signingConsent =
  "I have reviewed the selected services, prices, payment schedule and agreement. I consent to electronic records and agree that typing my full name is my electronic signature. I am authorized to accept this agreement.";
export function priceSelection(
  config: ExperienceBlock,
  packageId: string,
  addonIds: string[],
) {
  const selected = config.packages.find((p) => p.id === packageId);
  if (
    !selected ||
    new Set(addonIds).size !== addonIds.length ||
    addonIds.some((id) => !config.addons.some((a) => a.id === id))
  )
    throw new Error("Choose a valid package and extras.");
  const extras = config.addons.filter((a) => addonIds.includes(a.id));
  const subtotal =
    selected.price_cents + extras.reduce((n, a) => n + a.price_cents, 0);
  const tax = Math.round((subtotal * config.tax_bps) / 10000),
    total = subtotal + tax;
  if (!Number.isSafeInteger(total) || total > 2000000000)
    throw new Error("This selection exceeds the supported total.");
  const deposit = Math.max(
    1,
    Math.ceil((total * config.deposit_percent) / 100),
  );
  return {
    selected,
    extras,
    subtotal,
    tax,
    total,
    deposit,
    balance: total - deposit,
  };
}
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export type ExperienceState = {
  acceptance: null | {
    package_id: string;
    addon_ids: string[];
    signer_name: string;
    signer_email: string;
    accepted_at: string;
    total_cents: number;
    deposit_cents: number;
    document_hash: string;
    answers: Record<string, string>;
    agreement: string;
    consent_text: string;
  };
  appointment: null | {
    id: string;
    starts_at: string;
    status: string;
    manage_token: string;
  };
  installments: {
    id: string;
    title: string;
    amount_cents: number;
    paid_cents: number;
    due_date: string | null;
  }[];
  payment_review: boolean;
};
