import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react({
      plugins: [
        ['@swc/plugin-optimize-react', {}]
      ]
    }),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
          ui: [
            '@radix-ui/react-dialog', 
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-avatar',
            '@radix-ui/react-toast'
          ],
          forms: [
            'react-hook-form',
            '@hookform/resolvers',
            'zod'
          ],
          utils: [
            'date-fns',
            'clsx',
            'tailwind-merge'
          ],
          supabase: ['@supabase/supabase-js'],
          query: ['@tanstack/react-query']
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'react', 
      'react-dom', 
      'react-router-dom',
      '@supabase/supabase-js',
      'date-fns',
      'zustand'
    ],
    esbuildOptions: {
      target: 'es2020',
    },
  },
  esbuild: {
    jsxInject: `import React from 'react'`,
    legalComments: 'none',
    target: 'es2020',
    treeShaking: true,
  },
}));