import 'dotenv/config';
import { build } from 'vite';

const args = process.argv;
args.shift();
args.shift();

const command = args[0];
args.shift();

const commands = {
	static: async function () {
		console.log('Running static vite build...');
		process.env.NWJS_BUILD_STATIC = '1';
		await build();
		delete process.env.NWJS_BUILD_STATIC;
		console.log('Static vite build success!');
	},
	api: async function () {
		console.log('Running api vite build...');
		process.env.NWJS_BUILD_API = '1';
		await build();
		delete process.env.NWJS_BUILD_API;
		console.log('API vite build success!');
	}
};

commands[command]();
