import { default as adapterNode } from '@sveltejs/adapter-node';
import { default as adapterStatic } from '@sveltejs/adapter-static';
import 'dotenv/config';

const NWJS_BUILD_STATIC = process.env.NWJS_BUILD_STATIC;
const NWJS_BUILD_API = process.env.NWJS_BUILD_API;

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: NWJS_BUILD_STATIC ? adapterStatic() : adapterNode(),
		files: {
			routes: NWJS_BUILD_STATIC
				? 'src/routes/(main)'
				: NWJS_BUILD_API
					? 'src/routes/(api)'
					: 'src/routes'
		},
		alias: {
			$nw: 'src/nw'
		},
		appDir: 'kit'
	}
};

export default config;
