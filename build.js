import 'dotenv/config';
import { build } from 'vite';
import * as fs from 'node:fs/promises';
import { replaceInFileSync } from 'replace-in-file';
import nwbuild from 'nw-builder';
import { rollup } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';

const args = process.argv;
args.shift();
args.shift();

const command = args[0];
args.shift();

const defaultNodeJsExternalLibs = [
	'node:fs',
	'node:path',
	'node:url',
	'node:stream',
	'node:buffer',
	'node:crypto',
	'crypto',
	'http',
	'https',
	'fs',
	'path',
	'querystring'
];

const commands = {
	static: async function () {
		console.log('Running static vite build');
		process.env.NWJS_BUILD_STATIC = '1';
		await build();
		delete process.env.NWJS_BUILD_STATIC;
		console.log('Static vite build success!');
	},
	prebuild: async function () {
		console.log('Copying files from src/nw to build folder');
		await fs.cp('./src/nw', './build', { recursive: true });
		console.log('Replacing nwjs index.js entry point from localhost to index.html');
		TextReplace({
			find: 'http://localhost:5173',
			replace: 'index.html',
			files: './build/index.js'
		});
	},
	nw: async function () {
		console.log('Building nwjs binary (will take awhile if no cache is available)');
		/**@type {import('./src/nw/package.json')} */
		const packagejson = JSON.parse(await fs.readFile('./build/package.json'));
		console.log(packagejson);
		await nwbuild({
			logLevel: 'info',
			mode: 'build',
			platform: 'win',
			arch: 'x64',
			outDir: 'dist',
			srcDir: 'build',
			glob: false,
			version: 'stable',
			flavor: 'normal', // or 'sdk' for debug purposes
			cache: true,
			name: packagejson.name,
			app: {
				// This object defines additional properties used for building for a specific platform.
				// See https://github.com/nwutils/nw-builder#app-configuration-object
			},
			managedManifest: {
				...packagejson,
				...{
					// you may add new fields for your nwjs package.json here as you see fit
					// See https://github.com/nwutils/nw-builder#build-mode
				}
			}
		});
		console.log('NWJS Binary build done!');
	},
	api: async function () {
		console.log('Running api vite build');
		process.env.NWJS_BUILD_API = '1';
		await build();
		delete process.env.NWJS_BUILD_API;
		console.log('API vite build success!');
	},
	esmtocjs: async function () {
		console.log('Removing Top-Level-Await on build/handler.js');
		TextReplace({
			find: 'await server.init({',
			replace: 'server.init({',
			files: './build/handler.js'
		});
		console.log('Transpiling API code to CJS');
		const bundle = await rollup({
			input: './build/index.js',
			external: [
				...defaultNodeJsExternalLibs,
				...[
					// add libraries here that you don't want to be transpiled and
					// be treated as external libraries by rollup
				]
			],
			plugins: [resolve(), json(), commonjs()]
		});
		await bundle.write({
			dir: './predist',
			format: 'cjs'
		});
		console.log('Transpilation done!');
		console.log('Renaming predist/index.js to index.cjs');
		await fs.rename('./predist/index.js', './predist/index.cjs');
		console.log(
			' - You can test the API server by going in this folder and doing "node index.cjs".'
		);
	}
};

commands[command]();

/** @param {{find:string, replace:string, files:string}} param */
function TextReplace({ find, replace, files }) {
	replaceInFileSync({ files, from: find, to: replace });
}
