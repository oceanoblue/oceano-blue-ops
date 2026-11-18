import { crmDb, CrmError } from "@/lib/crm/server";
import {
  MEDIA_WINDOW_DAYS,
  TIER_DEFAULTS,
  monthStart,
  planSlots,
  todayKey,
  type AccessStatus,
  type Kind,
  type MediaSource,
  type Pillar,
  type Platform,
  type ProfileLinks,
  type ProgramStatus,
  type RequestStatus,
  type SocialAction,
  type Status,
  type Tier,
} from "./schema";

export type Program = {
  id: string;
  name: string;
  contact_name: string;
  contact_email: string;
  publishing_tool: string;
  status: ProgramStatus;
  notes: string;
};
export type Account = {
  id: string;
  program_id: string;
  name: string;
  tier: Tier;
  platforms: Platform[];
  posts_per_month: number;
  reels_per_month: number;
  google_posts_per_month: number;
  profile_links: ProfileLinks;
  brand_kit_url: string;
  media_folder_url: string;
  voice_notes: string;
  access_status: AccessStatus;
  access_note: string;
  is_active: boolean;
};
export type Item = {
  id: string;
  account_id: string;
  month: string;
  kind: Kind;
  slot: number;
  pillar: Pillar;
  title: string;
  caption: string;
  status: Status;
  scheduled_for: string | null;
  assignee: string | null;
  design_url: string;
  published_url: string;
  review_note: string;
  updated_at: string;
};
export type MediaBatch = {
  id: string;
  account_id: string;
  received_on: string;
  source: MediaSource;
  photos: number;
  videos: number;
  link: string;
  note: string;
};
export type MediaRequest = {
  id: string;
  account_id: string;
  ask: string;
  due_on: string | null;
  status: RequestStatus;
  created_at: string;
};
export type Member = { id: string; full_name: string };

const PROGRAM = "id,name,contact_name,contact_email,publishing_tool,status,notes";
const ACCOUNT =
  "id,program_id,name,tier,platforms,posts_per_month,reels_per_month,google_posts_per_month,profile_links,brand_kit_url,media_folder_url,voice_notes,access_status,access_note,is_active";
const ITEM =
  "id,account_id,month,kind,slot,pillar,title,caption,status,scheduled_for,assignee,design_url,published_url,review_note,updated_at";
const BATCH = "id,account_id,received_on,source,photos,videos,link,note";
const REQUEST = "id,account_id,ask,due_on,status,created_at";

const unavailable = () => new CrmError("Social Studio is unavailable. Please retry.", 503);
/** Supabase returns at most 1,000 rows a request; a month of one program stays well under this. */
const ROW_LIMIT = 1000;

/** The first day of the media window, as YYYY-MM-DD. */
export function mediaWindowStart(today: string = todayKey()): string {
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - MEDIA_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
}

export async function listPrograms(): Promise<Program[]> {
  const { data, error } = await crmDb().from("social_programs").select(PROGRAM).order("created_at");
  if (error) throw unavailable();
  return (data ?? []) as unknown as Program[];
}

export type Workspace = {
  accounts: Account[];
  items: Item[];
  /** Media received inside the supply window. */
  media: MediaBatch[];
  /** Requests still waiting on the client. */
  requests: MediaRequest[];
  team: Member[];
};

/** Everything the overview, board and calendar need for one program and month. */
export async function loadWorkspace(programId: string, month: string): Promise<Workspace> {
  const db = crmDb();
  const accounts = await db.from("social_accounts").select(ACCOUNT).eq("program_id", programId).order("name");
  if (accounts.error) throw unavailable();
  const list = (accounts.data ?? []) as unknown as Account[];
  const ids = list.map((a) => a.id);
  const team = await db.from("team_members").select("id,full_name").eq("is_active", true).order("full_name");
  if (team.error) throw unavailable();
  if (ids.length === 0) return { accounts: [], items: [], media: [], requests: [], team: (team.data ?? []) as Member[] };
  const [items, media, requests] = await Promise.all([
    db.from("social_content_items").select(ITEM).in("account_id", ids).eq("month", monthStart(month))
      .order("scheduled_for", { nullsFirst: false }).order("slot").limit(ROW_LIMIT),
    db.from("social_media_batches").select(BATCH).in("account_id", ids).gte("received_on", mediaWindowStart())
      .order("received_on", { ascending: false }).limit(ROW_LIMIT),
    db.from("social_media_requests").select(REQUEST).in("account_id", ids).in("status", ["open", "sent"])
      .order("created_at", { ascending: false }).limit(ROW_LIMIT),
  ]);
  if (items.error || media.error || requests.error) throw unavailable();
  return {
    accounts: list,
    items: (items.data ?? []) as unknown as Item[],
    media: (media.data ?? []) as unknown as MediaBatch[],
    requests: (requests.data ?? []) as unknown as MediaRequest[],
    team: (team.data ?? []) as Member[],
  };
}

export type AccountDetail = {
  account: Account;
  program: Program;
  items: Item[];
  media: MediaBatch[];
  requests: MediaRequest[];
  team: Member[];
};

