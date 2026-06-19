/**
 * stripe-webhook
 *
 * Handles Stripe events for:
 *   1. DJ subscriptions — checkout.session.completed (mode=subscription)
 *      customer.subscription.updated, customer.subscription.deleted
 *   2. Vote pack purchases — checkout.session.completed (mode=payment)
 *
 * Deploy: npx supabase functions deploy stripe-webhook
 *
 * Required secrets (set in Supabase Dashboard → Edge Functions → Manage secrets):
 *   STRIPE_SECRET_KEY        sk_live_...
 *   STRIPE_WEBHOOK_SECRET    whsec_...  (from Stripe Dashboard → Webhooks)
 *   STRIPE_PRICE_STARTER     price_...  (Starter plan monthly price ID)
 *   STRIPE_PRICE_PRO         price_...  (Pro plan monthly price ID)
 *
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 */

import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Service role bypasses RLS — only used here, never in the browser
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Map Stripe Price IDs → subscription tier names
function buildPriceMap(): Record<string, string> {
  const map: Record<string, string> = {};
  const starter = Deno.env.get('STRIPE_PRICE_STARTER');
  const pro     = Deno.env.get('STRIPE_PRICE_PRO');
  if (starter) map[starter] = 'starter';
  if (pro)     map[pro]     = 'pro';
  return map;
}

Deno.serve(async (req: Request) => {
  const body = await req.text();
  const sig  = req.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch (err) {
    console.error('Signature verification failed:', err);
    return new Response('Webhook signature error', { status: 400 });
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session;
    const sub     = event.data.object as Stripe.Subscription;

    switch (event.type) {
      case 'checkout.session.completed':
        if (session.mode === 'subscription') {
          await handleSubscriptionCheckout(session);
        } else if (session.mode === 'payment') {
          await handleVotePurchase(session);
        }
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(sub);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(sub);
        break;
    }
  } catch (err) {
    console.error('Handler error:', err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// ── Subscription handlers ─────────────────────────────────────────────────────

async function handleSubscriptionCheckout(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_user_id;
  if (!userId) {
    console.error('No supabase_user_id in session metadata — was this session created by create-checkout-session?');
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const priceId = subscription.items.data[0].price.id;
  const tier    = buildPriceMap()[priceId] ?? 'starter';

  const { error } = await supabase.from('subscriptions').upsert({
    user_id:            userId,
    tier,
    status:             subscription.status,
    stripe_customer_id: session.customer as string,
    stripe_sub_id:      subscription.id,
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    updated_at:         new Date().toISOString(),
  }, { onConflict: 'user_id' });

  if (error) throw error;
  console.log(`Subscription activated: user=${userId} tier=${tier}`);
}

async function handleSubscriptionUpdated(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0].price.id;
  const tier    = buildPriceMap()[priceId] ?? 'starter';

  const { error } = await supabase.from('subscriptions')
    .update({
      tier,
      status:             sub.status,
      stripe_sub_id:      sub.id,
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      updated_at:         new Date().toISOString(),
    })
    .eq('stripe_customer_id', sub.customer as string);

  if (error) throw error;
  console.log(`Subscription updated: customer=${sub.customer} tier=${tier} status=${sub.status}`);
}

async function handleSubscriptionCanceled(sub: Stripe.Subscription) {
  const { error } = await supabase.from('subscriptions')
    .update({ status: 'canceled', updated_at: new Date().toISOString() })
    .eq('stripe_sub_id', sub.id);

  if (error) throw error;
  console.log(`Subscription canceled: sub=${sub.id}`);
}

// ── Vote purchase handler ─────────────────────────────────────────────────────

async function handleVotePurchase(session: Stripe.Checkout.Session) {
  const { station_id, voter_token, hour_key, vote_value, weight } = session.metadata ?? {};

  if (!station_id || !voter_token || !hour_key || !vote_value || !weight) {
    console.error('Missing vote metadata in checkout session:', session.metadata);
    return;
  }

  const voteWeight = parseInt(weight, 10);
  if (isNaN(voteWeight) || voteWeight < 1) {
    console.error('Invalid weight in metadata:', weight);
    return;
  }

  const { error } = await supabase.from('votes').insert({
    station_id,
    vote_type:   'genre',
    value:       vote_value,
    weight:      voteWeight,
    voter_token,
    hour_key,
  });

  if (error) throw error;
  console.log(`Vote inserted: station=${station_id} genre=${vote_value} weight=${voteWeight}`);
}
