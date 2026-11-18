import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base:'./',
  plugins:[react()],
  resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},
  server:{host:'0.0.0.0',allowedHosts:true,port:5173},
  preview:{host:'0.0.0.0',allowedHosts:true},
  worker:{format:'es'},
  build:{rollupOptions:{output:{manualChunks(id){
    if(/\/node_modules\/(react|react-dom|scheduler)\//.test(id))return 'react-runtime'
    if(/\/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(id))return 'motion'
    if(/\/node_modules\/@(?:base-ui|floating-ui)\//.test(id))return 'controls'
  }}}},
})
