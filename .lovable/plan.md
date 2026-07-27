# Cloudinary upload swap in `tally-incoming-job`

Scope: single file — `supabase/functions/tally-incoming-job/index.ts`. No other file, no other logic touched.

## Changes

### 1. Add two env reads near the top of the module

Insert immediately after the existing constants block (after line 12, before `sanitize`):

```ts
const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "ddx2gnklt";
const CLOUDINARY_TALLY_PRESET = Deno.env.get("CLOUDINARY_TALLY_UPLOAD_PRESET");
```

### 2. Replace the per-file loop body (current lines 385–420)

Current body writes to Supabase Storage (`job-media` bucket) and inserts a `job_media` row missing `organisation_id`. New body uploads to Cloudinary via unsigned preset with size + content-type gates, then inserts `job_media` with `organisation_id` set and `storage_bucket: "cloudinary"`.

### Diff (unified)

```diff
@@ near top of file, after MAX_SHORT_LEN
 const MAX_SHORT_LEN = 100;
+
+const CLOUDINARY_CLOUD_NAME = Deno.env.get("CLOUDINARY_CLOUD_NAME") ?? "ddx2gnklt";
+const CLOUDINARY_TALLY_PRESET = Deno.env.get("CLOUDINARY_TALLY_UPLOAD_PRESET");

@@ inside "Handle photo/video uploads if provided as URLs"
   for (const fileEntry of urls) {
     if (fileCount >= 10) break;
     try {
       const fileUrl = typeof fileEntry === "string" ? fileEntry : fileEntry?.url;
       if (!fileUrl || typeof fileUrl !== "string") continue;
-
-      const fileResponse = await fetch(fileUrl);
-      const fileBuffer = await fileResponse.arrayBuffer();
-      const rawName =
-        typeof fileEntry === "object" && fileEntry?.name
-          ? (sanitize(fileEntry.name, MAX_SHORT_LEN) ?? `upload-${Date.now()}`)
-          : `upload-${Date.now()}`;
-      const fileName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
-      const storagePath = `customers/${customerId}/${job.id}/${fileName}`;
-      const isVideo = /\.(mp4|mov|avi|webm)$/i.test(fileName);
-
-      await supabase.storage.from("job-media").upload(storagePath, fileBuffer, {
-        contentType: fileResponse.headers.get("content-type") ?? "image/jpeg",
-        upsert: true,
-      });
-
-      await supabase.from("job_media").insert({
-        job_id: job.id,
-        customer_id: customerId,
-        user_id: userId,
-        file_name: fileName,
-        file_type: isVideo ? "video" : "image",
-        storage_path: storagePath,
-        public_url: null,
-        uploaded_by: "customer",
-      });
-      fileCount++;
+      if (!CLOUDINARY_TALLY_PRESET) {
+        console.error("CLOUDINARY_TALLY_UPLOAD_PRESET secret not set — skipping upload");
+        continue;
+      }
+
+      const fileResponse = await fetch(fileUrl);
+      const contentLength = Number(fileResponse.headers.get("content-length") ?? 0);
+      const MAX_BYTES = 25 * 1024 * 1024;
+      if (contentLength > MAX_BYTES) {
+        console.error("File exceeds 25MB, skipping:", fileUrl, contentLength);
+        continue;
+      }
+
+      const fileBuffer = await fileResponse.arrayBuffer();
+      const contentType = fileResponse.headers.get("content-type") ?? "application/octet-stream";
+      const allowedTypes = ["image/jpeg", "image/png", "image/heic", "image/webp", "video/mp4", "video/quicktime"];
+      if (!allowedTypes.includes(contentType)) {
+        console.error("Disallowed content type, skipping:", contentType);
+        continue;
+      }
+
+      const cloudinaryForm = new FormData();
+      cloudinaryForm.append("file", new Blob([fileBuffer], { type: contentType }));
+      cloudinaryForm.append("upload_preset", CLOUDINARY_TALLY_PRESET);
+      cloudinaryForm.append("folder", `tally-uploads/${orgData.id}/${job.id}`);
+      cloudinaryForm.append("tags", `org:${orgData.id},job:${job.id},source:tally`);
+
+      const cloudinaryRes = await fetch(
+        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
+        { method: "POST", body: cloudinaryForm },
+      );
+      const cloudinaryData = await cloudinaryRes.json();
+
+      if (!cloudinaryRes.ok || !cloudinaryData.secure_url) {
+        console.error("Cloudinary upload failed:", cloudinaryData);
+        continue;
+      }
+
+      await supabase.from("job_media").insert({
+        job_id: job.id,
+        customer_id: customerId,
+        user_id: userId,
+        organisation_id: orgData.id,
+        file_name: cloudinaryData.public_id,
+        file_type: cloudinaryData.resource_type === "video" ? "video" : "image",
+        storage_path: cloudinaryData.public_id,
+        storage_bucket: "cloudinary",
+        public_url: cloudinaryData.secure_url,
+        uploaded_by: "customer",
+      });
+      fileCount++;
     } catch (fileErr) {
       console.error("File upload error:", fileErr);
     }
   }
```

## Confirmation of untouched code

Nothing else in the file changes — CORS, auth (`x-webhook-secret`), sanitization, phone/email validation, org lookup, submission-idempotency, customer upsert, service_call insert, race-condition retry, and notification insert all remain byte-identical.

## Follow-ups (not part of this change)

- `CLOUDINARY_TALLY_UPLOAD_PRESET` secret must exist for uploads to run; without it uploads are skipped with a log line (job still created). I can request it via `add_secret` after you approve.
- `job_media.storage_bucket` column must accept `"cloudinary"`. If it's a check-constrained enum, insert will fail — worth a one-line schema check before deploy.