# Drivers

Scripts that open the app in Chrome and use it, for the things a unit test cannot see.

`npm test` covers the pure modules — what a label should read, which conversation should be
evicted, whether a href is in-app. These cover the rest: whether the row wraps, whether Back
comes back, whether a click opens a second tab. Every defect they have caught was invisible
to reading:

- eviction trusted its list to be sorted, so being wrong once would have thrown away the
  **newest** conversation instead of the oldest, silently;
- the conversation list said "just now" for everything, because opening the page re-saved
  whichever conversation it landed on;
- `Alt+T` was dead on macOS — Option+T types `†`, so `event.key` never matched;
- the trail white-screened twice on tool results whose shape this build had not seen.

## Running them

They drive a dev server; start one first and pass its URL if it is not on 5173. Vite climbs
past a held port, which it will do whenever another checkout is already running.

```sh
npm run dev -w app                       # prints the port it actually got
npm run e2e -w app                       # all of them, against :5173
E2E_BASE=http://localhost:5175/ragtime npm run e2e -w app
```

One at a time, which is the usual way:

```sh
node e2e/scenarios.mjs                   # a whole turn, in each shape a turn takes
node e2e/scenarios.mjs quota,baddetail   # just the two that used to white-screen
node e2e/conversations.mjs               # keeping, adopting and forgetting conversations
node e2e/links.mjs                       # where every link in an answer goes
node e2e/cross.mjs                       # the seam: a citation followed out, and Back
E2E_W=1440 node e2e/cross.mjs            # the same at desktop width
node e2e/band.mjs                        # whether the band keeps to one row
node e2e/band.mjs --candidates           # measure wordings before choosing one
node e2e/spokes.mjs                      # the hub and all eleven spokes, which this
                                         #   branch changed without being about them
```

`E2E_SHOTS` moves the screenshots; they land in `e2e/shots/`, which is gitignored.

## Nothing here spends

**Only `POST …/explorer/turn` is intercepted**, and it is intercepted in the page by
overriding `window.fetch`. Everything under that stays real — the client's SSE parser,
`useExplorer`, `persist`, `conversations`, `attention`, every component — and the corpus
registry is fetched from the live worker, so the chips are the real ones. What is faked is
the model's answer, which is the only part that costs money.

So no credential is needed. The demo password the harness sets is a string the stubbed turn
never checks; it is there only so `useAuth()` resolves something and the composer opens.

A 401 in the console is expected and is that same stub password being refused by the real
worker for something the drivers do not exercise.

## Writing one

`harness.mjs` owns the browser, the stub, and the page-reading helpers. A driver is a
script, not a test framework: it drives the page, prints every expectation it checked —
passing ones included, because a run that prints only failures cannot be told apart from a
run that checked nothing — and exits non-zero if any failed.

```js
import { launch, ctxWith, conversation, log, scoreboard, EXPLORER } from './harness.mjs'

const { check, report } = scoreboard('my driver')
const browser = await launch()
const ctx = await ctxWith(browser, { viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
await page.goto(EXPLORER, { waitUntil: 'networkidle' })
// …
process.exit(report() ? 1 : 0)
```

Three things that will bite, each of which cost a debugging session here:

- **An init script is serialised and run in the page.** A function closing over a variable
  in this file arrives there with that variable undefined and seeds nothing, silently. Pass
  script *source* with the value inlined — that is what `seedOf` in `band.mjs` does.
- **The stub's scenario table is built once, when the stub installs.** Anything that must
  differ per turn has to be substituted as the frame goes out, not read while the table is
  built. `__MARK__` is the worked example.
- **Measure the container, not the tops of its children.** "Did this row wrap" looks like a
  question about where the children are, and asking it that way reports a wrap on every row
  holding an icon centred against text — they sit a few pixels apart, and on the hub as much
  as 24px apart, inside one 28px row. A wrap is the thing that makes the *row* taller. This
  cost eleven false failures before the check measured the right box.

And when a check goes green, make it fail on purpose before believing it. `spokes.mjs`'s
row check was confirmed by forcing a long label into the control and watching the row go
from 28px to 154px — without that, a check that could never fail and a check that passes
look exactly alike.

## Why `playwright-core`

These launch the Chrome already on the machine (`channel: 'chrome'`), so the browsers the
full `playwright` package downloads on install would never be opened. `playwright-core` is a
single small dependency with no download step, which is what keeps it off CI's critical
path. They are not wired into CI: they need a running dev server and a real browser, and
they are for a person who is about to change something and wants to know what they broke.
