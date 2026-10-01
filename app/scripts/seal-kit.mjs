#!/usr/bin/env node
/**
 * Seal a presenter's kit — a guide and a deck — into one encrypted file the
 * app can serve from a public repository.
 *
 * The app is a static site built from a public repo, so it has no server to
 * ask "may this reader see this?" and nowhere private to keep a page. What it
 * can do is ship ciphertext: the kit is written elsewhere, sealed here with a
 * passphrase, and the sealed file is what gets committed. `/demo` fetches it
 * and opens it in the browser with a passphrase that arrives in the link's
 * fragment (`/demo#k=…`), which a browser never sends to any server.
 *
 * So the plain text is never in this repository, in its history, or in the
 * built bundle. What is public is the fact that a kit exists, its size, and
 * the ciphertext — which is as safe as the passphrase is long, and this
 * script writes one of 24 characters from a 62-letter alphabet when asked to
 * make it.
 *
 * One more thing is public, deliberately: the public half of a signing key.
 * A kit can drive `/stage`, where an audience follows a presenter live, and
 * the audience's browsers have to be able to tell the presenter from anyone
 * else on an open channel. The private half is inside the seal, so the
 * passphrase that opens the kit is also what lets someone present; the
 * public half sits beside the ciphertext as `stage.pub`, and can only check.
 *
 *   node app/scripts/seal-kit.mjs --from <dir> --key-file <path>
 *   node app/scripts/seal-kit.mjs --from <dir> --key-file <path> --out app/public/kits/demo.sealed.json
 *
 * `--from` is a directory holding:
 *
 *   kit.json    { "title": "…", "when": "…" }
 *   guide.md    the presenter's guide, markdown
 *   deck.md     the slides, markdown: one slide per `---` line; the first
 *               `# heading` is the slide's title; an optional first line
 *               `part: <label>` names its section; everything after a line
 *               that is exactly `???` is the presenter's notes
 *
 * `--out` defaults to `app/public/kits/demo.sealed.json`, which is where `/demo`
 * looks. Not under `public/demo/`: a directory of that name would contend with
 * the route for one path on a static host.
 *
 * `--key-file` holds the passphrase, and is the only place it is ever
 * written. If the file exists its contents are used, so re-sealing after an
 * edit keeps every link already handed out working. If it does not exist, a
 * passphrase is generated and written there (mode 600). **The passphrase is
 * never printed**: this script's output is safe to paste into a pull request.
 *
 * The format is the contract with `src/demo/kit.ts`, which opens it, and
 * `src/demo/kit.test.ts` seals with this file and opens with that one, so the
 * two cannot drift apart unnoticed.
 */
import { webcrypto } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export const FORMAT = { v: 1, kdf: 'PBKDF2-SHA-256', cipher: 'AES-256-GCM', iterations: 310_000 }

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/** A passphrase with no character a URL fragment or a chat client would mangle. */
export function newPassphrase(length = 24) {
  // Rejection sampling: 248 is the largest multiple of 62 a byte can hold, and
  // taking `byte % 62` over all 256 would favour the first eight letters.
  let out = ''
  while (out.length < length) {
    for (const byte of webcrypto.getRandomValues(new Uint8Array(length))) {
      if (byte < 248 && out.length < length) out += ALPHABET[byte % 62]
    }
  }
  return out
}

const b64 = (bytes) => Buffer.from(bytes).toString('base64')

/** Seal a string. Returns the object `kit.ts` reads. */
export async function seal(plaintext, passphrase) {
  const salt = webcrypto.getRandomValues(new Uint8Array(16))
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: FORMAT.iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  )
  const data = await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext))
  return { ...FORMAT, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) }
}

/**
 * `deck.md` → slides. Deliberately small: a slide is a title and markdown,
 * and anything cleverer belongs in the markdown.
 */
export function parseDeck(source) {
  return source
    .split(/^---\s*$/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [shown, ...rest] = chunk.split(/^\?\?\?\s*$/m)
      const lines = shown.trim().split('\n')
      let part = ''
      if (/^part:/i.test(lines[0] ?? '')) part = lines.shift().replace(/^part:/i, '').trim()
      while (lines.length && !lines[0].trim()) lines.shift()
      let title = ''
      if (/^#\s+/.test(lines[0] ?? '')) title = lines.shift().replace(/^#\s+/, '').trim()
      return { part, title, body: lines.join('\n').trim(), notes: rest.join('???').trim() }
    })
}

