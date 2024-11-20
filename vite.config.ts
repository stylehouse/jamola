import { sveltekit } from '@sveltejs/kit/vite';
import { type ViteDevServer, defineConfig } from 'vite'
import { webSocketServer } from '$lib/serve-webrtc-signals'

export default defineConfig({
	plugins: [sveltekit(), webSocketServer]
});
