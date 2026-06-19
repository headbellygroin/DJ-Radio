/**
 * create-vote-checkout
 *
 * Creates a one-time Stripe Checkout session for a vote pack purchase.
 * No auth required — audience members don't have accounts.
 *
 * Deploy: npx supabase functions deploy create-vote-checkout
 *
 * Required secrets:
 *   STRIPE_SECRET_KEY       sk_live_...
 *   STRIPE_PRICE_BOOST_5    price_...  (5 votes, e.g. $1.00)
 *   STRIPE_PRICE_BOOST_25   price_...  (25 votes, e.g. $4.00)
 *   STRIPE_PRICE_BOOST_100  price_...  (100 votes, e.g. $10.00)
 *   APP_URL                 https://radiodj.com
 *
 * Request body (JSON):
 *   {
 *     packId:     'boost_5' | 'boost_25' | 'boost_100'
 *     stationId:  string   (uuid)
 *     voterToken: string   (uuid from localStorage)
 *     hourKey:    string   (e.g. "2026-06-19-14")
 *     voteValue:  string   (genre name)
 *     returnSlug: string   (station slug for redirect back to /vote/:slug)
 *   }
 *
 * Response:
 *   { url: string }  — redirect the browser to Stripe Checkout
 *
 * After payment, Stripe fires checkout.session.completed → stripe-webhook
 * inserts the vote with weight=N into the votes table.
 * The browser is redirected back to /vote/:slug?vote_success=true
 */

import Stripe from 'npm:stripe@14';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

interface VotePack {
  priceId: string;
  weight:  number;
  label:   string;
}

function buildVotePacks(): Record<string, VotePack> {
  return {
    boost_5: {
      priceId: Deno.env.get('STRIPE_PRICE_BOOST_5')   ?? '',
      weight:  5,
      label:   '5 votes',
    },
    boost_25: {
      priceId: Deno.env.get('STRIPE_PRICE_BOOST_25')  ?? '',
      weight:  25,
      label:   '25 votes',
    },
    boost_100: {
      priceId: Deno.env.get('STRIPE_PRICE_BOOST_100') ?? '',
      weight:  100,
      label:   '100 votes',
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // GET /vote-packs — returns pack options so VotePage can render the UI
  if (req.method === 'GET') {
    const packs = buildVotePacks();
    const options = Object.entries(packs).map(([id, p]) => ({
      id,
      weight: p.weight,
      label:  p.label,
    }));
    return new Response(JSON.stringify(options), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  const {
    packId,
    stationId,
    voterToken,
    hourKey,
    voteValue,
    returnSlug,
  } = await req.json().catch(() => ({}));

  const packs = buildVotePacks();
  const pack  = packs[packId as string];

  if (!pack || !pack.priceId) {
    return new Response('Invalid packId', { status: 400, headers: corsHeaders() });
  }
  if (!stationId || !voterToken || !hourKey || !voteValue) {
    return new Response('Missing required fields', { status: 400, headers: corsHeaders() });
  }

  const slug        = returnSlug ?? '';
  const successUrl  = `${appUrl}/vote/${slug}?vote_success=true`;
  const cancelUrl   = `${appUrl}/vote/${slug}?vote_canceled=true`;

  const session = await stripe.checkout.sessions.create({
    mode:       'payment',
    line_items: [{ price: pack.priceId, quantity: 1 }],
    metadata: {
      station_id:  stationId,
      voter_token: voterToken,
      hour_key:    hourKey,
      vote_value:  voteValue,
      weight:      String(pack.weight),
    },
    success_url: successUrl,
    cancel_url:  cancelUrl,
  });

  return new Response(JSON.stringify({ url: session.url }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
});

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}
