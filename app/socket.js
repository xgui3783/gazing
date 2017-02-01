
var request = require('request')
var Lesson = require('./models/lesson')
var Paper = require('./models/paper')
var User = require('./models/user')
var Sms = require('./models/sms')
var printReport = require('./printReport')
var twilio = require('./twilio')
var telstra = require('./telstra')
var account = require('../config/auth')
var fs = require('fs')
var filePath = process.env.OPENSHIFT_DATA_DIR || process.env.DATA_DIR ||'./public/';

/* shuffle array */
/* http://stackoverflow.com/a/12646864/6059235 */
function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

/* make 4 random characters */
/* http://stackoverflow.com/a/1349426/6059235 */
function makeid(){
    var text = "";
    var possible = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

    for( var i=0; i < 4; i++ )
        text += possible.charAt(Math.floor(Math.random() * possible.length));

    return text;
} 

module.exports = function(io){
	io.on('connection',function(socket){
		
		socket.on('readall',function(i,cb){
			console.log(i)
			Sms.update({to:i},{status:'read'},{multi:true},function(e,num){
				if(e){
					cb({error:JSON.stringify(e)})
				}else{
					cb({success:'ok'})
				}
			})
		})
		
		socket.on('purge',function(obj,cb){
			if(obj.passcode=='2017PURGEPENGUINE'){
				/* passcode is correct */
				cb({success:'OK'})
				
				/* delete all files in the directory */
				fs.readdir(filePath+'paperresult/',function(e,f){
					if(e){
						console.log(e)
					}else{
						for(var i = 0; i<f.length; i++){
							fs.unlink(filePath+'paperresult/'+f[i],function(e1){
								if(e1){
									console.log(e1)
								}
							})
						}
					}
				})
				
				fs.readdir(filePath+'pdfout/',function(e,f){
					if(e){
						console.log(e)
					}else{
						for(var i = 0; i<f.length; i++){
							fs.unlink(filePath+'pdfout/'+f[i],function(e1){
								if(e1){
									console.log(e1)
								}
							})
						}
					}
				})
				
				/* archiving all of the lessons */
				Lesson
					.update({
						mode : 'Paper',
						status : {$not:/inactive/}
					},{
						status : 'inactive'
					},{
						multi : true
					},function(e,raw){
						if(e){
							console.log(e)
						}else{
							console.log(raw)
						}
					})
					
				/* archiving all of the paper responses */
				Paper.update({
					status : {$not:/inactive/}
				},{
					status : 'inactive'
				},{
					multi : true
				},function(e,raw){
						if(e){
							console.log(e)
						}else{
							console.log(raw)
						}
				})
				
			}else{
				cb({error:'Incorrect passcode.'})
			}
		})
		
		socket.on('sendmessage',function(obj,cb){
			console.log(obj)
			cb({success:'ok'})
			
			twilio(obj,function(o){
				
				var newSms = {}
				newSms.to = obj.toNumber
				newSms.message = obj.message
				newSms.method = 'twilio'
				newSms.reply = 'false'
				newSms.status = 'new'
				io.emit('receivesms',newSms)
				
				cb(o)
			})
			//telstra(obj)
		})
		
		/* on reconnect, rejoin the room */
		/* does not work as intended yet */
		if(socket.request.user.quiz){
			console.log('User joined with quiz property defined:'+socket.request.user.quiz)
			var query = {
				'shortCode' : socket.request.user.quiz,
				'status' : 'in progress'				
			}
			Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e)
				}else{
					if(lesson){
						socket.join(socket.request.user.quiz)
					}
				}
			})
		}else{
			console.log('user joined with quiz property not defined')
		}
		
		socket.on('disconnect',function(){
			if(socket.request.user.quiz){
				console.log('User left from quiz '+socket.request.user.quiz)
			}else{
				console.log('User left with .quiz property not defined.')
			}
		})
		
		socket.on('add notes',function(i,cb){
			Lesson.findOne({
				shortCode : i.shortCode,
				status : {$not:/inactive/}
			}).exec(function(e,lesson){
				lesson.notes = i.newNotes
				lesson.save(function(e1){
					if(e1){
						cb({error:'save error'})
					}else{
						cb({success:'save success'})
					}
				})
			})
		})
		
		socket.on('delete paper quiz',function(i,cb){
			console.log(i)
			/* only teacher is allowed to delete paper quizzes */
			if(socket.request.user.lvl==1){
				Lesson.findOne({
					'status' : { $not: /inactive/},
					'mode' : 'Paper',
					'shortCode' : i
				},function(e,r){
					if(e){
						cb({error:'Cannot find the Quiz.'})
					}else{
						r.status = 'inactive';
						r.save(function(e1){
							if(e1){
								cb({error: 'Unable to delete quiz!'})
							}else{
								console.log('delete paper quiz deleting PDF.')
								fs.unlink(filePath+'pdfout/'+i +'.pdf',function(e){
									if(e){
										console.log('deleting PDF unsuccessful.'+e)
									}else{
										console.log('success...')
									}
								})
								cb({success:'OK'})
							}
						})
					}
				})
			}else{
				cb({error:'You do not have the authorisation to carry out this task.'})
			}
		})
		
		socket.on('ping',function(cb){
			
			cb('heyo')
		})
		
		socket.on('join channel',function(i,cb){
			socket.join(i);
			socket.request.user.quiz = i;
			var query = {
				'shortCode' : i,
				'status' : { $not: /inactive/}
			};
			var addUser = Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e)
					cb(e)
				}else{
					if(lesson){
						var arrUsers = [];
						arrUsers = lesson.addUser(String(socket.request.user._id),socket.request.user.name)
						lesson.save(function(e1){
							if(e1){
								console.log(e1)
								cb(e1)
							}else{
								io.to(i).emit('update users',arrUsers)
								cb({success:''})
							}
						})
					}else{
						cb({error:'Lesson not found.'})
					}
				}
			})
		})
		
		socket.on('start quiz',function(i,cb){
			socket.broadcast.to(i).emit('start quiz')
			cb({success:''})
		})
		
		socket.on('next question',function(i,cb){
			var query = {
				'shortCode' : i.shortCode,
				'status' : 'in progress'
			}
			/* next question lesson */
			Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e)
					cb(e)
				}else{
					lesson.nextQuestion();
					lesson.save(function(e1){
						if(e1){
							console.log(e1)
						}else{
							cb({success:'o3po'})
							socket.broadcast.to(i.shortCode).emit('next question',i)
						}
					})
				}
			})
		})
		
		socket.on('choose answer',function(i,cb){
			var query = {
				'shortCode' : i.shortCode,
				'status' : { $not: /inactive/}
			}
			/* choose answer */
			
			var choseAnswer = Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e)
					cb(e)
				}else{
					lesson.choseMCQ(socket.request.user.id,i.questionNum,i.choice)
					//delete lesson._id
					lesson.save(function(e){
						if(e){
							console.log(e)
						}
					})
					/*
					Lesson.findOneAndUpdate(query,lesson,function(e1,d){
						if(e1){
							console.log(e1)
							cb(e1)
						}				
					})
					*/
				}
			})
			
			io.to(i.shortCode).emit('person decided',socket.request.user)
		})
		
		socket.on('tally answer',function(i,cb){
			var query = {
				'shortCode' : i,
				'status' : { $not: /inactive/}
			}
			
			Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e)
					cb(e)
				}else{
					if(lesson){
						lesson.status = 'completed'
						cb(lesson)
						lesson.save(function(e1){
							if(e1){
								console.log(e1)
							}							
						})
					}else{
						cb({error:'Cannot find the lesson.'})
					}
				}
			})
		})
		
		socket.on('delete single',function(json,cb){
			var query = {
				'shortCode' : json.shortCode,
				'status' : { $not: /inactive/}
			};
			var queryDeleteSingle = Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e)
					cb(e)
				}else{
					lesson.arrQuestions.splice(json.position,1);
					lesson.save(function(e1){
						if(e1){
							console.log(e1)
							cb(e1)
						}else{
							if(lesson.arrQuestions[(Math.floor(json.position/json.length)+1)*json.length-1]){
								cb({success:lesson.arrQuestions[(Math.floor(json.position/json.length)+1)*json.length-1]})
							}else{
								cb({error:'Exhausted all possible questions.'})
							}
						}
						
					})
				}
			})
		})
		
		socket.on('flip page',function(json,cb){
			var query = {
				'shortCode' : json.shortCode,
				'status' : { $not: /inactive/}
			};
			Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e)
					cb(e)
				}else{
					if(lesson.arrQuestions[(json.page+1)*json.length]){
						cb(lesson.arrQuestions.slice((json.page*json.length),((json.page+1)*json.length)))
					}else{
						cb({warning:'Not enough questions to fill additional pages!'})
					}
					
				}
			})
		})
		
		socket.on('revision',function(cb){
			if(socket.request.user.lvl==0){
				var query = {
					'users.strId' : socket.request.user.id,
					status : { $not: /inactive/}
				}
				var revision = Lesson.find(query,function(e,lessons){
					var arrReturn = []
					for(var lessonIdx in lessons){
						for(var userIdx in lessons[lessonIdx].users){
							if(lessons[lessonIdx].users[userIdx].strId==socket.request.user.id){
								var jsonAnswerSheet = JSON.parse('{'+lessons[lessonIdx].users[userIdx].answerSheet+'}')
								if(lessons[lessonIdx].users[userIdx].start==0||lessons[lessonIdx].users[userIdx].start){
									var arrAnswerKeys = lessons[lessonIdx].arrQuestions.slice(lessons[lessonIdx].users[userIdx].start,lessons[lessonIdx].users[userIdx].start+lessons[lessonIdx].length)
								}else{
									var arrAnswerKeys = lessons[lessonIdx].arrQuestions
								}
								for (var i = 0; i<lessons[lessonIdx].length; i++){
									if(arrAnswerKeys[i].answer.substring(0,1).toUpperCase()!=jsonAnswerSheet[i]){
										var json = {
											question : arrAnswerKeys[i],
											yourAnswer : jsonAnswerSheet[i]
										}
										arrReturn.push(json)
									}
								}
							}
						}
					}
					cb(arrReturn)
				})
			}
		})
		
		socket.on('end quiz',function(json,cb){
			socket.broadcast.to(json.shortCode).emit('end quiz')
		})
		
		socket.on('publish',function(json,cb){
			var query = {
				shortCode : json.shortCode,
				mode : json.mode,
				status : { $not: /inactive/}
			};
			var publish = Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e)
					cb(e)
				}else{
					if(json.mode=='Quiz'){
						lesson.arrQuestions = lesson.arrQuestions.slice(0,lesson.length)
					}
					lesson.status = 'ready'
					lesson.save(function(e1){
						if(e1){
							console.log(e1)
						}else{
							cb({success:'o3po'})
						}
					})
				}
			})
		})
		
		socket.on('start quiz',function(shortCode,cb){
			var query = {
				'shortCode' : shortCode,
				'status' : { $not: /inactive/}
			};
			var startquiz = Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e.error)
					cb(e)
				}else{
					if(lesson.status=='in progress'){
						cb({warning:'Quiz already in progress!'})
					}else{
						lesson.status = 'in progress'
						lesson.progress = 0
						lesson.save(function(e1){
							if(e1){
								console.log(e1)
								cb(e1)
							}else{
								cb({success:'yes'})
							}
						})
					}
				}
			})
		})
		
		socket.on('delete lesson',function(shortCode,cb){
			var query = {
				'shortCode' : shortCode,
				'status' : { $not : /inactive/ }
			}
			var deleteLesson = Lesson.findOne(query,function(e,lesson){
				if(e){
					console.log(e)
					cb(e)
				}else{
					lesson.status = 'inactive'
					lesson.save(function(e1){
						if(e1){
							console.log(e1)
							cb(e1)
						}else{
							cb({success:'o3po'})
						}
					})
				}
			})
		})
		
		socket.on('categorise paper quiz',function(json,cb){
			Paper
			.findOne({
				fileName : { $regex : json.paperId },
				status : { $not : /inactive/ }
			})
			.exec(function(e,paper){
				if(e){
					cb({error:'Cannot find paper quiz.'})
				}else{
					paper.quiz = json.quizId
					paper.save(function(e1){
						if(e1){
							cb({error:'Failed to save paper quiz.'})
						}else{
							cb({success:'OK'})
						}
					})
				}
			})
		})
		
		socket.on('categorise paper user',function(json,cb){
			User.findOne({
				_id: json.userId
			}).exec(function(e,user){
				if(e){
					cb({error:'Failed to find user.'})
				}else{
					Paper
					.findOne({
						fileName : { $regex : json.paperId },
						status : { $not : /inactive/ }
					})
					.exec(function(e1,paper){
						if(e1){
							cb({error:'failed to find paper.'})
						}else{
							paper.studentId = json.userId
							paper.studentName = user.name
							paper.save(function(e2){
								if(e2){
									cb({error:'failed to save paper'})
								}else{
									cb({success:'OK'})
								}
							})
						}
					})
				}
			})
		})
		
		socket.on('change paper answer',function(json,cb){
			Paper.findOne({
				_id:json.paperId,
				status:{$not:/inactive/}
			}).exec(function(e,paper){
				if(e){
					cb({error:'failed to find paper'})
				}else{
					var answer = paper.answer
					answer[json.qIdx]=json.newA
					paper.answer=answer
					paper.markModified('answer')
					paper.save(function(e1,newPaper){
						if(e1){
							cb({error:'failed to save paper'})
							console.log(e1)
						}else{
							cb({success:'OK'})
						}
					})
				}
			})
		}) 
		 
		socket.on('delete report',function(json,cb){
			Paper.findOne({
				status : { $not : /inactive/},
				_id : json._id
			}).exec(function(e,paper){
				paper.status = 'inactive'
				paper.save(function(e){
					if(e){
						cb({error:JSON.stringify(e)})
					}else{
						cb({success:'OK'})
					}
				})
			})			
		})
		
		socket.on('archive report',function(json,cb){
			Paper.findOne({
				status : { $not : /inactive/},
				_id : json._id
			}).exec(function(e,paper){
				paper.status = 'archived'
				paper.save(function(e){
					if(e){
						cb({error:JSON.stringify(e)})
					}else{
						cb({success:'OK'})
					}
				})
			})
		})
		
		socket.on('unarchive report',function(json,cb){
			Paper.findOne({
				status : { $not : /inactive/},
				_id : json._id
			}).exec(function(e,paper){
				paper.status = ''
				paper.save(function(e){
					if(e){
						cb({error:JSON.stringify(e)})
					}else{
						cb({success:'OK'})
					}
				})
			})
		})
		
		socket.on('print report',function(json,cb){
			Paper.findOne({
				_id : json._id
			}).exec(function(e,paper){
				if(e){
					cb({error:JSON.stringify(e)})
				}else{
					printReport(json,function(o){
						if(o.error){
							cb({error:o.error})
						}else if(o.success){
							cb(o)
						}
					})	
				}
			})
			console.log('print report socket on')
		})
		
		socket.on('help me pingQ',function(json,cb){
			
			var form2 = {
				apikey : account.examcopedia.apikey,
				mode : 'all'
			}
			
			if(json.subject){
				form2.subject = json.subject
			}
			
			if(json.syllabus){
				form2.syllabus = json.syllabus;
				if(json.dp){
					form2.dp = json.dp;
				}
			}
				
			if(json.hashed_id){
				form2.hashed_id = json.hashed_id;
			}
			request.post({
				url : 'http://examcopedia.gen-ed.com.au/pingQ',
				form : form2
			},function(e,h,b){
				if(e){
					console.log(e)
					cb(e)
				}else{
					/* create an entry in mongodb */
					if(json.mode=='Quiz'){
						var shortCode = 'Q'
					}else if(json.mode=='Homework'){
						var shortCode = 'H'
					}else{
						var shortCode = 'O'
					}
					var newLesson = new Lesson();
					shortCode += makeid();
					newLesson.shortCode = shortCode;
					newLesson.arrQuestions = shuffleArray(JSON.parse(b));
					newLesson.length = json.length;
					newLesson.creator = socket.request.user.name;
					newLesson.users = [];
					newLesson.created = Date.now();
					newLesson.progress = 0;
					newLesson.status = 'pending';
					newLesson.mode = json.mode;
					newLesson.save(function(e1){
						if(e1){
							cb(e1)
						}else{
							cb({success:true,shortCode:shortCode})
						}
					})
				}
			})
		})
	})
}