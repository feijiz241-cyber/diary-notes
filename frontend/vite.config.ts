/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  root: 'frontend',
  plugins: [react(), tailwindcss()],
  // 显式预打包重依赖：首次冷启动不再逐个爬虫式发现，省 1-2s
  optimizeDeps: {
    include: [
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-image',
      '@tiptap/extension-placeholder',
      '@radix-ui/react-dialog',
      '@radix-ui/react-popover',
      '@radix-ui/react-separator',
      '@radix-ui/react-slot',
      'react-router-dom',
      'lucide-react',
    ],
  },
  server: {
    port: 5188,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:5189',
    },
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          tiptap: ['@tiptap/react', '@tiptap/starter-kit', '@tiptap/extension-image', '@tiptap/extension-placeholder'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}', '../backend/**/*.test.mjs'],
  },
})
