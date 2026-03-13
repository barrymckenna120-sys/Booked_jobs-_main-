import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('THREESIXTY_API_KEY')
  if (!apiKey) {
    console.error('THREESIXTY_API_KEY not configured')
    return new Response(JSON.stringify({ success: false, error: 'WhatsApp API not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const { quote_id, customer_name, mobile_number, job_description, quote_amount } = await req.json()

    // Validate required fields
    const missing: string[] = []
    if (!quote_id) missing.push('quote_id')
    if (!customer_name) missing.push('customer_name')
    if (!mobile_number) missing.push('mobile_number')
    if (!job_description) missing.push('job_description')
    if (quote_amount == null) missing.push('quote_amount')

    if (missing.length > 0) {
      return new Response(JSON.stringify({ success: false, error: `Missing required fields: ${missing.join(', ')}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Sanitize phone number to international format (Ireland)
    const cleaned = mobile_number.replace(/[\s\-()]/g, '')
    const phone = cleaned.startsWith('353') ? cleaned
      : cleaned.startsWith('0') ? '353' + cleaned.slice(1)
      : '353' + cleaned

    const firstName = customer_name.split(' ')[0]

    const message = `Hi ${firstName},\n\nHere is your quote from Karl's Gas.\n\nJob: ${job_description}\nTotal: €${quote_amount}\n\nKarl's Gas`

    // Send via 360Messenger API
    const waResponse = await fetch('https://waba-v2.360dialog.io/messages', {
      method: 'POST',
      headers: {
        'D360-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: message },
      }),
    })

    const waResult = await waResponse.json()

    if (!waResponse.ok) {
      console.error('360Messenger API error:', JSON.stringify(waResult))
      return new Response(JSON.stringify({ success: false, error: `WhatsApp send failed: ${waResult?.error?.message || waResponse.statusText}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Update quote status to Sent
    const { error: updateErr } = await supabase
      .from('quotes')
      .update({ status: 'Sent', sent_at: new Date().toISOString() })
      .eq('id', quote_id)

    if (updateErr) {
      console.error('Quote update failed:', updateErr)
    }

    return new Response(JSON.stringify({ success: true, message_id: waResult?.messages?.[0]?.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('send-quote-whatsapp error:', err)
    return new Response(JSON.stringify({ success: false, error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
