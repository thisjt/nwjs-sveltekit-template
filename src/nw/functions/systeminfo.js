const si = require('systeminformation');

/** @returns {Promise<string>} */
const getSystemInformation = async () => {
	return JSON.stringify(await si.get({ system: '*' }));
};

module.exports = {
	getSystemInformation
};
