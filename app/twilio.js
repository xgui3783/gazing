
var account = require('../config/auth')
var client = require('twilio')(account.twilio.account,account.twilio.token)
var Sms = require('./models/sms')

module.exports = function(obj,cb){
	console.log(obj)
	var toNumber = obj.toNumber
	var message = obj.message
	
	client.sendMessage({
		to : toNumber,
		from : '+61437737610',
		body : message
	},function(e,res){
		if(e){
			console.log(e)
			cb({error:JSON.stringify(e)})
		}else{
			var newSms = new Sms()
			if(toNumber.substring(0,1)=='0'){
				toNumber = '+61'+toNumber.substring(1)
			}else if(toNumber.substring(0,2)=='61'){
				toNumber = '+'+toNumber
			}
			newSms.to = toNumber
			newSms.message = message
			newSms.method = 'twilio'
			newSms.reply = 'false'
			newSms.save(function(e2){
				if(e2){
					console.log(e2)
					cb({error:JSON.stringify(e2)})
				}else{
					console.log('message saved')
					cb({success:'ok'})
				}
			})
		}
	})
}

