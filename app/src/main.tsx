import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AccessGate } from '@/auth/AccessGate'
import { PaidProvider } from '@/auth/paid-context'
import { DocsProvider } from '@/docs/DocsContext'
import { ByokProvider } from '@/llm/byok-context'

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
    <AccessGate>
      <PaidProvider>
        <ByokProvider>
          <DocsProvider>
            <App />
          </DocsProvider>
        </ByokProvider>
      </PaidProvider>
    </AccessGate>
  </StrictMode>,
)
