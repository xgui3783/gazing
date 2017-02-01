var siteName = '<img src = "img/gazingTransparent.png" style = "max-width:100%"/>'
var siteTitle = 'GAZing!'
var configDB = require('../config/database')
var Lesson = require('./models/lesson');
var User = require('./models/user');
var PaperResult = require('./models/paper')
var renderConfig = {};
var multer = require('multer');
var fs = require('fs')
var Sms = require('./models/sms')
var childProcess = require('child_process')
var glob = require('glob')
var async = require('async')
var request = require('request')

module.exports = function(app,passport,io){
	
	fs.stat(app.get('persistentDataDir')+'pdfout/',function(e,s){
		console.log('checking if '+app.get('persistentDataDir')+'pdfout/'+ ' exist')
		if(e){
			console.log(e)
			console.log('dir does not exist... creating the directory...')
			fs.mkdir(app.get('persistentDataDir')+'pdfout',function(e1){
				if(e1){
					console.log('error creating dir...' + JSON.stringify(e1))
				}else{
					console.log('creating dir successful... ')
				}
			})
		}else{
			console.log('dir exist... proceeding')
		}
	})
	
	var multerStorage = multer.diskStorage({
		destination : function(req,file,cb){
			cb(null,app.get('persistentDataDir')+'paperresult/');
		},
		filename: function(req,file,cb){
			var filename = String(Date.now())+file.originalname.substring(file.originalname.lastIndexOf('.'))
			cb(null,filename);
		}
	})
	var upload = multer({
		storage : multerStorage,
		
		fileFilter : function(req,file,cb){
			cb(null,true)
		}
	});
	
	var multerPdfStorage = multer.diskStorage({
		destination : function(req,file,cb){
			cb(null,app.get('persistentDataDir')+'pdfout/')
		},
		filename : function(req,file,cb){
			cb(null,req.body.CBData+'.pdf')
		}
	})
	
	var uploadPdf = multer({
		storage : multerPdfStorage,
		
		fileFilter : function(req,file,cb){
			cb(null,true)
		}
	})

	app.post('/pdfmarking',uploadPdf.single('file'),function(req,res){
		if(!req.body.apikey=='purplepizzapig'){
			res.send({error:'API key incorrect.'})
		}
		console.log('post to pdfmarking')
		var destination = req.file.destination
		var filename = req.file.filename.split('.')[0]
		var pdfToPng = childProcess.exec('convert -density 288 '+destination+filename+'.pdf -resize 25% '+destination+filename+'.png',
			function(e,stdout,stderr){
				if(e){
					console.log(e)
					res.send({error:e})
				}else if(stderr){
					console.log(stderr)
					res.send({error:stderr})
				}else{
					console.log('PNGs extracted from '+filename+'.pdf')
					fs.unlink(destination+filename+'.pdf',function(){
						console.log('successfully deleted '+filename+'.pdf')
					})
					res.send({success:'ok'})
					fs.stat(destination+filename+'.png',function(e2,s){
						console.log('checking for png files')
						var pngMarkingURL = 'http://examcopedia.gen-ed.com.au/markPNG'
						/* var pngMarkingURL = 'http://127.0.0.1:3002/markPNG' */
						if(e2){
							console.log('detected a multipaged pdf file')
							/* multipaged pdf */
							glob(destination+filename+'*.png',function(e1,arr){
								if(e1){
									console.log('glob has gone wild!')
									console.log(e)
								}else{
									async.eachLimit(arr,1,
									function(item,callback){
										console.log('async posting png to examcopedia to be marked initiated ...')
										console.log(item)
										console.log('posting ...')
										var formData = {
											photo : fs.createReadStream(item),
											apikey : 'purplepizzapig'
										}
										var itemToBeDeleted = item
										request.post({
											url : pngMarkingURL,
											formData : formData
										},function(e,h,b){
											console.log('--')
											console.log('response from the marking server received')
											console.log(e)
											console.log(b)
											console.log('--')
											if(e){
												console.log(e)
												callback(e)
											}else{
												console.log('--')
												console.log('no error')
												console.log('checking body')
												var body = JSON.parse(b)
												if(body.error){
													console.log(body.error)
													callback(body.error)
												}else if(body.success){
													console.log('--')
													console.log('success response received from examcopedia marking server')
													console.log('deleting unused files')
													console.log(itemToBeDeleted)
													console.log('--')
													fs.unlink(itemToBeDeleted,function(e){
														if(e){
															console.log('multipage pdf generated png not deleted')
															console.log(e)
															callback()
														}else{
															console.log('successfully deleted a png generated from multipage pdf')
														}
														callback()
													})
												}
											}
										})
									},
									function(err){
										if(err){
											console.log('async has gone wild!')
											console.log(err)
										}
									})
								}
							})
						}else{
							console.log('detected a single-paged pdf file')
							/* single paged pdf */
							var formData = {
								photo : fs.createReadStream(destination+filename+'.png')
							}
							request.post({
								url : pngMarkingURL,
								formData : formData
							},function(e,h,b){
								if(e){
									console.log('single paged pdf -> png upload to marking server has encountered an error')
									console.log(e)
								}else{
									if(b.success){
										console.log('single paged pdf -> png upload to marking server successful')
										fs.unlink(destination+filename+'.png',function(e){
											if(e){
												console.log('png generated from single page pdf not deleted')
												console.log(e)
											}else{
												console.log('png generated from single page pdf deleted')
											}
										})
									}
								}
							})
						}
					})
				}
			})
	})
	
	app.get('/message',checkAuth,function(req,res){
		Sms.find({
			status : {$not:/inactive/ }
		},null,{sort:'-createdAt'},function(e,smses){
			res.render('message',{
				siteName : siteName,
				siteTitle : siteTitle,
				smses :  JSON.stringify(smses),
			})
		})
	})
	
	app.post('/twiliocallback',function(req,res){
		console.log('twilio sms callback received')
		var newSms = new Sms()
		var toNumber = req.body.From
		if(toNumber.substring(0,1)=='0'){
			toNumber = '+61'+toNumber.substring(1)
		}else if(toNumber.substring(0,2)=='61'){
			toNumber = '+'+toNumber
		}
		newSms.to = toNumber
		newSms.message = req.body.Body
		newSms.method = 'twilio'
		newSms.reply = 'true'
		newSms.status = 'new'
		
		newSms.save(function(e2){
			if(e2){
				console.log(e2)
			}else{
				console.log('message saved')
				io.emit('receivesms',newSms)
			}
		})
		
		res.send('Thanks Twilio!')
	})
	
	app.post('/smscallback',function(req,res){
		Sms.findOne({
			messageId : req.body.messageId
		},function(e,oneSms){
			if(req.body.status=='READ'){
				oneSms.reply = req.body.content
			}else if(req.body.status == 'UNDVBL'){
				oneSms.reply = 'THIS MESSAGE WAS UNDELIVERABLE!'
			}
		})
	})
	
	app.get('/login',function(req,res){
		var errors;
		if(req.flash('error')){
			errors = req.flash('error')
		}else{
			errors = ''
		}
		res.render('login',{
			siteName : siteName,
			errors : errors,
			siteTitle : siteTitle
		})
	});
	
	app.post('/local-login',
		passport.authenticate('local-login',{
			successRedirect : '/', 
			failureRedirect : '/login', 
			failureFlash : true}));
	
	app.get('/',checkAuth,function(req,res){
		if(req.user.lvl==1||req.user.lvl==1||req.user.lvl==1){
			Lesson.find({
				'status' : { $not: /inactive/}
				},function(e,r){
				if(e){
					renderConfig = {
						siteName : siteName,
						siteTitle : siteTitle,
						errors: e.error,
						user : req.user,
						lessons : '',
						
					}
				}else{
					renderConfig = {
						siteName : siteName,
						siteTitle : siteTitle,
						errors: '',
						user : req.user,
						lessons : JSON.stringify(r)
					}
				}
				res.render('main',renderConfig)
			})
		}else{
			res.render('main',{
				siteName : siteName,
				siteTitle : siteTitle,
				errors: '',
				user : req.user,
				lessons : ''
			})
		}
	})
	
	app.get('/test',function(req,res){
		res.render('test',{
			siteName : 'test angular',
			siteTitle : siteTitle,
		})
	})
	
	app.post('/signup',passport.authenticate('local-signup',{
		successRedirect : '/',
		failureRedirect : '/login',
		failureFlash : true
	}))
	
	app.get('/logout',checkAuth,function(req,res){
		req.logout()
		res.redirect('/login')
	})
	
	app.get('/paper',checkAuth,function(req,res){
		Lesson.find({
			mode : 'Paper',
			status : { $not: /inactive/ }
		})
		.sort({sortCode:1})
		.exec(function(e,dbPapers){
			if(e){
				res.send('oops, the bunny dropped the hoop again...')
			}else{
				User
				.find({
					lvl : 0
				})
				.select({
					name : 1
				})
				.sort({
					name : 1
				})
				.exec(function(e1,students){
					var dir = app.get('persistentDataDir')+'paperresult/';
					var yeardir = fs.readdirSync(dir);
					if (yeardir.length == 0){
						res.render('paper',{
							siteName : siteName,
							siteTitle : siteTitle,
							user : req.user,
							quizzes : JSON.stringify(dbPapers),
							students : JSON.stringify(students),
							papers : '{}'
						})
					}else{
						/*
						var papers = {}
						for(var i = 0; i< yeardir.length; i++){
							papers[yeardir[i]]={}
							var monthdir = fs.readdirSync(dir + yeardir[i] + '/');
							for(var j = 0; j< monthdir.length; j++){
								papers[yeardir[i]][monthdir[j]]={}
								var daydir = fs.readdirSync(dir + yeardir[i] + '/'+ monthdir[i] + '/');
								for(var k = 0; k<daydir.length; k++){
									papers[yeardir[i]][monthdir[j]][daydir[k]] = [];
									var files = fs.readdirSync(dir + yeardir[i] + '/' + monthdir[i] + '/' + daydir[k] + '/')
									for(var l = 0; l<files.length; l++){
										if(files[l].split('.')[1]!='txt'){
											papers[yeardir[i]][monthdir[j]][daydir[k]].push(files[l]);
										}
									}
								}
							}
						}
						*/
						
						PaperResult
						.find({
							status : { $not : /inactive/}
						})
						.sort({
							createdAt : 1
						})
						.exec(function(e2,papers){
							res.render('paper',{
								siteName : siteName,
								siteTitle : siteTitle,
								user : req.user,
								quizzes : JSON.stringify(dbPapers),
								students : JSON.stringify(students),
								papers : JSON.stringify(papers)
							})
						})
					}
				})
			}
		})
	})
	
	app.get('/playquiz',checkAuth,function(req,res){
		var queryQuiz = Lesson.findOne({
			shortCode : req.query.v,
			mode : 'Quiz',
			status : { $not: /inactive/}
		},function(e,lesson){
			if(e){
				console.log(e)
				res.render('error',{
					siteName : siteName,
					siteTitle : siteTitle,
					error : e 
				})
			}else{
				if(lesson){
					/* need logic to determine if the quiz is in progress or not */
					if(req.user.lvl==0&&lesson.status!='in progress'){
						lesson.status = 'error'
						req.query.v = 'Quiz not found!'
					}
					res.render('play',{
						siteName : siteName,
						siteTitle : siteTitle,
						mode : 'Quiz',
						shortCode : req.query.v,
						user : JSON.stringify(req.user),
						questions : JSON.stringify(lesson.arrQuestions.slice(0,lesson.length)),
						length : lesson.length,
						arrUsers : [],
						progress : lesson.progress,
						status : lesson.status
					})
				}else{
					res.render('play',{
						siteName : siteName,
						siteTitle : siteTitle,
						mode : 'Quiz',
						shortCode : 'Quiz not found!',
						user : req.user,
						questions : '',
						length : '1',
						status : 'error'
					})
				}
			}
		})
	})
	
	app.get('/playhomework',checkAuth,function(req,res){
		var queryQuiz = Lesson.findOne({
			shortCode : req.query.v,
			mode : 'Homework',
			status : { $not: /inactive/}
		},function(e,lesson){
			if(e){
				console.log(e)
				res.render('error',{
					siteName : siteName,
					siteTitle : siteTitle,
					error : e
				})
			}else{
				if(lesson){
					/* This bit is a little different to Quiz, because the lesson is saved. Altering status of the Homework is not advised. */
					var lStatus
					if(req.user.lvl==0&&lesson.status!='in progress'){
						lStatus = 'error'
						req.query.v = 'Homework not found!'
					}else{
						lStatus = lesson.status
					}
					
					var questions = ''
					var progress;
					var userAnswers = ''
					var arrUsers = []
					if(req.user.lvl==0){
						/* only non admin persons get to do the homework set. If admin account holders would like to demonstrate the quiz functionality, get a non-admin account */
						
						var queryResult = lesson.addHomeworkUser(String(req.user._id),req.user.name,lesson.progress)
						
						if(queryResult===true){
							questions = JSON.stringify(lesson.arrQuestions.slice(lesson.progress,lesson.progress+lesson.length))
							lesson.progress += lesson.length
							
							/* personal progress. homework module has no global progress */
							progress = 0
							lesson.save(function(e1){
								if(e1){
									console.log(e1)
								}
							})
						}else{
							questions = JSON.stringify(lesson.arrQuestions.slice(queryResult.start,queryResult.start+lesson.length))
							progress = queryResult.progress
							userAnswers = queryResult.userAnswers
						}
					}else{
						questions = JSON.stringify(lesson.arrQuestions)
						progress = 0
						arrUsers = lesson.users
					}
					
					res.render('play',{
						siteName : siteName,
						siteTitle : siteTitle,
						mode : 'Homework',
						shortCode : req.query.v,
						user : JSON.stringify(req.user),
						questions : questions,
						length : lesson.length,
						progress : progress,
						userAnswers : userAnswers,
						arrUsers : JSON.stringify(arrUsers),
						status : lStatus
					})
					
				}else{
					res.render('play',{
						siteName : siteName,
						siteTitle : siteTitle,
						mode : 'Homework',
						shortCode : 'Homework not found!',
						user : req.user,
						questions : '',
						length : '1',
						status : 'error'
					})
				}
			}
		})
	})
	
	app.get('/homework',checkAuth,function(req,res){
		var queryQuiz = Lesson.findOne({
			shortCode : req.query.v,
			mode : 'Homework',
			status : { $not: /inactive/}
		},function(e,lesson){
			if(e){
				console.log(e)
				res.render('error',{
					siteName : siteName,
					siteTitle : siteTitle,
					error : e
				})
			}else{
				if(lesson){
					res.render('view',{
						siteName : siteName,
						siteTitle : siteTitle,
						viewMode : 'Homework',
						shortCode : req.query.v,
						user : req.user,
						questions : JSON.stringify(lesson.arrQuestions.slice(0,lesson.length)),
						length : lesson.length,
						status : lesson.status
					})
				}else{
					res.render('view',{
						siteName : siteName,
						siteTitle : siteTitle,
						viewMode : 'Homework',
						shortCode : 'Homework not found!',
						user : req.user,
						questions : '',
						length : '1',
						status : 'error'
					})
				}
			}
		})
	})
	
	app.get('/quiz',checkAuth,function(req,res){
		var queryQuiz = Lesson.findOne({
			shortCode : req.query.v,
			mode : 'Quiz',
			status : { $not: /inactive/}
		},function(e,lesson){
			if(e){
				console.log(e)
				res.render('error',{
					siteName : siteName,
					siteTitle : siteTitle,
					error : e
				})
			}else{
				if(lesson){
					res.render('view',{
						siteName : siteName,
						siteTitle : siteTitle,
						viewMode : 'Quiz',
						shortCode : req.query.v,
						user : req.user,
						questions : JSON.stringify(lesson.arrQuestions.slice(0,lesson.length)),
						length : lesson.length,
						status : lesson.status
					})
				}else{
					res.render('view',{
						siteName : siteName,
						siteTitle : siteTitle,
						viewMode : 'Quiz',
						shortCode : 'Quiz not found!',
						user : req.user,
						questions : '',
						length : '1',
						status : 'error'
					})
				}
			}
		})
	})
	
	app.get('/pdfout/*.pdf',checkAuth,function(req,res){
		fs.stat(app.get('persistentDataDir')+req.url,function(e,s){
			if(e){
				res.send('file does not exist ... ')
			}else{
				res.sendfile(app.get('persistentDataDir')+req.url)
			}
		})
	})
	
	app.post('/mocktest',uploadPdf.single('file'),function(req,res){
		
		var newLesson = new Lesson();
		var jsonSocketCall = JSON.parse(req.body.socketCall);
		var jsonUser = JSON.parse(req.body.user);
		var length = 0;
		var arrQuestions = [];
		
		for(var block in jsonSocketCall){
			for(var question in jsonSocketCall[block]){
				length ++
				arrQuestions.push(jsonSocketCall[block][question])
			}
		}
		
		newLesson.arrQuestions = arrQuestions;
		newLesson.shortCode = req.body.CBData;
		newLesson.length = length;
		newLesson.mode = 'Paper';
		newLesson.progress = '0';
		newLesson.status = 'n/a';
		newLesson.creator = jsonUser.displayName;
		
		newLesson.save(function(e){
			if(e){
				res.send({error:JSON.stringify(e)})
			}else{
				res.send('OK')
			}
		});
	})
	
	app.post('/paperresult',upload.single('image'),function(req,res){
		if(req.body.mcq&&req.file){
			var array = JSON.parse(req.body.mcq)
			var answerArray = [];
			for(i = 0; i<array.length; i++){
				for(j=0; j<array[i].length; j++){
					var sum = 0;
					var answer;
					for(k=0; k<array[i][j].length; k++){
						sum += array[i][j][k]
						if(array[i][j][k]==1){
							switch(k){
								case 0: answer = "A"; break;
								case 1: answer = "B"; break;
								case 2: answer = "C"; break;
								case 3: answer = "D"; break;
							}
						}
					}
					if (sum == 1){
						answerArray.push(answer)
					}else{
						answerArray.push('?')
					}
				}
			}
			fs.writeFile(req.file.destination+req.file.filename.substring(0,req.file.filename.lastIndexOf('.'))+'.txt',JSON.stringify(answerArray),'utf8',function(e){
				if(e){
					console.log(e)
				}
			})
			var newPaperResult = new PaperResult();
			newPaperResult.fileName = req.file.filename
			newPaperResult.answer = answerArray;
			newPaperResult.save(function(e){
				if(e){
					console.log(e)
				}
			})
			var json = {
				mode : 'add',
				paperresult : newPaperResult
			}
			console.log('io emitting update paper result')
			io.emit('update paper result',json)
			res.send('ok')
		}else{
			res.send('not ok')
		}
		
	})
	
	app.get('/paperresult/*.*',checkAuth,function(req,res){
		fs.stat(app.get('persistentDataDir')+req.url,function(e,s){
			if(e){
				res.send('no file found')
			}else{
				res.sendfile(app.get('persistentDataDir')+req.url)
			}
		})
	})
	function checkAuth(req,res,next){
		console.log('checkAuth')
		if(!req.user){
			console.log('auth failed')
			res.redirect('/login')
		}else{
			return next();
		}
	}
}