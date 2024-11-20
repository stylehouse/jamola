import { sveltekit } from '@sveltejs/kit/vite';
import { type ViteDevServer, defineConfig } from 'vite'
const {webSocketServer} = await import('./src/lib/serve-webrtc-signals')

export default defineConfig({
	plugins: [sveltekit(), webSocketServer]
});
