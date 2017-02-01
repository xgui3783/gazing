
var bcrypt = require('bcrypt-nodejs');
var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
	local : {
		name : String,
		email : String,
		password : String,
	},
	facebook : {
		id : String,
		token : String,
		email : String,
		name : String,
	},
	google : {
		id : String,
		token : String,
		email : String,
		name : String,	
	},
	name : String,
	lvl : Number
})
	
userSchema.methods.generateHash = function(password){
	return bcrypt.hashSync(password, bcrypt.genSaltSync(8),null);
}

userSchema.methods.compareHash = function(password){
	return bcrypt.compareSync(password,this.local.password)
}

module.exports = mongoose.model('User',userSchema)