import { lazy } from '../lazy'

/** The speech code (`SpeechLayer.tsx`), fetched the first time an owl with a voice asks for it. */
export const layer = lazy(() => import('./SpeechLayer'))

/** For what has to have the speech code before it renders: the tests. */
export function loadSpeechLayer() {
  return layer.load()
}
