
var account = require('../config/auth')
var requestAuth = require('request')
var requestSMS = require('request')
var urlAuth = 'https://api.telstra.com/v1/oauth/token'
var urlSMS = 'https://api.telstra.com/v1/sms/messages'

var Sms = require('./models/sms')

module.exports = function(obj){
	console.log(obj)
	var toNumber = obj.toNumber
	var message = obj.message
	var form = {
		client_id : account.telstra.key,
		client_secret : account.telstra.secret,
		grant_type : 'client_credentials',
		scope : 'SMS'
	}
	
	requestAuth.post({url : urlAuth,form:form},function(e,h,b){
		if(e){
			console.log(e)
		}else{
			var smsform = {
				to : toNumber,
				body : message,
			}
			
			requestSMS.post({
				url : urlSMS,
				headers:{
					Authorization: 'Bearer '+JSON.parse(b).access_token,
					'Content-Type':'application/json'
					},
				form:JSON.stringify(smsform),
				
				},function(e1,h1,b1){
				if(e1){
					console.log(e1)
				}else{
					if(JSON.parse(b1).messageId){
						/* most likely successfully posted */
						console.log('message sending successful. now saving')
						var newSms = new Sms()
						newSms.to = toNumber
						newSms.message = message
						newSms.access_token = JSON.parse(b).access_token
						newSms.messageId = JSON.parse(b1).messageId
						newSms.save(function(e2){
							if(e2){
								console.log(e2)
							}else{
								console.log('message saved')
							}
						})
					}else{
						/* error */
						console.log(b1)
					}
				}
			})
		}
	})
}

