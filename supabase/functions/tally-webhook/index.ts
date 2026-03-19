import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// --- Input validation helpers ---
const MAX_NAME_LEN = 200
const MAX_ADDRESS_LEN = 500
const MAX_TEXT_LEN = 1000
const MAX_SHORT_LEN = 100
const MAX_FILES = 10

const sanitize = (val: string | null, maxLen: number): string | null => {
  if (!val || typeof val !== 'string') return null
  return val.trim().substring(0, maxLen) || null
}

const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const isValidPhone = (phone: string): boolean =>
  /^(\+353|0)[0-9]{8,9}$/.test(phone.replace(/[\s\-()]/g, ''))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json()
    const fields = body.data?.fields ?? []

    // Helper to extract field value by label
    const get = (label: string) =>
      fields.find((f: any) =>
        f.label?.toLowerCase().includes(label.toLowerCase())
      )?.value ?? null

    // Parse and sanitize form data
    const name = sanitize(get('full name'), MAX_NAME_LEN)
    const rawPhone = get('mobile')
    const phone = sanitize(rawPhone, MAX_SHORT_LEN)
    const rawEmail = get('email')
    const email = sanitize(rawEmail, MAX_NAME_LEN)
    const address = sanitize(get('address'), MAX_ADDRESS_LEN)
    const eircode = sanitize(get('eircode'), 10)
    const areaCode = sanitize(get('area code'), 10)
    const boilerBrand = sanitize(get('boiler brand'), MAX_SHORT_LEN)
    const boilerModel = sanitize(get('boiler model'), MAX_SHORT_LEN)
    const isWorking = get('boiler working')
    const issue = sanitize(get('issue'), MAX_TEXT_LEN)
    const notes = sanitize(get('additional notes'), MAX_TEXT_LEN)
    const prefTime = sanitize(get('preferred time'), 10)
    const prefDate = sanitize(get('preferred date'), 20)
    const submissionId = sanitize(String(body.eventId ?? body.id ?? ''), MAX_SHORT_LEN)

    // Validate required fields
    if (!name || !phone) {
      return new Response(JSON.stringify({ error: 'Name and phone are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!isValidPhone(phone)) {
      return new Response(JSON.stringify({ error: 'Invalid phone number format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (email && !isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Map preferred time to time_block
    const timeBlockMap: Record<string, string> = {
      '09:00': 'Morning',
      '11:00': 'Morning',
      '13:00': 'Midday',
      '15:00': 'Afternoon',
    }
    const timeBlock = timeBlockMap[prefTime ?? ''] ?? 'Morning'

    // We need a user_id for RLS — get the first user (single-tenant app)
    const { data: firstSettings } = await supabase
      .from('settings')
      .select('user_id')
      .limit(1)
      .single()

    const userId = firstSettings?.user_id
    if (!userId) {
      console.error('No business user found in settings')
      return new Response(JSON.stringify({ error: 'Unable to process submission.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upsert customer (match by phone)
    let customerId: string

    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', phone)
      .limit(1)
      .maybeSingle()

    if (existing) {
      customerId = existing.id
      await supabase.from('customers').update({
        name, email, address, eircode,
        area_code: areaCode,
        boiler_make_model: boilerModel,
      }).eq('id', customerId)
    } else {
      const { data: newCustomer, error: insertErr } = await supabase
        .from('customers')
        .insert({
          user_id: userId,
          name, phone, email,
          address: address || 'TBC',
          eircode: eircode || 'TBC',
          area_code: areaCode,
          boiler_make_model: boilerModel,
        })
        .select('id')
        .single()

      if (insertErr || !newCustomer) {
        console.error('Customer creation failed:', insertErr)
        return new Response(JSON.stringify({ error: 'Unable to process submission.' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      customerId = newCustomer.id
    }

    // Create service call
    const { data: job, error: jobErr } = await supabase
      .from('service_calls')
      .insert({
        user_id: userId,
        customer_id: customerId,
        job_type: 'Boiler Service',
        scheduled_date: prefDate ?? null,
        time_block: timeBlock,
        status: 'Scheduled',
        source: 'Tally Form',
        incoming_status: 'Pending',
        boiler_brand: boilerBrand,
        boiler_working: isWorking === 'Yes' || isWorking === true,
        boiler_issue: issue,
        notes: notes,
        tally_submission_id: submissionId,
      })
      .select('id')
      .single()

    if (jobErr || !job) {
      console.error('Job creation failed:', jobErr)
      return new Response(JSON.stringify({ error: 'Unable to process submission.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle file uploads (Tally sends file URLs in the webhook)
    const fileFields = fields.filter((f: any) =>
      f.type === 'FILE_UPLOAD' && f.value?.length > 0
    )

    let fileCount = 0
    for (const fileField of fileFields) {
      for (const fileUrl of fileField.value) {
        if (fileCount >= MAX_FILES) break
        try {
          const fileResponse = await fetch(fileUrl.url)
          const fileBuffer = await fileResponse.arrayBuffer()
          const rawName = sanitize(fileUrl.name, MAX_SHORT_LEN) ?? `upload-${Date.now()}`
          // Sanitize file name to prevent path traversal
          const fileName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
          const storagePath = `customers/${customerId}/${job.id}/${fileName}`
          const isVideo = /\.(mp4|mov|avi)$/i.test(fileName)

          await supabase.storage
            .from('job-media')
            .upload(storagePath, fileBuffer, {
              contentType: fileResponse.headers.get('content-type') ?? 'image/jpeg',
              upsert: true,
            })

          await supabase.from('job_media').insert({
            job_id: job.id,
            customer_id: customerId,
            user_id: userId,
            file_name: fileName,
            file_type: isVideo ? 'video' : 'image',
            storage_path: storagePath,
            public_url: null,
            uploaded_by: 'customer',
          })
          fileCount++
        } catch (fileErr) {
          console.error('File upload error:', fileErr)
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Tally webhook error:', err)
    try {
      await supabase.from('edge_function_logs').insert({
        function_name: 'tally-webhook',
        error_message: err instanceof Error ? err.message : String(err),
        payload: null,
      })
    } catch (_) { /* logging best-effort */ }
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
