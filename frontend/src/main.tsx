import React from 'react'
import {createRoot} from 'react-dom/client'
import {MantineProvider} from '@mantine/core'
import '@mantine/core/styles.css'
import '@fontsource/iosevka/latin-400.css'
import '@fontsource/iosevka/latin-700.css'
import './app.css'
import App from './App'
import {theme} from './theme'

// ── Zoom normalization ──────────────────────────────────────────────
// WebView and browser can disagree on CSS pixel scale (Linux Wayland +
// WebKitGTK vs compositor DPI). Read a persisted zoom factor so fonts
// match what the user expects. Set via localStorage key `app-zoom`;
// e.g. localStorage['app-zoom'] = '1.15' in devtools, then reload.
// Delete the key to reset to 1.0.
const storedZoom = parseFloat(localStorage.getItem('app-zoom') || '') || 1;
if (storedZoom !== 1) {
    document.documentElement.style.zoom = String(storedZoom);
}

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <MantineProvider theme={theme} forceColorScheme="dark">
            <App/>
        </MantineProvider>
    </React.StrictMode>
)
