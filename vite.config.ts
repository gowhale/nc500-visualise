import { defineConfig } from 'vite'

// GitHub Pages serves the site from /<repo-name>/, so the deploy workflow
// sets VITE_BASE accordingly; local dev and preview use '/'.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
})
