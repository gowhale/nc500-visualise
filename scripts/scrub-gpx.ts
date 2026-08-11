// Rewrites data/riders/**/*.gpx in place, removing personal data that
// shouldn't land in a public repo: sensor extensions (heart rate, cadence,
// power, temperature), device/creator identifiers, and author metadata.
// Coordinates, elevation, timestamps, and track names are kept.
// Run with: npm run scrub
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RIDERS_DIR = join(process.cwd(), 'data', 'riders')

function scrub(xml: string): { out: string; removed: string[] } {
  const removed: string[] = []
  let out = xml

  const strip = (label: string, re: RegExp) => {
    if (re.test(out)) {
      out = out.replace(re, '')
      removed.push(label)
    }
  }

  strip('sensor/device extensions', /<extensions\b[^>]*>[\s\S]*?<\/extensions>/gi)
  strip('author metadata', /<author\b[^>]*>[\s\S]*?<\/author>/gi)
  strip('email', /<email\b[^>]*\/>|<email\b[^>]*>[\s\S]*?<\/email>/gi)
  strip('links', /<link\b[^>]*\/>|<link\b[^>]*>[\s\S]*?<\/link>/gi)
  strip('keywords', /<keywords\b[^>]*>[\s\S]*?<\/keywords>/gi)
  strip('descriptions/comments', /<(desc|cmt)\b[^>]*>[\s\S]*?<\/\1>/gi)
  strip('source tags', /<src\b[^>]*>[\s\S]*?<\/src>/gi)
  strip('saved waypoints', /<wpt\b[^>]*\/>|<wpt\b[^>]*>[\s\S]*?<\/wpt>/gi)

  const creator = out.match(/creator=("([^"]*)"|'([^']*)')/)
  const creatorValue = creator?.[2] ?? creator?.[3]
  if (creator && creatorValue !== 'nc500-visualise') {
    out = out.replace(/creator=("[^"]*"|'[^']*')/, 'creator="nc500-visualise"')
    removed.push(`creator ("${creatorValue}")`)
  }

  // Collapse blank lines left behind by removed blocks.
  out = out.replace(/\n[ \t]*(?=\n)/g, '')
  return { out, removed }
}

if (!existsSync(RIDERS_DIR)) {
  console.log('Nothing to scrub — data/riders/ does not exist yet.')
  process.exit(0)
}

let files = 0
let touched = 0
for (const entry of readdirSync(RIDERS_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const dir = join(RIDERS_DIR, entry.name)
  for (const f of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.gpx'))) {
    files++
    const path = join(dir, f)
    const { out, removed } = scrub(readFileSync(path, 'utf8'))
    if (removed.length) {
      writeFileSync(path, out)
      touched++
      console.log(`✂ ${entry.name}/${f}: removed ${removed.join(', ')}`)
    } else {
      console.log(`✓ ${entry.name}/${f}: already clean`)
    }
  }
}
console.log(
  files
    ? `\nScrubbed ${touched} of ${files} file(s). Safe to commit.`
    : 'No GPX files found under data/riders/.',
)
