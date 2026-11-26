import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
// The site's typeface, served from the site itself (no request to Google when a page loads).
import '@fontsource/eb-garamond/400.css'
import '@fontsource/eb-garamond/400-italic.css'
import '@fontsource/eb-garamond/500.css'
import '@fontsource/eb-garamond/600.css'
import './index.css'
import App from './App'
import { AuthProvider } from './lib/auth'

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
)
