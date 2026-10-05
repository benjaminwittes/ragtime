import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Dialog } from "radix-ui";
import { SearchIcon } from "lucide-react";

// The same declarations and descriptions the tuning panel lists: the gear reads the panel's registry.
import "@/tune/knobs";
import { KnobRow, type KnobWrite } from "@/tune/controls";
import { allSurfaces, allTunables } from "@/tune/registry";
import {
  TUNE_ENABLED,
  isUserSet,
  resetAllUserValues,
  resetUserValue,
  setUserValue,
  subscribeTune,
  tuneVersion,
} from "@/tune/store";
import type { Tunable } from "@/tune/types";
import { find, type Candidate } from "./search";

/**
 * The settings palette: a box that finds settings as you type and shows each one as the
 * control it is. It lists the tuning registry (`src/tune/`), so a setting is one more knob
 * with `user: true` and nothing here changes. A reader sees the settings marked for readers;
 * where tuning is on, the tuner's knobs are listed too, after those, marked as tuning.
 *
 * What a reader moves is theirs and kept in their browser (`setUserValue`); what a tuner
 * moves is the tuner's (`setTuneValue`), as it is in the panel.
 */

const READER: KnobWrite = {
  set: setUserValue,
  reset: resetUserValue,
  changed: isUserSet,
};
/** Rows shown before the reader is asked to type more; a scope with more than this is a long list. */
const LIMIT = 40;
/** With this few settings in all, the empty palette just lists them. */
const SHORT = 8;

function useTuneVersion(): number {
  return useSyncExternalStore(subscribeTune, tuneVersion, tuneVersion);
}

function candidates(): Candidate[] {
  const labels = new Map(allSurfaces().map((s) => [s.id, s.label]));
  return allTunables()
    .filter((k) => k.label && (TUNE_ENABLED || k.user))
    .map((knob) => ({
      knob,
      scope:
        knob.scope === "global"
          ? "Globals"
          : (labels.get(knob.scope) ?? knob.scope),
    }));
}

export default function SettingsPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/20 backdrop-blur-[2px]" />
        {/* The body is the content's child, so it is mounted only while the palette is open and
            a reopened one starts with an empty box. */}
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-xl border border-lawfare-line bg-lawfare-paper shadow-2xl outline-none"
        >
          <Body onOpenChange={onOpenChange} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Body({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useTuneVersion();
  const [all] = useState(candidates);

  // Focus the box once the dialog has finished placing itself.
  useEffect(() => {
    input.current?.focus();
  }, []);

  const q = query.trim();
  const short = all.length <= SHORT;
  const results = q ? find(all, q) : short ? all : [];
  const shown = results.slice(0, LIMIT);
  const counts = new Map<string, number>();
  for (const c of all) counts.set(c.scope, (counts.get(c.scope) ?? 0) + 1);
  const scopes = [...counts];
  const mine = all.some((c) => isUserSet(c.knob.id));

  // Grouped as the panel groups them: by scope, then by the group a knob names.
  const sections: { scope: string; group: string; rows: Candidate[] }[] = [];
  for (const c of shown) {
    const last = sections[sections.length - 1];
    if (last && last.scope === c.scope && last.group === c.knob.group)
      last.rows.push(c);
    else sections.push({ scope: c.scope, group: c.knob.group, rows: [c] });
  }

  return (
    <>
      <Dialog.Title className="sr-only">Settings</Dialog.Title>
      <div className="flex items-center gap-2 border-b border-lawfare-line px-4 py-3">
        <SearchIcon
          className="size-4 shrink-0 text-lawfare-muted"
          aria-hidden
        />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            short ? "Search settings" : "Search settings, such as “owl”"
          }
          aria-label="Search settings"
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent font-serif text-lg outline-none placeholder:text-lawfare-muted"
        />
        <kbd className="hidden rounded border border-lawfare-line px-1.5 text-[11px] text-lawfare-muted sm:inline">
          esc
        </kbd>
      </div>

      <div className="rt-row-host min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {!q && !short ? (
          <div className="grid gap-1">
            <p className="mb-1 text-[11px] uppercase tracking-wide text-lawfare-muted">
              Settings for
            </p>
            {scopes.map(([scope, n]) => (
              <button
                key={scope}
                type="button"
                onClick={() => {
                  setQuery(scope);
                  input.current?.focus();
                }}
                className="flex items-baseline justify-between rounded-md px-2 py-1.5 text-left font-serif text-base hover:bg-lawfare-line/40"
              >
                {scope}
                <span className="font-sans text-xs text-lawfare-muted">
                  {n}
                </span>
              </button>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-lawfare-muted">
            No setting matches &ldquo;{q}&rdquo;.
          </p>
        ) : (
          sections.map((s) => (
            <section key={s.scope + s.group} className="mb-3">
              <h3 className="mb-1 flex items-baseline gap-2 border-b border-lawfare-line pb-1 text-[11px] uppercase tracking-wide text-lawfare-muted">
                <span>{s.scope}</span>
                <span aria-hidden>/</span>
                <span>{s.group}</span>
              </h3>
              {s.rows.map(({ knob }) => (
                <Row key={knob.id} knob={knob} />
              ))}
            </section>
          ))
        )}
        {results.length > shown.length ? (
          <p className="pt-1 text-xs text-lawfare-muted">
            {results.length - shown.length} more. Type more of the name to
            narrow it.
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-lawfare-line px-4 py-2 text-xs text-lawfare-muted">
        <span>Kept in this browser.</span>
        <span className="flex items-center gap-3">
          {TUNE_ENABLED ? (
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                onOpenChange(false);
                window.dispatchEvent(
                  new KeyboardEvent("keydown", {
                    code: "KeyT",
                    key: "t",
                    altKey: true,
                  }),
                );
              }}
            >
              Open the tuning panel
            </button>
          ) : null}
          {mine ? (
            <button
              type="button"
              className="underline underline-offset-2 hover:text-foreground"
              onClick={resetAllUserValues}
            >
              Reset mine
            </button>
          ) : null}
        </span>
      </div>
    </>
  );
}

/** A reader's setting writes the reader's store; a tuner's writes the tuner's, and says so. */
function Row({ knob }: { knob: Tunable }) {
  return (
    <div>
      <KnobRow knob={knob} write={knob.user ? READER : undefined} />
      {knob.user ? null : (
        <div className="-mt-1 text-[10px] uppercase tracking-wide text-[#b0792a]">
          tuning
        </div>
      )}
    </div>
  );
}
