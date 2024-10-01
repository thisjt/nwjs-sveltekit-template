const systeminfo = require('./functions/systeminfo');

nw.Window.open('http://localhost:5173', {}, (winMain) => {
	winMain.on('document-start', () => {
		// Make sure that you export then grab your types in "nw/functions" and make
		// an equivalent function in "lib/functions" as a fallback outside NWJS context
		// if you want your app to be used in regular browser context
		// e.g. website, PWA, Capacitor, etc.

		// Also take note, that HMR does not work when you modify js files inside the
		// nw folder. If you want your changes to reflect, close nw, then do `pnpm run nw`.

		// You may change this as you see fit on how you want to inject NWJS functions.
		// Keep in mind that the NWJS context is CommonJS syntax. ESM code will not
		// work here.
		// @ts-ignore
		winMain.window.nwjs = {
			getSystemInformation: systeminfo.getSystemInformation
		};
	});
});

// Helper functions for running the API and having a debugger
const cpSpawn = require('child_process').spawn;
const { existsSync, mkdirSync, appendFile } = require('fs');

async function runApi() {
	try {
		const daemon = cpSpawn('api.exe', [], { cwd: `./api` });

		daemon.stdout.on('data', (data) => logger(data.toString()));
		daemon.stderr.on('data', (data) => logger(data.toString()));
		daemon.on('close', (code) => {
			logger('daemon closed with code', code);
			setTimeout(runApi, 5000);
		});
	} catch (e) {
		logger(e);
	}
}

if (existsSync('./api/api.exe')) {
	runApi();
}

if (!existsSync('./../logs')) mkdirSync('./../logs');
const logFilename = `applogs-${new Date().toLocaleDateString().replaceAll('/', '-')}.log`;
/**@param {*[]} data */
function logger(...data) {
	appendFile(
		`./../logs/${logFilename}`,
		`${new Date().toLocaleTimeString()}: ${JSON.stringify(data)}\n`,
		() => {}
	);
}
