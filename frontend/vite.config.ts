import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: '../static',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.0.121:9621',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://192.168.0.121:9621',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
