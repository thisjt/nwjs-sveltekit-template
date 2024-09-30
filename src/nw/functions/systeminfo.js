const si = require('systeminformation');

const getSystemInformation = async () => {
	return await si.get({ system: '*' });
};

module.exports = {
	getSystemInformation
};