export async function loadAccount(id: string, month: string): Promise<AccountDetail | null> {
  const db = crmDb();
  const account = await db.from("social_accounts").select(ACCOUNT).eq("id", id).maybeSingle();
  if (account.error) throw unavailable();
  if (!account.data) return null;
  const a = account.data as unknown as Account;
  const [program, items, media, requests, team] = await Promise.all([
    db.from("social_programs").select(PROGRAM).eq("id", a.program_id).maybeSingle(),
    db.from("social_content_items").select(ITEM).eq("account_id", id).eq("month", monthStart(month))
      .order("scheduled_for", { nullsFirst: false }).order("slot"),
    db.from("social_media_batches").select(BATCH).eq("account_id", id).order("received_on", { ascending: false }).limit(50),
    db.from("social_media_requests").select(REQUEST).eq("account_id", id).order("created_at", { ascending: false }).limit(50),
    db.from("team_members").select("id,full_name").eq("is_active", true).order("full_name"),
  ]);
  if (program.error || !program.data || items.error || media.error || requests.error || team.error) throw unavailable();
  return {
    account: a,
    program: program.data as unknown as Program,
    items: (items.data ?? []) as unknown as Item[],
    media: (media.data ?? []) as unknown as MediaBatch[],
    requests: (requests.data ?? []) as unknown as MediaRequest[],
    team: (team.data ?? []) as Member[],
  };
}

/** Carry out one validated office request. Returns what the page needs to confirm it. */
export async function runAction(actor: string, a: SocialAction): Promise<Record<string, unknown>> {
  const db = crmDb();
  const now = new Date().toISOString();
  switch (a.action) {
    case "create_program": {
      const { data, error } = await db
        .from("social_programs")
        .insert({ name: a.name, contact_name: a.contact_name, contact_email: a.contact_email, publishing_tool: a.publishing_tool, created_by: actor })
        .select("id")
        .single();
      if (error || !data) throw unavailable();
      return { id: data.id };
    }
    case "update_program": {
      const { data, error } = await db.from("social_programs").update({ ...a.patch, updated_at: now }).eq("id", a.id).select("id");
      if (error) throw unavailable();
      if (!data?.length) throw new CrmError("That program no longer exists.", 404);
      return {};
    }
    case "add_accounts": {
      const program = await db.from("social_programs").select("id").eq("id", a.program_id).maybeSingle();
      if (program.error) throw unavailable();
      if (!program.data) throw new CrmError("That program no longer exists.", 404);
      const defaults = TIER_DEFAULTS[a.tier];
      const rows = a.accounts.map((account) => ({
        program_id: a.program_id,
        name: account.name,
        tier: a.tier,
        ...defaults,
        // An account is on every platform we were given a link for, plus the tier's usual ones.
        platforms: [...new Set([...defaults.platforms, ...(Object.keys(account.profile_links) as Platform[])])],
        profile_links: account.profile_links,
      }));
      // Names already in the program are left as they are.
      const { data, error } = await db
        .from("social_accounts")
        .upsert(rows, { onConflict: "program_id,name", ignoreDuplicates: true })
        .select("id");
      if (error) throw unavailable();
      return { added: data?.length ?? 0, skipped: rows.length - (data?.length ?? 0) };
    }
    case "update_account": {
      const { data, error } = await db.from("social_accounts").update({ ...a.patch, updated_at: now }).eq("id", a.id).select("id");
      if (error) {
        if (error.code === "23505") throw new CrmError("Another account in this program already has that name.", 409);
        throw unavailable();
      }
      if (!data?.length) throw new CrmError("That account no longer exists.", 404);
      return {};
    }
    case "plan_month": {
      const accounts = await db
        .from("social_accounts")
        .select("id,posts_per_month,reels_per_month,google_posts_per_month")
        .eq("program_id", a.program_id)
        .eq("is_active", true)
        .order("name");
      if (accounts.error) throw unavailable();
      // Each account's position staggers its suggested dates across the month.
      const rows = (accounts.data ?? []).flatMap((account, position) =>
        planSlots(account, a.month, position).map((slot) => ({ ...slot, account_id: account.id, month: monthStart(a.month), updated_by: actor })),
      );
      if (rows.length === 0) return { created: 0 };
      // Slots that already exist are skipped, so planning twice never duplicates or resets work.
      const { data, error } = await db
        .from("social_content_items")
        .upsert(rows, { onConflict: "account_id,month,kind,slot", ignoreDuplicates: true })
        .select("id");
      if (error) throw unavailable();
      return { created: data?.length ?? 0 };
    }
    case "update_item": {
      const { data, error } = await db
        .from("social_content_items")
        .update({ ...a.patch, updated_by: actor, updated_at: now })
        .eq("id", a.id)
        .select("id");
      if (error) {
        if (error.code === "23503") throw new CrmError("That team member is no longer available.", 409);
        throw unavailable();
      }
      if (!data?.length) throw new CrmError("That piece no longer exists.", 404);
      return {};
    }
    case "add_media": {
      const { error } = await db.from("social_media_batches").insert({
        account_id: a.account_id,
        received_on: a.received_on,
        source: a.source,
        photos: a.photos,
        videos: a.videos,
        link: a.link,
        note: a.note,
        created_by: actor,
      });
      if (error) throw error.code === "23503" ? new CrmError("That account no longer exists.", 404) : unavailable();
      return {};
    }
    case "add_request": {
      const { error } = await db
        .from("social_media_requests")
        .insert({ account_id: a.account_id, ask: a.ask, due_on: a.due_on, created_by: actor });
      if (error) throw error.code === "23503" ? new CrmError("That account no longer exists.", 404) : unavailable();
      return {};
    }
    case "update_request": {
      const { data, error } = await db.from("social_media_requests").update({ status: a.status, updated_at: now }).eq("id", a.id).select("id");
      if (error) throw unavailable();
      if (!data?.length) throw new CrmError("That request no longer exists.", 404);
      return {};
    }
  }
}
