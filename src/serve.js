import fs from 'fs';
import https from 'https';
import 'dotenv/config';
// @ts-ignore: only for building the API purposes
import { handler } from './handler.js';
import { API_PORT } from '../build.js';

const sslKey = process.env.SSLKEY || atob(fs.readFileSync('../ssl.key', { encoding: 'utf-8' }));
const sslCrt = process.env.SSLCRT || atob(fs.readFileSync('../ssl.crt', { encoding: 'utf-8' }));

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
