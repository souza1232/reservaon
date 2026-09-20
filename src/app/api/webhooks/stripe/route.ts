import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient, isStripeConfigured } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import { syncCompanyAccess } from "@/lib/subscription-access";
import type { SubscriptionStatus } from "@prisma/client";

/**
 * Webhook do Stripe. Configure a URL desta rota
 * (https://SEU_DOMINIO/api/webhooks/stripe) no painel do Stripe em
 * Developers → Webhooks, ouvindo os eventos:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 * O segredo de assinatura gerado nesse momento vai em STRIPE_WEBHOOK_SECRET.
 */

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "TRIAL";
    case "past_due":
    case "unpaid":
    case "incomplete":
      return "PAST_DUE";
    case "canceled":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return "PAST_DUE";
  }
}

function currentPeriodEnd(subscription: Stripe.Subscription): Date | null {
  const item = subscription.items.data[0];
  return item ? new Date(item.current_period_end * 1000) : null;
}

export async function POST(req: Request) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    // Sem configuração, respondemos 200 para o Stripe não ficar retentando —
    // mas isso não deveria acontecer em produção com o webhook registrado.
    return NextResponse.json({ received: false, reason: "not_configured" }, { status: 200 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Assinatura ausente." }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const checkoutSession = event.data.object as Stripe.Checkout.Session;
      const companyId = checkoutSession.metadata?.companyId;
      const planId = checkoutSession.metadata?.planId;
      const stripeSubscriptionId =
        typeof checkoutSession.subscription === "string" ? checkoutSession.subscription : null;
      const stripeCustomerId =
        typeof checkoutSession.customer === "string" ? checkoutSession.customer : null;

      if (companyId && planId && stripeSubscriptionId && stripeCustomerId) {
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        const status = mapStripeStatus(stripeSubscription.status);
        await prisma.subscription.upsert({
          where: { companyId },
          update: {
            planId,
            status,
            externalProvider: "stripe",
            externalCustomerId: stripeCustomerId,
            externalSubId: stripeSubscriptionId,
            startDate: new Date(),
            renewalDate: currentPeriodEnd(stripeSubscription),
            canceledAt: null,
          },
          create: {
            companyId,
            planId,
            status,
            externalProvider: "stripe",
            externalCustomerId: stripeCustomerId,
            externalSubId: stripeSubscriptionId,
            renewalDate: currentPeriodEnd(stripeSubscription),
          },
        });
        await prisma.company.update({ where: { id: companyId }, data: { planId } });
        await syncCompanyAccess(companyId, status);
      }
      break;
    }

    case "customer.subscription.updated": {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const status = mapStripeStatus(stripeSubscription.status);
      const subscription = await prisma.subscription.findFirst({
        where: { externalSubId: stripeSubscription.id },
        select: { companyId: true },
      });
      if (subscription) {
        await prisma.subscription.update({
          where: { companyId: subscription.companyId },
          data: { status, renewalDate: currentPeriodEnd(stripeSubscription) },
        });
        await syncCompanyAccess(subscription.companyId, status);
      }
      break;
    }

    case "customer.subscription.deleted": {
      const stripeSubscription = event.data.object as Stripe.Subscription;
      const subscription = await prisma.subscription.findFirst({
        where: { externalSubId: stripeSubscription.id },
        select: { companyId: true },
      });
      if (subscription) {
        await prisma.subscription.update({
          where: { companyId: subscription.companyId },
          data: { status: "CANCELED", canceledAt: new Date() },
        });
        await syncCompanyAccess(subscription.companyId, "CANCELED");
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
