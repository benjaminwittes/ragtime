# Tuning

A design parameter you can move while looking at the page, and keep by writing
it back to the file it came from.

```
npm run dev            # then Alt+T on any page
```

The panel lists **Globals** (the tokens in `index.css`) and a tab per surface
that is on screen. Drag something; the page answers. What you keep, you write.

## Why it exists

Two kinds of design question are expensive to answer by editing a file and
reloading. *How wide should the answer be* is one — 80ch and 72ch are a
paragraph apart on screen and identical in a diff. *How many rows does a preview
owe the reader* is the other, and no stylesheet can reach it. The tool covers
both, from one registry, because they are the same question asked of different
material.

The tool is only as good as the parameterization under it. A literal buried in
a utility class is not a parameter; promoting it is a one-line edit you make as
you go (below), and the registry is where it becomes arguable.

## The three states a value can be in

| State | Where it lives | How it leaves |
|---|---|---|
| Overlaid | one `<style>` element, this tab only | a drag |
| Kept | the file it was declared in | **Write to source** → HMR |
| Named | `presets.ts` (committed) or this browser | **Save** / **Commit preset** |

Dragging never writes. A file written on every frame is a laggy drag and a
working tree full of values nobody chose — the *decision* is the event worth
recording, so one button turns the overlay into real edits and drops the
override, because the source now says it.

## Adding a knob

**A colour, size or spacing that is already a custom property** — declare it:

```ts
// src/<surface>/tune.ts
{
  id: 'explorer.measure', label: 'Answer measure', group: 'Layout',
  scope: 'explorer', kind: 'length', value: '80ch', prop: '--x-measure',
  units: ['ch', 'rem', 'px'], min: 40, max: 120, step: 1,
  source: { file: 'src/explorer/explorer.css', selector: '.explorer' },
}
```

`value` is the default **as authored in source**, and `source` is the block it
is authored in. Both have to be true: a default that lies makes "changed from
source" lie with it, and a wrong `source` makes the write land nowhere.

**A literal that is not a property yet** — promote it first. Name it in the
surface's token block, reference it where the literal was, then declare the
knob. In CSS that is `max-width: var(--x-measure)`; in Tailwind markup it is
`max-w-[var(--hub-measure)]`. The value does not change — only where it is
written.

**A number the page computes with** — leave `prop` off and read it with the
hook. The declaration is the default that ships:

```ts
{ id: 'hub.previewRows', label: 'Preview rows', group: 'Behaviour',
  scope: 'hub', kind: 'int', value: 25, min: 3, max: 100,
  source: { file: 'src/hub/tune.ts' } }

const rows = useTunable<number>('hub.previewRows')   // 25 in production
```

**A new surface** — one `defineSurface` with a selector that is in the DOM when
the page is (the hub marks itself `data-tune="hub"`), and one line in
`knobs.ts`. The panel finds it by asking the document, so nothing else needs to
know the page exists.

## Comparing two tunings

A preset is a named set of values, and it goes in a URL:

```
localhost:5175/ragtime/explorer#tune=warm      # named; resolved from presets.ts
localhost:5175/ragtime/explorer#tune=~eyJ…     # the values themselves, self-contained
```

**Copy link** gives you the self-contained form — what another machine or a
screenshot rig can open without your localStorage. A page opened on a preset
hides the panel's handle, so what gets photographed is the page.

That is the seam into the compare rig in `spikes/explorer-mockups` (private
side): shoot the same route twice under two presets and put them side by side,
rather than tuning back and forth from memory.

## What ships

Nothing. `__RT_TUNE__` is substituted by Vite as a literal, so `if (__RT_TUNE__)`
in `main.tsx` folds away in a production build and the panel, its stylesheet and
every declaration file leave no chunk behind — verified by building and grepping
`dist/` for `rt-tune`. What does ship is `useTunable` returning declared
defaults, which is what the literals did before.

`VITE_TUNER=1 npm run build` is the exception, and the reason it exists: a
branch deploy someone can tune in front of you. Write-to-source is off there —
there is no dev server to take it — so a tuning leaves that machine as a URL.

## Files

| File | Role |
|---|---|
| `types.ts` · `registry.ts` | what a knob and a surface are; declare by side effect on import |
| `store.ts` | the values in force. Ships. Hydrates from `#tune=…` or this browser |
| `useTunable.ts` | how page code reads a runtime knob. Ships |
| `overlay.ts` | the live `<style>`, and the CSS "Copy CSS" hands over |
| `TunePanel.tsx` · `tune.css` | the panel. Literal values, no app tokens — the instrument must survive tuning the thing it tunes |
| `write.ts` · `../../vite-plugin-tune.ts` | write-to-source: the browser says what, the dev server decides whether |
| `knobs.global.ts` · `knobs.ts` · `presets.ts` | the global tokens; the barrel the panel imports; committed tunings |
