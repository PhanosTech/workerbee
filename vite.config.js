import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const webPort = Number(process.env.WEB_PORT || 9229);
const apiPort = Number(process.env.API_PORT || 9339);

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            manifest: {
                name: 'WorkerBee',
                short_name: 'WorkerBee',
                description: 'Personal Task Management App',
                theme_color: '#1e1e2e',
                background_color: '#1e1e2e',
                display: 'standalone',
                scope: '/',
                start_url: '/',
                icons: [
                    {
                        src: 'logo.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'logo.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            }
        })
    ],
    server: {
        host: true,
        port: webPort,
        strictPort: true,
        proxy: {
            '/api': `http://127.0.0.1:${apiPort}`
        },
    }
})
