var mongoose = require('mongoose')

var userSchema = mongoose.Schema({
	name : String,
	strId : String,
	start: Number,
	answerSheet : String /* stringified JSON objects */
},{
	timestamps : true
})

var lessonSchema = mongoose.Schema({
	shortCode : String,
	arrQuestions : Array,
	progress : Number,
	mode : String,
	length : Number,
	creator : String,
	users : [userSchema],
	created : Date,
	status : String,
	notes : String
})

lessonSchema.methods.remove = function(pos,num){
	this.arrQuestions.splice(pos-1,num);
}

lessonSchema.methods.showTen = function(){
	return this.arrQuestions.slice(0,10)
}

lessonSchema.methods.showOne = function(i){
	return this.arrQuestions.slice(i-1,i)
}

lessonSchema.methods.addUser = function(strId,name){
	var flag = true;
	for (var i = 0; i<this.users.length; i++){
		if(this.users[i].strId==strId){
			flag = false;
			break;
		}
	}
	if(flag){
		this.users.push({strId:strId, name:name,answerSheet:''});
	}
	return this.users
}

lessonSchema.methods.addHomeworkUser = function(strId,name,start){
	var flag = true;
	for (var i = 0; i<this.users.length; i++){
		if(this.users[i].strId==strId){
			flag = false;
			var json = {};
			var jsonAnswerSheet = JSON.parse('{'+this.users[i].answerSheet+'}')
			for (var j = 0; j<this.length+1; j++){
				json['start'] = this.users[i].start
				if(!jsonAnswerSheet[j]){
					json['progress'] = j
					json['userAnswers'] = '{'+this.users[i].answerSheet+'}'
					return json
					break
				}
			}
			json['progress'] = this.length + 1
			return json
			break
		}
	}
	if(flag){
		this.users.push({strId:strId, name:name,start:start,answerSheet:''});
		return flag
	}
}

lessonSchema.methods.choseMCQ = function(strId,qNum,qC){
	for (var i=0 ; i<this.users.length; i++){
		if(this.users[i].strId==strId){
			if(this.users[i].answerSheet!=''){
				this.users[i].answerSheet+=','
			}
			this.users[i].answerSheet+='"'+qNum+'":"'+qC+'"';
		}
	}
}

lessonSchema.methods.nextQuestion = function(){
	this.progress ++
}

module.exports = mongoose.model('Lesson',lessonSchema)