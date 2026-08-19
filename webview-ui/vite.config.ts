import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Built for use inside a VS Code webview: relative asset paths so the
// extension host can rewrite them via `<base href>` + webview.asWebviewUri().
export default defineConfig(() => ({
    base: './',
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(import.meta.dirname, './src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
    server: {
        port: 5174,
        open: true,
    },
}));
