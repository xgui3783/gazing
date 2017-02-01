module.exports = {
	'url' : process.env.OPENSHIFT_MONGODB_DB_URL + process.env.OPENSHIFT_APP_NAME || 'mongodb://127.0.0.1:27017/gazing' 
}