
var mongoose = require('mongoose');

var smsSchema = mongoose.Schema({
	method: String,
	
	to : String,
	message : String,
	accessToken : String,
	
	messageId : String,
	reply : String,
	
	error: String,
	status: String,
},{
	timestamps : true
})

module.exports = mongoose.model('Sms',smsSchema)