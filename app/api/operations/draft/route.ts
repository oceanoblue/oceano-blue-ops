/** Retired mailbox endpoint: stale clients must never perform email actions. */
export async function POST() {
  return Response.json(
    { error: "Email integration has been removed. Copy editor drafts from My Day." },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
