import { createHash } from "node:crypto";
import { z } from "zod";
import {
  crmDb,
  crmError,
  CrmError,
  readJson,
  sameOrigin,
} from "@/lib/crm/server";
import { publicFile } from "@/lib/crm/acquisition-server";
import { validateFileAnswers } from "@/lib/crm/acquisition-types";
import { clientIp, windowBucket } from "@/lib/security/rate-limit";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    sameOrigin(req);
    const token = z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .parse((await params).token);
    const body = z
      .object({
        action: z.enum(["view", "respond"]),
        id: z.string().uuid(),
        answers: z.unknown().optional(),
      })
      .parse(await readJson(req, 90000));
    const db = crmDb();
    const key = createHash("sha256").update(clientIp(req)).digest("hex");
    const limit = await db.rpc("bump_rate_limit", {
      p_key: `crm-file:${key}:${windowBucket(Date.now(), 600)}`,
    });
    if (limit.error) throw new CrmError("Please retry shortly.", 503);
    if (typeof limit.data !== "number" || limit.data > 30)
      return Response.json(
        { error: "Please retry shortly." },
        { status: 429, headers: { "Retry-After": "600" } },
      );
    const file = await publicFile(token);
    if (!file) throw new CrmError("File unavailable.", 404);
    let answers: Record<string, string> = {};
    if (body.action === "respond") {
      if (!file.document.blocks.some((b) => b.kind === "question"))
        throw new CrmError("This file does not request a response.");
      try {
        answers = validateFileAnswers(file.document, body.answers);
      } catch (e) {
        throw new CrmError(
          e instanceof Error ? e.message : "Check your answers.",
        );
      }
    }
    const hash = createHash("sha256")
      .update(JSON.stringify(answers))
      .digest("hex");
    const saved = await db.rpc("crm_file_event", {
      p_token: token,
      p_action: body.action,
      p_id: body.id,
      p_hash: hash,
      p_answers: answers,
    });
    if (saved.error)
      throw new CrmError(
        "Your response could not be saved. Please retry.",
        503,
      );
    if (saved.data?.error) throw new CrmError(saved.data.error, 409);
    return Response.json(
      { ok: true },
      {
        headers: {
          "Cache-Control": "no-store",
          "Referrer-Policy": "no-referrer",
        },
      },
    );
  } catch (e) {
    return crmError(e);
  }
}
