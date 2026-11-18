import { cp, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { build } from "vite"

const siteRoot = fileURLToPath(new URL("./", import.meta.url))
const publicDir = fileURLToPath(new URL("../public/", import.meta.url))
const publishDir = fileURLToPath(new URL("../docs/", import.meta.url))
const outDir = await mkdtemp(join(tmpdir(), "tt-pages-"))
try {
  await build({
    configFile: false,
    root: siteRoot,
    publicDir,
    base: "./",
    plugins: [react()],
    build: { outDir, assetsDir: "pages-assets" },
  })
  await rm(join(publishDir, "pages-assets"), { recursive: true, force: true })
  await cp(outDir, publishDir, { recursive: true })
  await writeFile(join(publishDir, ".nojekyll"), "")
} finally {
  await rm(outDir, { recursive: true, force: true })
}
