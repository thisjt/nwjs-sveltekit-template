import https from 'https';

// @ts-ignore: template for building the API
import { handler } from './handler.js';

// Don't change this line, this gets replaced by the API port specified in "build.js"
import { API_PORT } from '../build.js';

const sslKey = atob(process.env.SSLKEY || '') || atob('###sslkeyplaceholder###');
const sslCrt = atob(process.env.SSLCRT || '') || atob('###sslcrtplaceholder###');

const httpsServer = https.createServer(
	{
		key: sslKey,
		cert: sslCrt
	},
	(request, response) => {
		handler(request, response);
	}
);

httpsServer.listen(API_PORT, () => {
	console.log('Listening on port', API_PORT);
});

function main() {}
main();
