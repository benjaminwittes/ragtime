// The same declarations and descriptions the tuner's panel lists: the reader's settings are knobs.
import './knobs'
import { type KnobWrite } from './controls'
import { Panel } from './Panel'
import { allTunables } from './registry'
import { isUserSet, resetAllUserValues, resetUserValue, setUserValue, subscribeTune, tuneVersion } from './store'
import { useSyncExternalStore } from 'react'

/**
 * The panel as a reader gets it, in a build without the tuner: the knobs marked `user`, each
 * kept in their browser (`setUserValue`), no write to source, no presets, nothing about the
 * design's own values. It is `Panel`, the one the tuner has, with a different list and a
 * different footer. Fetched the first time the gear in the site bar is used.
 */

const READER: KnobWrite = { set: setUserValue, reset: resetUserValue, changed: isUserSet }

const readerKnobs = () => allTunables().filter((k) => k.user)

export default function ReaderPanel() {
  useSyncExternalStore(subscribeTune, tuneVersion, tuneVersion)
  const mine = readerKnobs().some((k) => isUserSet(k.id))
  return (
    <Panel
      title="Settings"
      knobs={readerKnobs}
      write={READER}
      footer={
        <div className="rt-tune-foot">
          <div className="rt-tune-status">Kept in this browser.</div>
          {mine && (
            <div className="rt-tune-buttons">
              <button type="button" className="rt-tune-btn" onClick={resetAllUserValues}>
                Reset mine
              </button>
            </div>
          )}
        </div>
      }
    />
  )
}
