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
import https from 'https';
import unzipper from 'unzipper';
import { exec } from 'child_process';

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

/**@type {import('./package.json')} */
const globalPackageJson = JSON.parse(fsSync.readFileSync('./package.json', { encoding: 'utf-8' }));

const API_PORT = 3099;

const opensslDownloadUrl = 'https://download.firedaemon.com/FireDaemon-OpenSSL/openssl-3.0.14.zip';
const opensslBinaryPath = './openssl-3.0/x64/bin/openssl.exe';

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

		console.log('Grabbing all api fetch commands and prepending localhost');
		TextReplace({
			find: 'fetch\\("/',
			replace: `fetch("https://localhost:${API_PORT}/`,
			files: './build/**/*'
		});
	},
	nw: async function () {
		let sslCrt = '';
		if (process.env.SSLCRT) {
			sslCrt = atob(process.env.SSLCRT || '').replaceAll('\r', '');
		} else {
			if (!fsSync.existsSync('./ssl.crt')) {
				await generateSSL();
			}
			sslCrt = fsSync.readFileSync('./ssl.crt', { encoding: 'utf-8' }).replaceAll('\r', '');
		}

		console.log('Building nwjs binary (will take awhile if no cache is available)');
		/**@type {import('./src/nw/package.json')} */
		const localPackageJson = JSON.parse(
			await fs.readFile('./build/package.json', { encoding: 'utf-8' })
		);
		console.log(localPackageJson);
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
			app: {
				company: `${localPackageJson.name}.exe`,
				fileDescription: globalPackageJson.description,
				fileVersion: 'app',
				internalName: `${localPackageJson.name}.exe`,
				originalFilename: `${localPackageJson.name}.exe`,
				productName: localPackageJson.name,
				productVersion: globalPackageJson.version
			},
			// @ts-ignore: https://github.com/nwutils/nw-builder/issues/1248
			managedManifest: {
				...localPackageJson,
				additional_trust_anchors: [sslCrt],
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

		console.log('Copying serve.js to build folder');
		fsSync.copyFileSync('./src/serve.js', './build/serve.js');

		console.log('Integrating API Port to serve.js');
		TextReplace({
			find: "import { API_PORT } from '../build.js';",
			replace: `const API_PORT = ${API_PORT};`,
			files: './build/serve.js'
		});

		console.log('Transpiling API code to CJS');
		const bundle = await rollup({
			input: './build/serve.js',
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
		fsSync.appendFileSync('./predist/package.json', JSON.stringify({ type: 'commonjs' }));

		console.log(' - You can test the API server by going in "predist" and doing "node serve.js".');
	},
	obfuscate: async function () {
		const ENVARS = [
			// Add the secret keys you want to be obfuscated here
			'PRIVATE_STRING'
		];

		if (process.env.SSLKEY) ENVARS.push('SSLKEY');
		if (process.env.SSLCRT) ENVARS.push('SSLCRT');
		console.log('Obfuscating private keys');
		ENVARS.forEach((envVar) => {
			if (!process.env[envVar]) return;
			console.log(` - ${envVar}`);
			const obfuscated = stringObfuscator(process.env[envVar] || '##error##');
			TextReplace({
				find: `"${process.env[envVar]}"`,
				replace: obfuscated,
				files: './predist/**/*'
			});
			TextReplace({
				find: `process.env.${envVar}`,
				replace: obfuscated,
				files: './predist/**/*'
			});
		});
	},
	ssl: async function () {
		if (process.env.SSLKEY && process.env.SSLCRT) {
			console.log('No SSL key cert pair found, assuming obfuscate already did it for us');
			return;
		}

		if (!fsSync.existsSync('./ssl.key') || !fsSync.existsSync('./ssl.crt')) {
			await generateSSL();
		}

		console.log('Injecting SSL key and cert in serve.js');
		const sslKey = stringObfuscator(fsSync.readFileSync('./ssl.key', { encoding: 'utf-8' }));
		const sslCrt = stringObfuscator(fsSync.readFileSync('./ssl.crt', { encoding: 'utf-8' }));

		TextReplace({
			find: "atob('###sslkeyplaceholder###')",
			replace: sslKey,
			files: './predist/serve.js'
		});
		TextReplace({
			find: "atob('###sslcrtplaceholder###')",
			replace: sslCrt,
			files: './predist/serve.js'
		});
	},
	cjstoexe: async function () {
		console.log('Packaging predist/index.cjs to dist/package.nw/api/api.exe');
		await pkg.exec([
			'--output',
			'./dist/package.nw/api/api.exe',
			'--targets',
			'node20-win-x64',
			'./predist/serve.js'
		]);
		console.log('Done packaging predist/index.cjs to dist/package.nw/api/api.exe');
	},
	all: async function () {
		const timeStart = new Date();
		console.log('Starting build', timeStart.toLocaleString());
		await commands.static();
		await commands.prebuild();
		await commands.nw();
		await commands.api();
		await commands.esmtocjs();
		await commands.obfuscate();
		await commands.ssl();
		await commands.cjstoexe();
		const timeEnd = new Date();
		console.log(
			'Build done!',
			timeEnd.toLocaleString(),
			'Build took',
			Math.ceil((timeEnd.getTime() - timeStart.getTime()) / 1000),
			'seconds'
		);
	}
};

// @ts-ignore: example in microsoft/TypeScript/pull/57847 does not work
commands[command]();

async function generateSSL() {
	const opensslZipPath = `./${opensslDownloadUrl.split('/').pop()}`;

	if (!fsSync.existsSync(opensslZipPath)) {
		console.log('Downloading OpenSSL Binary');
		await new Promise((resolve, reject) => {
			const file = fsSync.createWriteStream(opensslZipPath);
			https
				.get(opensslDownloadUrl, (response) => {
					response.pipe(file);
					file.on('finish', () => {
						file.close(resolve);
					});
				})
				.on('error', (err) => {
					fsSync.unlink(opensslZipPath, () => {});
					reject(err);
				});
		});
	}

	if (!fsSync.existsSync('./openssl-3.0')) {
		console.log('Extracting OpenSSL Binary');
		await new Promise((resolve, reject) => {
			fsSync
				.createReadStream(opensslZipPath)
				.pipe(unzipper.Extract({ path: './' }))
				.on('close', resolve)
				.on('error', reject);
		});
	}

	console.log('Generating ssl key pair (ssl.key, ssl.crt)');
	await new Promise((resolve, reject) => {
		const command = `"${opensslBinaryPath}" req -config openssl.conf -new -sha256 -newkey rsa:2048 -nodes -keyout ssl.key -x509 -days 3650 -out ssl.crt -batch`;
		exec(command, (error) => {
			if (error) {
				reject(error);
			} else {
				resolve(null);
			}
		});
	});

	const sslKey = fsSync.readFileSync('./ssl.key', { encoding: 'utf-8' });
	const sslCrt = fsSync.readFileSync('./ssl.crt', { encoding: 'utf-8' });
	fsSync.writeFileSync('./ssl.base64.key', `SSLKEY=${btoa(sslKey)}`);
	fsSync.writeFileSync('./ssl.base64.crt', `SSLCRT=${btoa(sslCrt)}`);
	console.log(' - Check "ssl.base64.key" and "ssl.base64.crt". These contain base64 encoded');
	console.log(' - key cert pair. You may copy it and store it inside ".env" and use dotenv-vault');
	console.log(' - to have your key cert pair be stored securely in a vault and can be reusable');
}

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
	/**@type {string[]} */
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
