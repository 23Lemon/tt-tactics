import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { createServer } from 'vite'

const args = process.argv.slice(2)
const value = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1] }
const server = await createServer({
  configFile: false,
  root: fileURLToPath(new URL('./', import.meta.url)),
  publicDir: fileURLToPath(new URL('../public/', import.meta.url)),
  plugins: [react()],
  server: { host: value('--host') || '127.0.0.1', port: Number(value('--port') || 18796), strictPort: true, fs: { allow: [fileURLToPath(new URL('../', import.meta.url))] } },
})
await server.listen()
server.printUrls()
