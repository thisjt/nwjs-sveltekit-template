import 'dotenv/config';
import { build } from 'vite';
import * as fs from 'node:fs/promises';
import * as fsSync from 'fs';
import { replaceInFileSync } from 'replace-in-file';
import nwbuild from 'nw-builder';
import { rollup } from 'rollup';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import pkg from '@yao-pkg/pkg';

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

const API_PORT = 3099;

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
		// Top-Level-Await is not supported in CJS
		console.log('Removing Top-Level-Await on build/handler.js');
		TextReplace({
			find: 'await server.init({',
			replace: 'server.init({',
			files: './build/handler.js'
		});
		if (fsSync.existsSync('./predist')) {
			console.log('Cleaning up predist folder');
			fsSync.rmSync('./predist', { recursive: true, force: true });
		}

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

		// This is still a mystery to me. If you have ideas, please answer why rollup is doing this on purpose:
		// https://stackoverflow.com/questions/78453487/why-is-rollup-using-importurl-instead-of-just-putting-importurl-i
		console.log("Replacing \"require('u' + 'rl')\" to \"require('url')\"");
		TextReplace({
			find: "require('u' + 'rl')",
			replace: "require('url')",
			files: './predist/*'
		});

		console.log(`Changing API port to port ${API_PORT}`);
		TextReplace({
			find: "const port = env('PORT', !path && '3000');",
			replace: `const port = env('PORT', !path && '${API_PORT}');`,
			files: './predist/*'
		});

		console.log('Renaming predist/index.js to index.cjs');
		await fs.rename('./predist/index.js', './predist/index.cjs');
		console.log(
			' - You can test the API server by going in this folder and doing "node index.cjs".'
		);
	},
	obfuscate: async function () {
		const ENVARS = [
			// Add the secret keys you want to be obfuscated here
			'PRIVATE_STRING'
		];

		console.log('Obfuscating private keys');
		ENVARS.forEach((envVar) => {
			if (!process.env[envVar]) return;
			console.log(` - ${envVar}`);
			TextReplace({
				find: `"${process.env[envVar]}"`,
				replace: stringObfuscator(process.env[envVar]),
				files: './predist/**/*'
			});
		});
	},
	cjstoexe: async function () {
		console.log('Packaging predist/index.cjs to dist/package.nw/api/api.exe');
		await pkg.exec([
			'--output',
			'./dist/package.nw/api/api.exe',
			'--targets',
			'node20-win-x64',
			'./predist/index.cjs'
		]);
		console.log('Done packaging predist/index.cjs to dist/package.nw/api/api.exe');
	},
	all: async function () {
		console.log('Starting build', new Date().toLocaleString());
		await commands.static();
		await commands.prebuild();
		await commands.nw();
		await commands.api();
		await commands.esmtocjs();
		await commands.obfuscate();
		await commands.cjstoexe();
		console.log('Build done!', new Date().toLocaleString());
	}
};

commands[command]();

/** @param {{find:string, replace:string, files:string}} param */
function TextReplace({ find, replace, files }) {
	replaceInFileSync({ files, from: find, to: replace });
}

/**
 * String Obfuscator to protect strings in compiled (bin) source code
 * https://jsfiddle.net/pg07yf87/2/
 * https://stackoverflow.com/questions/14458819/simplest-way-to-obfuscate-and-deobfuscate-a-string-in-javascript
 * @param {string} inputstr
 * @returns {string}
 */
function stringObfuscator(inputstr) {
	let mystr = [];
	let fal = '(![]+[])';
	let tru = '(!![]+[])';
	let und = '([]+[]+[][[]])';
	let obj = '(typeof [])';
	let numb = '(typeof +[])';
	let stri = '(typeof ([]+[]))';
	let bool = '(typeof ![])';
	let arr = '(([]).constructor.name)';
	let reg = '(RegExp().constructor.name)';
	let idk = '([]+[]+([]).constructor)';
	let num = [];
	num[0] = '(+[])';
	num[1] = '(+!+[])';
	num[2] = '((+!+[])+(+!+[]))';
	num[3] = '(+!+[]+((+!+[])+(+!+[])))';
	num[10] = '(+[+!+[]+[+[]]])';
	num[100] = '(+[+!+[]+[+[]+[+[]]]])';

	inputstr
		.toString()
		.split('')
		.forEach((l, k) => {
			switch (l) {
				case 'a':
					mystr[k] = `${fal}[${num[1]}]`;
					break;
				case 'b':
					mystr[k] = `${obj}[${num[1]}]`;
					break;
				case 'c':
					mystr[k] = `${obj}[${num[2]}*${num[2]}]`;
					break;
				case 'd':
					mystr[k] = `${und}[${num[2]}]`;
					break;
				case 'e':
					mystr[k] = `${und}[${num[3]}]`;
					break;
				case 'f':
					mystr[k] = `${fal}[${num[0]}]`;
					break;
				case 'g':
					mystr[k] = `${stri}[${num[10]}/${num[2]}]`;
					break;
				case 'h':
					mystr[k] = "'h'";
					break;
				case 'i':
					mystr[k] = `${und}[${num[10]}/${num[2]}]`;
					break;
				case 'j':
					mystr[k] = `${obj}[${num[2]}]`;
					break;
				case 'k':
					mystr[k] = "'k'";
					break;
				case 'l':
					mystr[k] = `${fal}[${num[2]}]`;
					break;
				case 'm':
					mystr[k] = `${numb}[${num[2]}]`;
					break;
				case 'n':
					mystr[k] = `${und}[${num[1]}]`;
					break;
				case 'o':
					mystr[k] = `${bool}[${num[1]}]`;
					break;
				case 'p':
					mystr[k] = `${reg}[${num[2]}+${num[3]}]`;
					break;
				case 'q':
					mystr[k] = "'q'";
					break;
				case 'r':
					mystr[k] = `${tru}[${num[1]}]`;
					break;
				case 's':
					mystr[k] = `${fal}[${num[3]}]`;
					break;
				case 't':
					mystr[k] = `${tru}[${num[0]}]`;
					break;
				case 'u':
					mystr[k] = `${tru}[${num[2]}]`;
					break;
				case 'v':
					mystr[k] = `${idk}[${num[100]}/${num[2]}/${num[2]}-${num[1]}]`;
					break;
				case 'w':
					mystr[k] = "'w'";
					break;
				case 'x':
					mystr[k] = `${reg}[${num[3]}+${num[1]}]`;
					break;
				case 'y':
					mystr[k] = `${arr}[${num[1]}+${num[3]}]`;
					break;
				case 'z':
					mystr[k] = "'z'";
					break;
				case '\n':
					mystr[k] = '#';
					break;
				default:
					mystr[k] = `\`${l}\``;
			}
		});
	let endstring = mystr.join('+');
	return endstring.replaceAll('#', "''");
}
