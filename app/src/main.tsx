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
