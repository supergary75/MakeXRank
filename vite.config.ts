import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const modeEnv = loadEnv(mode, process.cwd(), '')
  const productionFallback = mode === 'production'
    ? {}
    : loadEnv('production', process.cwd(), '')
  const appEnv = { ...productionFallback, ...modeEnv }
  const exposedViteEnv = Object.fromEntries(
    Object.entries(appEnv)
      .filter(([key]) => key.startsWith('VITE_'))
      .map(([key, value]) => [`import.meta.env.${key}`, JSON.stringify(value)]),
  )

  return {
    plugins: [react()],
    base: '/MakeXRank/',
    define: exposedViteEnv,
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'react-vendor'
            }
          }
        },
      },
    },
  }
})
