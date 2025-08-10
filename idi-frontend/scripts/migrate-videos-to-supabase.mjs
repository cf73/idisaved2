import { createClient } from '@supabase/supabase-js'
import path from 'path'

const SUPABASE_URL = 'https://fefkdvnxqkmvmrpwxhqn.supabase.co'
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZlZmtkdm54cWttdm1ycHd4aHFuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NDc3MTkxOCwiZXhwIjoyMDcwMzQ3OTE4fQ.mETavHEGrui4ba8xCdAL3VOyvZbFio-OCQEMA0cifyI'
const STORAGE_BUCKET = 'assets'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const VIDEO_EXTS = new Set(['.mp4', '.m4v', '.mov'])

function contentTypeFor(filename) {
  const ext = path.extname(filename).toLowerCase()
  if (ext === '.mov') return 'video/quicktime'
  if (ext === '.m4v') return 'video/x-m4v'
  return 'video/mp4'
}

async function main() {
  console.log('Querying assets table for S3-hosted videos...')
  const { data: rows, error } = await supabase
    .from('assets')
    .select('id, filename, file_url, original_key, file_type')
    .eq('file_type', 'video')

  if (error) throw error

  const candidates = (rows || []).filter(r =>
    typeof r.file_url === 'string' && r.file_url.includes('amazonaws.com') && VIDEO_EXTS.has(path.extname(r.filename).toLowerCase())
  )

  console.log(`Found ${candidates.length} videos to migrate.`)
  let migrated = 0
  for (const row of candidates) {
    const filename = row.filename
    const destKey = `videos/${filename}`

    try {
      console.log(`→ ${filename}`)
      const resp = await fetch(row.file_url)
      if (!resp.ok) {
        console.warn(`  ! download failed ${resp.status} for ${row.file_url}`)
        continue
      }
      const arrayBuf = await resp.arrayBuffer()
      const contentType = contentTypeFor(filename)

      const { error: upErr } = await supabase
        .storage
        .from(STORAGE_BUCKET)
        .upload(destKey, arrayBuf, { upsert: true, contentType })
      if (upErr) {
        console.warn('  ! upload failed:', upErr.message)
        continue
      }

      const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(destKey)
      const publicUrl = pub?.publicUrl
      if (!publicUrl) {
        console.warn('  ! missing public URL after upload')
        continue
      }

      const { error: updErr } = await supabase
        .from('assets')
        .update({ file_url: publicUrl, original_key: destKey })
        .eq('id', row.id)
      if (updErr) {
        console.warn('  ! db update failed:', updErr.message)
        continue
      }

      migrated++
      console.log(`  ✓ migrated to ${publicUrl}`)
    } catch (e) {
      console.warn('  ! exception:', e.message)
    }
  }

  console.log(`Done. Migrated ${migrated}/${candidates.length} videos.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