/** Open what `seal` made. Returns the plain text, or null for a wrong passphrase. */
export async function unseal(sealed, passphrase) {
  try {
    const bytes = (b) => new Uint8Array(Buffer.from(b, 'base64'))
    const material = await webcrypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
    const key = await webcrypto.subtle.deriveKey(
      { name: 'PBKDF2', hash: 'SHA-256', salt: bytes(sealed.salt), iterations: sealed.iterations },
      material,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    )
    const plain = await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(sealed.iv) }, key, bytes(sealed.data))
    return new TextDecoder().decode(plain)
  } catch {
    return null
  }
}

/**
 * The pair a presenter signs with to drive `/stage`, and the audience checks against
 * (`src/stage/protocol.ts` says why the stage needs one). The private half goes inside
 * the seal; the public half is served beside it in the clear.
 */
export async function newStageKeys() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  return {
    key: await webcrypto.subtle.exportKey('jwk', pair.privateKey),
    pub: await webcrypto.subtle.exportKey('jwk', pair.publicKey),
  }
}

/**
 * The signing pair already in a sealed file, if this passphrase opens it. Re-sealing
 * after an edit then keeps the same stage, so a presenter mid-rehearsal is not cut off
 * from their audience by a typo fix. A new passphrase gets a new pair, which is what
 * revoking a kit should mean for the stage too.
 */
export async function stageKeysIn(file, passphrase) {
  try {
    const sealed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const plain = await unseal(sealed, passphrase)
    const key = plain === null ? null : JSON.parse(plain).stage?.key
    return key && sealed.stage?.pub ? { key, pub: sealed.stage.pub } : null
  } catch {
    return null
  }
}

function args(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]
  }
  return out
}

async function main() {
  const a = args(process.argv.slice(2))
  if (!a.from || !a['key-file']) {
    console.error('usage: seal-kit.mjs --from <dir> --key-file <path> [--out <file>]')
    process.exit(2)
  }
  const from = path.resolve(a.from)
  const out = path.resolve(a.out || path.join(HERE, '..', 'public', 'kits', 'demo.sealed.json'))
  const keyFile = path.resolve(a['key-file'])

  const meta = JSON.parse(fs.readFileSync(path.join(from, 'kit.json'), 'utf8'))
  const guide = fs.readFileSync(path.join(from, 'guide.md'), 'utf8')
  const slides = parseDeck(fs.readFileSync(path.join(from, 'deck.md'), 'utf8'))
  const kit = { title: meta.title, when: meta.when, guide, slides }

  let made = false
  if (!fs.existsSync(keyFile)) {
    fs.mkdirSync(path.dirname(keyFile), { recursive: true })
    fs.writeFileSync(keyFile, newPassphrase() + '\n', { mode: 0o600 })
    made = true
  }
  const passphrase = fs.readFileSync(keyFile, 'utf8').trim()
  if (passphrase.length < 16) {
    console.error(`seal-kit: the passphrase in ${keyFile} is shorter than 16 characters; refusing to seal with it.`)
    process.exit(1)
  }

  const kept = await stageKeysIn(out, passphrase)
  const stage = kept ?? (await newStageKeys())

  fs.mkdirSync(path.dirname(out), { recursive: true })
  const sealed = await seal(JSON.stringify({ ...kit, stage: { key: stage.key } }), passphrase)
  fs.writeFileSync(out, JSON.stringify({ ...sealed, stage: { pub: stage.pub } }) + '\n')

  console.log(`sealed "${kit.title}": guide ${guide.length} chars, ${slides.length} slides`)
  console.log(`  -> ${path.relative(process.cwd(), out)}`)
  console.log(`  passphrase ${made ? 'generated and written to' : 'read from'} ${keyFile} (not shown)`)
  console.log(`  stage key ${kept ? 'kept from the file already there' : 'made new'}`)
  console.log('  link: <site>/demo#k=<the passphrase>   present: <site>/present#k=<the passphrase>')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
