import { default as adapterNode } from '@sveltejs/adapter-node';
import { default as adapterStatic } from '@sveltejs/adapter-static';
import 'dotenv/config';

const NWJS_BUILD_STATIC = process.env.NWJS_BUILD_STATIC;
const NWJS_BUILD_API = process.env.NWJS_BUILD_API;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: NWJS_BUILD_STATIC ? adapterStatic() : adapterNode(),
		files: {
			routes: NWJS_BUILD_STATIC
				? 'src/routes/(main)'
				: NWJS_BUILD_API
					? 'src/routes/(api)'
					: 'src/routes'
		}
	}
};

export default config;
