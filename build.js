import 'dotenv/config';
import { build } from 'vite';
import * as fs from 'node:fs/promises';
import { replaceInFileSync } from 'replace-in-file';

const args = process.argv;
args.shift();
args.shift();

const command = args[0];
args.shift();

const commands = {
	static: async function () {
		console.log('Running static vite build');
		process.env.NWJS_BUILD_STATIC = '1';
		await build();
		delete process.env.NWJS_BUILD_STATIC;
		console.log('Static vite build success!');
	},
	api: async function () {
		console.log('Running api vite build');
		process.env.NWJS_BUILD_API = '1';
		await build();
		delete process.env.NWJS_BUILD_API;
		console.log('API vite build success!');
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
	}
};

commands[command]();

/** @param {{find:string, replace:string, files:string}} param */
function TextReplace({ find, replace, files }) {
	replaceInFileSync({ files, from: find, to: replace });
}
