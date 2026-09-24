// First, and deliberately: it tells `@lawfare/ragtime-client` which worker to call, and
// that has to be settled before any other module's body can make a corpus call. See the
// file itself for why this is an import rather than a statement below.
import '@/lib/worker-url'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AccessGate } from '@/auth/AccessGate'
import { OAuthConsent } from '@/auth/OAuthConsent'
import { isConsentPath } from '@/auth/oauth-consent'
import { PaidProvider } from '@/auth/paid-context'
import { DocsProvider } from '@/docs/DocsContext'
import { ByokProvider } from '@/llm/byok-context'
import { toLogical } from '@/lib/routing'

// The OAuth consent page stands outside the beta wall and the app shell: a
// connector user is sent here mid-flow by the APP project's OAuth server and
// needs only a session (PaidProvider) and a yes/no. See OAuthConsent.tsx.
const consent = isConsentPath(toLogical(window.location.pathname))

// The design-tuning layer: a panel that moves the tokens and parameters the
// pages declare, live, and writes the ones you keep back to source
// (`src/tune/README.md`). Dev by default, opt-in for a branch deploy with
// VITE_TUNER=1, and absent from a plain production build — `__RT_TUNE__` is
// substituted as the literal `false` there, so this whole block folds away and
// the bundler never follows the import under it. Read through an imported
// constant instead, and the panel ships as an unreachable chunk.
if (__RT_TUNE__) {
  void import('@/tune/mount').then((m) => m.startTuning())
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {consent ? (
      <PaidProvider>
        <OAuthConsent />
      </PaidProvider>
    ) : (
      <AccessGate>
        <PaidProvider>
          <ByokProvider>
            <DocsProvider>
              <App />
            </DocsProvider>
          </ByokProvider>
        </PaidProvider>
      </AccessGate>
    )}
  </StrictMode>,
)
