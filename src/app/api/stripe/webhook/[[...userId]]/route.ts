import prisma from "@/app/api/_db/db";
import { getStripeInstance } from "@/app/api/_payment/stripe";
import { sendMail } from "@/app/api/_utils/mail/mail";
import { generateWebhookFailureEmail } from "@/app/api/_utils/mail/templates";
import {
  REGISTERED_CONNECTED_HOOKS,
  RETRIES,
  Event,
} from "@/app/api/stripe/webhook/[[...userId]]/_utils";

import loggerServer from "@/loggerServer";
import { User, UserStripeCredentials } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

export const maxDuration = 60; // 1 minute

type LeanUser = {
  id: string;
  email?: string | null;
};

type UserStripeCredentialsWithUser = UserStripeCredentials & {
  user: LeanUser;
};

interface StripeWebhookConnectBody {
  account: string;
  api_version: string;
  created: number;
  data: {
    object: {
      id: string;
      object: string;
      name: string;
    };
  };
  id: string;
  livemode: boolean;
  object: string;
  pending_webhooks: number;
  request: { id: string | null; idempotency_key: string | null };
  type: string;
}

function initializeStripe(
  userStripeCredentials: UserStripeCredentials,
): Stripe | null {
  if (!userStripeCredentials.apiKey && userStripeCredentials.accountId) {
    return getStripeInstance({
      accountId: userStripeCredentials.accountId as string,
    });
  } else if (userStripeCredentials.apiKey) {
    return getStripeInstance({
      apiKey: (userStripeCredentials.apiKey as string) || "",
    });
  }

  return null;
}

// function verifyWebhook(
//   body: Event,
//   signature: string,
// ): Stripe.Event {
//   const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET as string;
//   const stripe = initializeStripe(body.account);
//   return stripe.webhooks.constructEvent(
//     JSON.stringify(body),
//     signature,
//     webhookSecret,
//   );
// }

async function getUserStripeCredentials(
  userDetails:
    | {
        accountId?: string;
        userId: string;
      }
    | {
        accountId: string;
        userId?: string;
      },
): Promise<UserStripeCredentialsWithUser | null> {
  const where = userDetails.accountId
    ? { accountId: userDetails.accountId }
    : { userId: userDetails.userId };

  const stripeCredentials = await prisma.userStripeCredentials.findUnique({
    where,
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });

  return stripeCredentials;
}

function areTherePendingWebhooks(pendingHooks: number): boolean {
  return pendingHooks > REGISTERED_CONNECTED_HOOKS;
}

async function retryPendingWebhooks(
  stripe: Stripe,
  eventId: string,
  initialPendingHooks: number,
): Promise<boolean> {
  let pendingHooks = initialPendingHooks;

  for (const waitTime of RETRIES) {
    await new Promise(resolve => setTimeout(resolve, waitTime));
    const updatedEvent = await stripe.events.retrieve(eventId);
    pendingHooks = updatedEvent.pending_webhooks;

    if (!areTherePendingWebhooks(pendingHooks)) {
      return true; // Webhook succeeded
    }
  }

  return false; // Webhook still pending
}

/**
 * Logic to avoid taking tokens for the same webhook event with the same outcome.
 * Also to avoid sending multiple emails for the same webhook event.
 */
async function shouldTakeToken(event: Event, succeeded: boolean) {
  const existingWebhookEvents = await prisma.userWebhookEvent.findMany({
    where: {
      requestIdempotencyKey: event.request?.idempotency_key,
      eventId: event.id,
    },
  });

  const hasSameOutcome = existingWebhookEvents.some(
    existingEvent => existingEvent.succeeded === succeeded,
  );

  console.log(
    "Webhook with idempotency key",
    event.request?.idempotency_key,
    "And event id: ",
    event.id,
    "has same outcome",
    hasSameOutcome,
  );

  return !hasSameOutcome;
}

async function handleWebhookResolution(
  event: Event,
  userStripeCredentials: UserStripeCredentialsWithUser,
  succeeded: boolean,
) {
  const webhooksPending = event.pending_webhooks - REGISTERED_CONNECTED_HOOKS;

  const { id: userId, email } = userStripeCredentials.user;

  const takeToken = await shouldTakeToken(event, succeeded);

  await prisma.userWebhookEvent.create({
    data: {
      userId: userId,
      eventId: event.id,
      livemode: event.livemode,
      type: event.type,
      created: event.created,
      pendingWebhooks: webhooksPending,
      requestId: event.request?.id,
      requestIdempotencyKey: event.request?.idempotency_key,
      succeeded,
      connected: userStripeCredentials?.connected,
    },
  });

  if (!takeToken) {
    // No need to update tokens or client about webhook resolution. Webhook already handled for that case.
    return;
  }

  try {
    await prisma.userTokens.update({
      where: {
        userId,
      },
      data: {
        tokensLeft: {
          decrement: 1,
        },
      },
    });
  } catch (error) {
    loggerServer.error("Error decrementing tokens", userId, error);
  }
  if (succeeded) {
    await handleWebhookSuccess(event, email || "");
  } else {
    await handleWebhookFailure(event, email || "");
  }
}

async function handleWebhookSuccess(event: Event, userEmail: string) {}

async function handleWebhookFailure(event: Event, userEmail: string) {
  const failedWebhooks = event.pending_webhooks - REGISTERED_CONNECTED_HOOKS;
  await sendMail(
    userEmail,
    process.env.NEXT_PUBLIC_APP_NAME as string,
    "Webhook Failed",
    generateWebhookFailureEmail(event, new Date(), failedWebhooks),
  );
}

async function processStripeEvent(
  userStripeCredentials: UserStripeCredentialsWithUser,
  event: Event,
) {
  const stripe = initializeStripe(userStripeCredentials);
  if (!stripe) {
    throw new Error("Stripe not initialized");
  }

  let pendingHooks = event.pending_webhooks;

  const webhookSucceeded = !areTherePendingWebhooks(pendingHooks)
    ? true
    : await retryPendingWebhooks(stripe, event.id, pendingHooks);

  await handleWebhookResolution(event, userStripeCredentials, webhookSucceeded);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { userId?: string[] } },
) {
  const signature = req.headers.get("stripe-signature");
  let event = (await req.json()) as Event;
  const stripe = getStripeInstance();

  const userId = params.userId?.[0];
  const accountId = event.account; // If accountId is null, it's a non-connected account

  try {
    if (!accountId && !userId) {
      loggerServer.error("No account or user id in webhook", "Unknown", event);
      return NextResponse.json(
        { error: "Unauthorized access" },
        { status: 401 },
      );
    }

    const userStripeCredentials = await getUserStripeCredentials(
      accountId ? { accountId } : { userId: userId! },
    );

    if (!userStripeCredentials) {
      return NextResponse.json(
        { error: "Unauthorized access" },
        { status: 401 },
      );
    }

    processStripeEvent(userStripeCredentials, event);

    return NextResponse.json({ success: false }, { status: 500 });
  } catch (error: any) {
    loggerServer.error(
      "Error in Stripe webhook connect",
      accountId || userId || "Unknown",
      error,
    );
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
