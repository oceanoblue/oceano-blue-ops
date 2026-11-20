import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { AddAccounts } from "@/components/social-studio/ProgramSetup";
import { StudioFrame } from "@/components/social-studio/StudioFrame";
import { accountHref } from "@/lib/social/links";
import { clientPage } from "@/lib/social/page";
import {
  ACCESS_LABEL,
  ACCESS_PILL,
  MEDIA_HEALTH_LABEL,
  MEDIA_HEALTH_PILL,
  PLATFORM_LABEL,
  TIERS,
  TIER_LABEL,
} from "@/lib/social/schema";

export const dynamic = "force-dynamic";

/** Every sub-account of one client in a single table: what each is owed, where it posts and whether we can get in. */
export default async function ClientAccountsPage(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { program, month, workspace, rows, summary, production } = await clientPage(props.params, props.searchParams);
  const paused = workspace.accounts.filter((a) => !a.is_active);
  const ordered = TIERS.flatMap((tier) => rows.filter((r) => r.account.tier === tier));
  const totals = rows.reduce(
    (t, r) => ({
      posts: t.posts + r.account.posts_per_month,
      reels: t.reels + r.account.reels_per_month,
      google: t.google + r.account.google_posts_per_month,
    }),
    { posts: 0, reels: 0, google: 0 },
  );

  return (
    <StudioFrame view="accounts" program={program} month={month} production={production} accountCount={summary.accounts} checkErrors={summary.errors}>
      {rows.length === 0 ? (
        <p className="card p-5 text-sm text-slate-600">{program.name} has no sub-accounts yet. Add its hotels, outlets or brand pages below.</p>
      ) : (
        <section className="card overflow-hidden">
          <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-ink-100 px-5 py-3">
            <h2 className="font-display text-lg font-semibold text-ocean-950">
              {summary.accounts} {summary.accounts === 1 ? "sub-account" : "sub-accounts"} of {program.name}
            </h2>
            <span className="text-sm text-slate-500">
              Each month: {totals.posts} posts · {totals.reels} reels and videos{totals.google > 0 && ` · ${totals.google} Google posts`}
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="table-head">
                <tr>
                  <th scope="col" className="px-5 py-2 text-left">Sub-account</th>
                  <th scope="col" className="px-3 py-2 text-left">Type</th>
                  <th scope="col" className="px-3 py-2 text-left">Posts on</th>
                  <th scope="col" className="px-3 py-2 text-right">Posts</th>
                  <th scope="col" className="px-3 py-2 text-right">Reels</th>
                  <th scope="col" className="px-3 py-2 text-right">Google</th>
                  <th scope="col" className="px-3 py-2 text-left">Access</th>
                  <th scope="col" className="px-3 py-2 text-left">Media</th>
                  <th scope="col" className="px-5 py-2 text-left">Brand kit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {ordered.map(({ account, health }) => (
                  <tr key={account.id} className="hover:bg-ink-50/70">
                    <th scope="row" className="px-5 py-2.5 text-left font-semibold">
                      <Link href={accountHref(account.id, month)} className="text-ocean-800 hover:underline">
                        {account.name}
                      </Link>
                    </th>
                    <td className="px-3 py-2.5 text-slate-600">{TIER_LABEL[account.tier]}</td>
                    <td className="px-3 py-2.5 text-slate-600">{account.platforms.map((p) => PLATFORM_LABEL[p]).join(", ") || "Not set"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{account.posts_per_month}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{account.reels_per_month}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{account.google_posts_per_month}</td>
                    <td className="px-3 py-2.5">
                      <span className={`pill ${ACCESS_PILL[account.access_status]}`}>{ACCESS_LABEL[account.access_status]}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`pill ${MEDIA_HEALTH_PILL[health]}`}>{MEDIA_HEALTH_LABEL[health]}</span>
                    </td>
                    <td className="px-5 py-2.5">
                      {account.brand_kit_url ? (
                        <a href={account.brand_kit_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-fuchsia-700 hover:underline">
                          Canva <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-slate-400">None</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <AddAccounts program={program} open={rows.length === 0} />

      {paused.length > 0 && (
        <section className="card p-5">
          <h2 className="font-display text-lg font-semibold text-ocean-950">Paused sub-accounts</h2>
          <p className="mt-0.5 text-sm text-slate-600">Not included when a month is planned. Open one to switch it back on.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {paused.map((a) => (
              <li key={a.id}>
                <Link href={accountHref(a.id, month)} className="pill bg-slate-100 text-slate-700 hover:bg-slate-200">
                  {a.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </StudioFrame>
  );
}
