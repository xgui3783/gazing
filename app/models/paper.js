
var mongoose = require('mongoose');

var paperResponse = mongoose.Schema({
	fileName : String,
	quiz : String,
	studentName: String,
	studentId : String,
	answer : [String],
	answerKeys : [String],
	status: String, /* set as inactive to be unsearchable */
	stringifiedArrJsonWrongQRedo : String, /* stringified wrong q redo */
},{
	timestamps : true
})

module.exports = mongoose.model('PaperResponse',paperResponse)