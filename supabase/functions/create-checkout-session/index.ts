/**
 * create-checkout-session
 *
 * Creates a Stripe Checkout session for a DJ subscription.
 * Called by the frontend when a subscriber clicks "Subscribe".
 *
 * Deploy: npx supabase functions deploy create-checkout-session
 *
 * Required secrets:
 *   STRIPE_SECRET_KEY     sk_live_...
 *   STRIPE_PRICE_STARTER  price_...
 *   STRIPE_PRICE_PRO      price_...
 *   APP_URL               https://radiodj.com  (no trailing slash)
 *
 * Request body (JSON):
 *   { tier: 'starter' | 'pro', successPath?: string, cancelPath?: string }
 *
 * Authorization header: Bearer <supabase-access-token>
 *
 * Response:
 *   { url: string }  — redirect the browser to this URL
 */

import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

// Anon client — used only to verify the caller's JWT
const supabaseAnon = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_ANON_KEY')!,
);

// Service role — used to read existing subscription (to find Stripe customer ID)
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

function getPriceId(tier: string): string | null {
  switch (tier) {
    case 'starter': return Deno.env.get('STRIPE_PRICE_STARTER') ?? null;
    case 'pro':     return Deno.env.get('STRIPE_PRICE_PRO')     ?? null;
    default:        return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Verify auth
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAnon.auth.getUser(token);
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401, headers: corsHeaders() });
  }

  const { tier, successPath, cancelPath } = await req.json().catch(() => ({}));
  const priceId = getPriceId(tier);
  if (!priceId) {
    return new Response('Invalid tier', { status: 400, headers: corsHeaders() });
  }

  // Find existing Stripe customer (if they've subscribed before)
  const { data: existingSub } = await supabaseAdmin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode:      'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    metadata:  { supabase_user_id: user.id },
    success_url: `${appUrl}${successPath ?? '/?subscribed=true'}`,
    cancel_url:  `${appUrl}${cancelPath  ?? '/pricing'}`,
    ...(existingSub?.stripe_customer_id
      ? { customer: existingSub.stripe_customer_id }
      : { customer_email: user.email ?? undefined }),
  };

  const session = await stripe.checkout.sessions.create(sessionParams);

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
});

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
