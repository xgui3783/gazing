
var	localStrategy = require('passport-local').Strategy,
	facebookStrategy = require('passport-facebook').Strategy,
	googleStrategy = require('passport-google-oauth').Strategy;

var User = require('../app/models/user');

module.exports = function(passport){
	
	passport.serializeUser(function(user,done){
		done(null, user.id)
	})
	passport.deserializeUser(function(id,done){
		User.findById(id,function(e,user){
			done(e,user);
		})
	})
	
	passport.use('local-signup',new localStrategy({
		usernameField : 'email',
		passwordField : 'password',
		passReqToCallback : true
	},function(req,email,password,done){
		console.log('local sign up')
		process.nextTick(function(){
			User.findOne({'local.email' : email},function(e,user){
				if(e){
					return done(e)
				}
				if(user){
					return done(null, false, req.flash('signupFailure','That email has already been registered.'))
				}else{
					var newUser = new User();
					newUser.local.email = email;
					newUser.local.password = newUser.generateHash(password);
					newUser.local.name = req.body.name;
					
					newUser.name = req.body.name;
					newUser.lvl = 0;
					
					newUser.save(function(e1){
						if(e1){
							return done(e)
						}else{
							return done(null, newUser);
						}
					})
				}
			})
		})
	}))
	
	passport.use('local-login',new localStrategy({
		usernameField : 'email',
		passwordField : 'password',
		},function(username,password,done){
			User.findOne({'local.email':username},function(e,user){
				if(e){
					return done(e)
				}
				if(!user){
					return done(null,false,{message : 'Incorrect username or password.'})
				}
				if(user.compareHash(password)){
					return done(null, user)
				}else{
					return done(null,false,{message : 'Incorrect username or password.'})
				}
			})
		}
	))
}