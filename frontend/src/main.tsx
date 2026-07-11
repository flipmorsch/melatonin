import React from 'react'
import {createRoot} from 'react-dom/client'
import {MantineProvider} from '@mantine/core'
import '@mantine/core/styles.css'
import './app.css'
import App from './App'
import {theme} from './theme'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <MantineProvider theme={theme} forceColorScheme="dark">
            <App/>
        </MantineProvider>
    </React.StrictMode>
)
