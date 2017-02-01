#!/bin/env node
var http = require('http');
var express = require('express');
var app = require('express')();
var server = http.createServer(app);
var passport = require('passport');
var configDB = require('./config/database')
var mongoose = require('mongoose');

var session = require('express-session');
var mongoStore = require('connect-mongo/es5')(session);
var flash = require('connect-flash');
var bodyParser = require('body-parser');
var sessionStore = new mongoStore(configDB);
var io = require('socket.io')(server);
var passportSocketIO = require('passport.socketio')

var cookieParser = require('cookie-parser')
app.use(cookieParser())

io.use(passportSocketIO.authorize({
	secret : 'pandaeatspeanuts',
	store : sessionStore,
	success : function(obj,accept){
		accept();
		},
	fail : function(obj){
		}
}))

mongoose.connect(configDB.url)

app.set('persistentDataDir',process.env.OPENSHIFT_DATA_DIR || process.env.DATA_DIR ||'./public/');

app.use(bodyParser.urlencoded({extended:true}));
app.use(session({resave:true,saveUninitialized:true,secret : 'pandaeatspeanuts', store : sessionStore ,cookie:{maxAge : 86400000}}));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

require('./config/passport')(passport);
require('./app/routes')(app,passport,io);
require('./app/socket')(io);
	
	
app.set('view engine','ejs')
app.use(express.static('public'));

app.set('port', process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || 3000 );
app.set('ip', process.env.OPENSHIFT_NODEJS_IP || process.env.IP || "127.0.0.1");

server.listen(app.get('port'),app.get('ip'));