import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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

    // Parse form data
    const name = get('full name')
    const phone = get('mobile')
    const email = get('email')
    const address = get('address')
    const eircode = get('eircode')
    const areaCode = get('area code')
    const boilerBrand = get('boiler brand')
    const boilerModel = get('boiler model')
    const isWorking = get('boiler working')
    const issue = get('issue')
    const notes = get('additional notes')
    const prefTime = get('preferred time')
    const prefDate = get('preferred date')
    const submissionId = body.eventId ?? body.id

    if (!name || !phone) {
      return new Response(JSON.stringify({ error: 'Name and phone are required' }), {
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
    const timeBlock = timeBlockMap[prefTime] ?? 'Morning'

    // We need a user_id for RLS — get the first user (single-tenant app)
    const { data: firstSettings } = await supabase
      .from('settings')
      .select('user_id')
      .limit(1)
      .single()

    const userId = firstSettings?.user_id
    if (!userId) {
      return new Response(JSON.stringify({ error: 'No business user found' }), {
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
        return new Response(JSON.stringify({ error: 'Failed to create customer', details: insertErr }), {
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
      return new Response(JSON.stringify({ error: 'Failed to create job', details: jobErr }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Handle file uploads (Tally sends file URLs in the webhook)
    const fileFields = fields.filter((f: any) =>
      f.type === 'FILE_UPLOAD' && f.value?.length > 0
    )

    for (const fileField of fileFields) {
      for (const fileUrl of fileField.value) {
        try {
          const fileResponse = await fetch(fileUrl.url)
          const fileBuffer = await fileResponse.arrayBuffer()
          const fileName = fileUrl.name ?? `upload-${Date.now()}`
          const storagePath = `customers/${customerId}/${job.id}/${fileName}`
          const isVideo = /\.(mp4|mov|avi)$/i.test(fileName)

          await supabase.storage
            .from('job-media')
            .upload(storagePath, fileBuffer, {
              contentType: fileResponse.headers.get('content-type') ?? 'image/jpeg',
              upsert: true,
            })

          const { data: { publicUrl } } = supabase.storage
            .from('job-media')
            .getPublicUrl(storagePath)

          await supabase.from('job_media').insert({
            job_id: job.id,
            customer_id: customerId,
            user_id: userId,
            file_name: fileName,
            file_type: isVideo ? 'video' : 'image',
            storage_path: storagePath,
            public_url: publicUrl,
            uploaded_by: 'customer',
          })
        } catch (fileErr) {
          console.error('File upload error:', fileErr)
        }
      }
    }

    return new Response(JSON.stringify({ success: true, jobId: job.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Tally webhook error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
