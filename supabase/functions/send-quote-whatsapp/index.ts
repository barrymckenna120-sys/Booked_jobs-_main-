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

  const apiKey = (Deno.env.get('THREESIXTY_API_KEY') || Deno.env.get('MESSENGER_API_KEY') || '').trim()
  const normalizedApiKey = apiKey.replace(/^Bearer\s+/i, '').trim()

  if (!normalizedApiKey) {
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

    const waPayload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'text',
      text: { body: message },
    }

    const call360 = async (headers: Record<string, string>) => {
      const response = await fetch('https://waba-v2.360dialog.io/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(waPayload),
      })

      const raw = await response.text()
      let parsed: any = null
      try {
        parsed = raw ? JSON.parse(raw) : null
      } catch {
        parsed = { raw }
      }

      return { response, parsed }
    }

    const primaryAttempt = await call360({
      'D360-API-KEY': normalizedApiKey,
      'Content-Type': 'application/json',
    })

    let waResponse = primaryAttempt.response
    let waResult = primaryAttempt.parsed

    if (!waResponse.ok && (waResponse.status === 401 || waResponse.status === 403)) {
      console.warn('Primary auth header rejected, retrying with Bearer token format')
      const retryAttempt = await call360({
        Authorization: `Bearer ${normalizedApiKey}`,
        'Content-Type': 'application/json',
      })

      if (retryAttempt.response.ok) {
        waResponse = retryAttempt.response
        waResult = retryAttempt.parsed
      } else {
        const primaryError = primaryAttempt.parsed?.error?.message || primaryAttempt.parsed?.error || primaryAttempt.response.statusText
        const retryError = retryAttempt.parsed?.error?.message || retryAttempt.parsed?.error || retryAttempt.response.statusText
        console.error('360Messenger API error:', JSON.stringify({ primaryError, retryError }))

        return new Response(JSON.stringify({ success: false, error: `WhatsApp send failed: ${primaryError}` }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    if (!waResponse.ok) {
      console.error('360Messenger API error:', JSON.stringify(waResult))
      return new Response(JSON.stringify({ success: false, error: `WhatsApp send failed: ${waResult?.error?.message || waResult?.error || waResponse.statusText}` }), {
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

    // Log to whatsapp_messages for tracking
    const { data: quoteRow } = await supabase
      .from('quotes')
      .select('user_id, customer_id')
      .eq('id', quote_id)
      .single()

    if (quoteRow) {
      const { error: logErr } = await supabase
        .from('whatsapp_messages')
        .insert({
          user_id: quoteRow.user_id,
          customer_id: quoteRow.customer_id,
          message_type: 'quote',
          message_body: message,
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_by: 'system',
          linked_quote_id: quote_id,
        })

      if (logErr) {
        console.error('WhatsApp message log failed:', logErr)
      }
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
