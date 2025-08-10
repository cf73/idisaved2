import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'fs'
import path from 'path'
import url from 'url'

// CONFIG
const SUPABASE_URL = 'https://fefkdvnxqkmvmrpwxhqn.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZmtkdm54cWttdm1ycHd4aHFuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDc3MTkxOCwiZXhwIjoyMDcwMzQ3OTE4fQ.mETavHEGrui4ba8xCdAL3VOyvZbFio-OCQEMA0cifyI'
const STORAGE_BUCKET = 'assets' // use unified bucket as agreed

// Resolve repo-relative path: idi-frontend/scripts -> project root -> public/assets
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const imagesRoot = path.resolve(__dirname, '..', '..', 'public', 'assets')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'])

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
      return 'image/png'
    case '.gif':
      return 'image/gif'
    case '.svg':
      return 'image/svg+xml'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (!buckets?.some(b => b.name === STORAGE_BUCKET)) {
    await supabase.storage.createBucket(STORAGE_BUCKET, { public: true })
  }
}

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(fullPath)
    } else {
      yield fullPath
    }
  }
}

async function main() {
  console.log('Uploading images from:', imagesRoot)
  await ensureBucket()

  let uploadCount = 0
  for await (const filePath of walk(imagesRoot)) {
    const ext = path.extname(filePath).toLowerCase()
    if (!IMAGE_EXTS.has(ext)) continue

    const filename = path.basename(filePath)
    const storageKey = `images/${filename}` // avoid collisions with videos
    const fileBuffer = await fs.readFile(filePath)
    const contentType = contentTypeFor(filePath)

    // Upload (upsert)
    const { error: upErr } = await supabase
      .storage
      .from(STORAGE_BUCKET)
      .upload(storageKey, fileBuffer, { upsert: true, contentType })

    if (upErr) {
      console.warn('! upload failed:', filename, upErr.message)
      continue
    }

    // Public URL
    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(storageKey)
    const publicUrl = pub?.publicUrl || null

    // Get file stats for size
    const stat = await fs.stat(filePath)

    // Upsert DB row
    const row = {
      filename,
      original_key: storageKey,
      file_type: 'image',
      file_size: stat.size,
      file_url: publicUrl,
      metadata: { source: 'statamic-local', uploaded_at: new Date().toISOString() }
    }

    const { error: dbErr } = await supabase
      .from('assets')
      .upsert(row, { onConflict: 'original_key' })

    if (dbErr) {
      console.warn('! db upsert failed:', filename, dbErr.message)
      continue
    }

    uploadCount++
    if (uploadCount % 25 === 0) console.log(`...uploaded ${uploadCount} images`)
  }

  console.log(`Done. Uploaded/updated ${uploadCount} images.` )
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
