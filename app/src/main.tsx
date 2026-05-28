import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DocsProvider } from '@/docs/DocsContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DocsProvider>
      <App />
    </DocsProvider>
  </StrictMode>,
)
