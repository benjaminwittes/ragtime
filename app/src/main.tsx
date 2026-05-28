import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PaidProvider } from '@/auth/paid-context'
import { DocsProvider } from '@/docs/DocsContext'
import { ByokProvider } from '@/llm/byok-context'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PaidProvider>
      <ByokProvider>
        <DocsProvider>
          <App />
        </DocsProvider>
      </ByokProvider>
    </PaidProvider>
  </StrictMode>,
)
