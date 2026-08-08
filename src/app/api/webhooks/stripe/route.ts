import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getDb } from "@/db/client";
import { stripeWebhookEvents } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPlatformIntegrationConfig, type StripeConfig } from "@/lib/integrations/integrations-config";
import { recordAudit } from "@/lib/audit";

/**
 * Receives Stripe webhook events and RECORDS them (append-only) for
 * later manual review from /admin. Deliberately does NOT act on events
 * automatically yet — e.g. a `checkout.session.completed` does not
 * currently flip a subscription to "active" by itself. Acting
 * automatically requires deciding exact business rules (what happens
 * to clinic_modules on payment failure, grace periods, etc.) — a
 * product decision, not a technical one. See docs/GUIA_INTEGRACAO.md.
 *
 * Verifies the Stripe signature using the webhook secret saved via
 * /admin (NOT the Stripe secret key — a webhook signing secret is a
 * separate value from the Dashboard's "Webhooks" section). Returns 400
 * if Stripe isn't configured yet or the signature doesn't verify, so
 * Stripe's dashboard clearly shows a delivery failure instead of a
 * silently-accepted-but-ignored 200.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const integration = await getPlatformIntegrationConfig<StripeConfig>("stripe");
  if (!integration?.isActive || !integration.config.webhookSecret) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // apiVersion is intentionally omitted — constructEvent doesn't call
    // the API, it only verifies the signature locally.
    const stripe = new Stripe(integration.config.secretKey);
    event = stripe.webhooks.constructEvent(rawBody, signature, integration.config.webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid_signature";
    await recordAudit({ action: "billing.webhook_rejected", result: "denied", metadata: { message } });
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  const db = await getDb();
  const [existing] = await db
    .select({ id: stripeWebhookEvents.id })
    .from(stripeWebhookEvents)
    .where(eq(stripeWebhookEvents.stripeEventId, event.id))
    .limit(1);

  if (!existing) {
    await db.insert(stripeWebhookEvents).values({
      stripeEventId: event.id,
      eventType: event.type,
      payload: JSON.stringify(event),
    });
    await recordAudit({ action: "billing.webhook_received", result: "success", metadata: { type: event.type } });
  }

  return NextResponse.json({ received: true });
}
