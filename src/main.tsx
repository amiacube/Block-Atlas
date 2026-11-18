import { StrictMode, useLayoutEffect } from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/inter'
import { GlassThemeProvider } from '@/components/liquikit/glass'
import { PopupEntrance } from '@/components/liquikit/popup'
import { assetUrl, type PreviewMap } from './data'
import { useMedia } from './hooks'
import App from './App'
import './styles.css'

const artwork: Promise<PreviewMap | null> = fetch(assetUrl('data/previews.json')).then(r => r.ok ? r.json() : null).catch(() => null)
const registry: Promise<string[] | null> = fetch(assetUrl('data/registry-ids.json')).then(r => r.ok ? r.json() : null).catch(() => null)
function Root() {
  const theme = useMedia('(prefers-color-scheme: dark)') ? 'dark' : 'light'
  useLayoutEffect(() => { document.documentElement.dataset.appearance = theme }, [theme])
  return <GlassThemeProvider theme={theme}><PopupEntrance.Provider value="fade"><App artwork={artwork} registry={registry}/></PopupEntrance.Provider></GlassThemeProvider>
}
ReactDOM.createRoot(document.getElementById('root')!).render(<StrictMode><Root/></StrictMode>)
