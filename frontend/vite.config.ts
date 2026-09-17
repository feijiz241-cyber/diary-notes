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
  // 用独立的预打包目录：换目录会让依赖 URL 变化，从而绕开浏览器里旧缓存
  cacheDir: path.resolve(__dirname, '../node_modules/.vite-dev'),
  server: {
    port: 5188,
    strictPort: true,
    // 本地开发禁用浏览器缓存，避免依赖被长期缓存后出现 net::ERR_CACHE_READ_FAILURE 坏缓存白屏
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
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
