import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In production Vercel serves api/scan-email.js; this runs the same function under `npm run dev`
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api/scan-email', async (req, res) => {
        const { default: handler } = await server.ssrLoadModule('/api/scan-email.js')
        await handler(req, res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApi()],
  // The Outlook app registration whitelists http://localhost:5173, so don't let Vite move to another port
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        redirect: 'redirect.html',
      },
    },
  },
})
