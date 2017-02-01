var pdfDoc = require('pdfkit')
var Lesson = require('./models/lesson')
var fs = require('fs')
var request = require('request')
var http = require('http')
var async = require('async')
var account = require('../config/auth')
var Paper = require('./models/paper')

var gm = require('gm').subClass({imageMagick:true})

/* 595 x 842 */
var pdfConfig = {
	margin : {
		left: 40,
		right: 40,
		top : 60,
		bottom: 60
	},
	path : process.env.OPENSHIFT_DATA_DIR || process.env.DATA_DIR ||'./public/',
	boxTopMargin : 20,
	boxLeftMargin : 10,
	boxPadding : 40,
	boxWidth : 135
}

//var domain = 'http://join.examcopedia.club/'
//var domain = "http://127.0.0.1:3002/"
var domain = 'http://examcopedia.gen-ed.com.au/'

module.exports = function(obj,cb){
	
	var filename = obj.fileName.split('.')[0]
	console.log('printreport.js: check to see if pdf already exists...')
	
	try{
		var eexist = fs.statSync(pdfConfig.path+'paperresult/'+filename+'.pdf')
		console.log('printreport.js: file exist! serving existing file.')
		cb({
			success:'paperresult/'+filename+'.pdf',
			reprint:true,
		})
		return;
	}catch(e){
		console.log('printreport.js: file does not exist. generating new report.')
	}
	
	jsonImgData={}
	categoryMasterKey = []
	arrHashedId = []
	arrAnswerKey = []
	arrResult = [0,0,0]
	arrResultIdx = 0
	intQCounter = 1
	stringAnswerKeysMakeups = ''
	arrJsonWrongQRedo = []
	
	/* notes eg: mode:Math_1;english:ABBDC...; */
	
	Lesson.findOne({
		shortCode : obj.quiz,
		status : { $not: /inactive/}
	}).exec(function(e,lesson){
		var arrQuestions = lesson.arrQuestions;
		console.log(arrQuestions.length)
		var arrMaths = arrQuestions.splice(0,20)
		var arrGA = arrQuestions
		
		var mathSyl = 'math_oc_exam'
		var tmp0 = lesson.notes.replace(/mode\:.*?\;/,function(s){
			mathSyl = s.replace(/\;|mode\:/g,'')
		})
		var arrGroup = [
			{subject : mathSyl,
			arr : arrMaths,
			answer : obj.answer.slice(0,20)},
			{subject : 'ga_sel_exam',
			arr : arrGA,
			answer : obj.answer.slice(20,50)}]
		
		console.log('async to categoriseQ called')
		
		async.each(arrGroup,
		function(arrSubject,callback){
			categorise(arrSubject,cb,function(b){
				categoryMasterKey = categoryMasterKey.concat(b.categoryKey)
				callback()
			})
		},function(e){
			if(e){
				cb(e)
				console.log(e)
			}else{
				lesson.notes.replace(/ /g,'').toUpperCase().replace(/ENGLISH\:.*?\;/,function(s){
					var string = s.replace(/\;|ENGLISH\:/g,'')
					
					for(var i = 0; i<string.length; i++){
						arrAnswerKey.push(string[i])
					}
				})
				drawPDF(obj,arrAnswerKey,categoryMasterKey,arrHashedId,cb)
			}
		})
	})
}

var categoryMasterKey = []
var arrHashedId = []
var arrAnswerKey = []
var arrResult = []
var arrResultIdx
var intQCounter
var stringAnswerKeysMakeups

function categorise(arrGroup,cb,callback){
	var arrQuestions = arrGroup.arr
	var subject = arrGroup.subject
	var answer
	var arrIncorrect = []

	/* appending data for pdf writing */
	for(var i = 0; i<arrQuestions.length; i++){
		if(arrQuestions[i].questionAnswer.length>0){
			answer = arrQuestions[i].questionAnswer.replace(/\<br\>/g,'').substring(0,1).toUpperCase()
		}else{
			answer = ''
		}
		arrAnswerKey.push(answer)
		
		/* determining if the answer is correct. if not, add to arrIncorrect */
		if(arrGroup.answer[i]!=answer){
			arrIncorrect.push(arrQuestions[i].questionHashedId)
		}
	}

	/* preparing to fetch syllabus dot point description */
	for (var j = 0; j<arrQuestions.length; j++){
		arrHashedId.push(arrQuestions[j].questionHashedId)
	}
	var syl = subject

	var form2 = {
		apikey : account.examcopedia.apikey,
		hashedId : arrHashedId,
		syl : syl
	}
	request.post({url: domain+'categoriseQ', form : form2},function(e,h,b){
		if(e){
			console.log(e)
			cb({error:JSON.stringify(e)})
		}else if(b.error){
			console.log(b.error)
			cb(b)
		}else{
			console.log('categoriseQ responded')
			fetching_hw(syl,arrIncorrect,JSON.parse(b),cb,function(){
				console.log('fetching homework callback')
				var arrFlag = []
				var arrImgs = []
				for(var l = 0; l<arrJsonWrongQRedo.length; l++){
					for(var k = 0; k<arrQuestions.length; k++){
						if(arrQuestions[k].questionHashedId==arrJsonWrongQRedo[l].originalQHashedId){
							arrJsonWrongQRedo[l].originalQuestion = arrQuestions[k].questionBody
							arrQuestions[k].questionBody.replace(/\<img.*?\>/g,function(s){
								arrFlag.push(false)
								
								var imgUrl
								var style = ''
								var tmp = s.replace(/src\=\".*?\"/,function(ss){
									imgUrl = ss.replace(/src\=|\"/g,'')
									arrImgs.push(imgUrl)
								})
								tmp = s.replace(/style\=\".*?\"/,function(ss){
									style = ss.replace(/style\=|\"/,'')
								})
								jsonImgData[imgUrl] = {}
								jsonImgData[imgUrl]['style'] = style
							})
							break;
						}
					}
				}
				if(arrFlag.length==0){
					callback({subject:subject,categoryKey:JSON.parse(b)})
					//drawPDF(obj,arrAnswerKey,JSON.parse(b),arrHashedId,cb)
				}else{
					for(var m = 0; m<arrImgs.length;m++){
						fetchImg(arrImgs[m],function(){/* dummy function */},function(){
							arrFlag.splice(0,1)
							if(arrFlag.length==0){
								
								callback({subject:subject,categoryKey:JSON.parse(b)})
								//drawPDF(obj,arrAnswerKey,JSON.parse(b),arrHashedId,cb)
							}
						})
					}
				}
			})
		}
	})
}

var arrJsonWrongQRedo = [] /* stores the array of data objects of the lessons */
var arrQAns = []
var qCounter = 1

function fetching_hw(syl,arrIncorrect,categoryKey,cb,callback){
	/* categoryKey is an array of all arrQuetions, NOT just the arrIncorrect */
	console.log('fetching homework')
	/* category : count */
	var arrRedo = pickIncorrect(arrIncorrect,categoryKey)
	arrRedo.sort(function(a,b){
		return b.count - a.count
	})
	
	var count = 0
	var arrHw = []
	
	/* continue picking lvl's until 3 hw or all of the wrong q's are exhausted */
	while(arrHw.length<3&&arrRedo.length>0){
		/* trying to find a question in that category */
		
		/*
		for(var i = 0; i<categoryKey.length; i++){
			if(categoryKey[i].lvl==arrRedo[count%(arrRedo.length)].lvl){
				for(var j = 0; j<arrIncorrect.length; j++){
					if(arrIncorrect[j]==categoryKey[i].hashed_id){
						var json = {
							lvl : categoryKey[i].lvl,
							originalQHashedId : categoryKey[i].hashed_id
						}
						arrJsonWrongQRedo.push(json)
						break;
					}
				}
			}
		}
		*/
		
		findIncorrect:
		for(var i = 0; i<categoryKey.length; i++){
			for(var j = 0; j<arrIncorrect.length;j++){
				if(categoryKey[i].hashed_id==arrIncorrect[j]&&categoryKey[i].lvl==arrRedo[count%(arrRedo.length)].lvl){
					/* this PARTICULAR question is incorrect */ /* AND this specific lvl is the lvl we are interested in */
					var json = {
						lvl : categoryKey[i].lvl,
						originalQHashedId : categoryKey[i].hashed_id
					}
					
					/* once the incorrect question had been chosen, it should not be chosen again.  */
					arrIncorrect.splice(j,1)
					
					arrHw.push(arrRedo[count%(arrRedo.length)].lvl)
					arrJsonWrongQRedo.push(json)
					break findIncorrect;
				}
			}
		}
		
		arrRedo[count%(arrRedo.length)].count --
		if(arrRedo[count%(arrRedo.length)].count==0){
			arrRedo.splice([count%(arrRedo.length)],1)
			count --
		}
		count ++
	}
	
	
	if(arrHw.length==0){
		callback()
		return
	}
	
	console.log('async fetching homework')
	async.each(arrHw,
	function(hwDP,callbackAsync){
		
		var form2 = {
			apikey : account.examcopedia.apikey,
			mode : 'all',
			syllabus : syl,
			dp : hwDP
		}
		
		request.post({url: domain+'pingQ',form:form2},function(e,h,b){
			if(e){
				console.log(e)
				cb(e)
			}else if(b.error){
				console.log(b.error)
				cb(b.error)
			}else{
				/* b should contain all the info that needs to be parsed into pdf */
				var json = JSON.parse(b)
				var newArray = shuffleArray(json).slice(0,2)
				for(var j = 0; j < arrJsonWrongQRedo.length;j++){
					if(arrJsonWrongQRedo[j].lvl==hwDP){
						if(!arrJsonWrongQRedo[j].Q1){						
							arrJsonWrongQRedo[j].Q1 = newArray[0]
							/* necessary, as sometimes, only 1 question is populated in the category */
							if(newArray.length>1){
								arrJsonWrongQRedo[j].Q2 = newArray[1]
							}
						}
					}
				}
				fetchImgData(newArray,cb,function(){
					callbackAsync()
				})
			}
		})
	},
	function(e){
		if(e){
			console.log(e)
		}else{
			callback()
		}
	})
}

function fetchImgData(jsonInput,cb,callback){
	var arrImg = [];
	var arrFlag = [];
	
	if(jsonInput.length==0){		
		callback()
		return
	}
	
	for(var i = 0; i<jsonInput.length; i++){
		var tmp = jsonInput[i].question.replace(/\[img.*?\]/g,function(s){
			
			var cleanedString = s.replace(/\[img|\]/g,'').split(' ')
			var imgUrl = 'img/'+jsonInput[i].hashed_id+'/'+cleanedString[0].split('_')[0] + '.' + cleanedString[0].split('_')[1]
			jsonImgData[imgUrl] = {}
			if(cleanedString[1]){
				jsonImgData[imgUrl]['style'] = cleanedString[1]
			}else{
				jsonImgData[imgUrl]['style'] = ''
			}
			
			arrFlag.push(false)
			arrImg.push(imgUrl)
		})
		
		var tmpAns = jsonInput[i].answer.replace(/\[img.*?\]/g,function(s){
			
			var cleanedString = s.replace(/\[img|\]/g,'').split(' ')
			var imgUrl = 'img/'+jsonInput[i].hashed_id+'/'+cleanedString[0].split('_')[0] + '.' + cleanedString[0].split('_')[1]
			jsonImgData[imgUrl] = {}
			if(cleanedString[1]){
				jsonImgData[imgUrl]['style'] = cleanedString[1]
			}else{
				jsonImgData[imgUrl]['style'] = ''
			}
			
			arrFlag.push(false)
			arrImg.push(imgUrl)
		})
	}
	
	if(arrImg.length==0){
		callback()
		return
	}
	
	async.each(arrImg,
	function(imgUrl,asyncCB){
		var request = http.get(domain+imgUrl,function(res){
			var imgData = ''
			res.setEncoding('binary')
			res.on('data',function(chunk){
				imgData += chunk
			})
			res.on('end',function(){
				fs.writeFile(pdfConfig.path + 'img/temp/' + imgUrl.split('/')[2],imgData,'binary',function(e){
					if(e){
						console.log(e)
						cb(e)
					}else{
						asyncCB()
					}
				})
			})
		})
	},function(e){
		if(e){
			console.log(e)
			cb({error:e})
		}else{
			async.each(arrImg,
			function(imgUrl,asyncCB1){
				gm(pdfConfig.path + 'img/temp/' + imgUrl.split('/')[2]).size(function(e,v){
					if(e){
						console.log('gm error'+JSON.stringify(e));
						cb(e)
					}else{
						jsonImgData[imgUrl]['dimension']=v;
						asyncCB1()
					}
				})
			},function(e1){
				if(e1){
					console.log(e1)
					cb({error:e1})
				}else{
					callback()
				}
			})
		}
	})
}

function fetchImg(imgUrl,cb,callback){
	var request = http.get(domain+imgUrl,function(res){
		var imgData = ''
		res.setEncoding('binary')
		res.on('data',function(chunk){
			imgData += chunk
		})
		res.on('end',function(){
			fs.writeFile(pdfConfig.path + 'img/temp/' + imgUrl.split('/')[2],imgData,'binary',function(e){
				if(e){
					console.log(e)
					cb(e)
				}else{
					gm(pdfConfig.path + 'img/temp/' + imgUrl.split('/')[2]).size(function(e,v){
						if(e){
							console.log('gm error'+e);
							cb(e)
						}else{
							jsonImgData[imgUrl]['dimension']=v;
							callback()
						}
					})
				}
			})
		})
	})
}

var jsonImgData = {}

function pickIncorrect(arrIncorrect,categoryKey){
	console.log('pickIncorrect called')
	var arrLvl = []
	for(var i = 0; i< arrIncorrect.length; i++){
		for(var j = 0; j<categoryKey.length; j++){
			if(arrIncorrect[i]==categoryKey[j].hashed_id){
				var flagPushNew = true
				var json = {}
				for(var k = 0; k<arrLvl.length; k++){
					if(arrLvl[k].lvl==categoryKey[j].lvl){
						arrLvl[k].count += 1
						flagPushNew = false
						break;
					}
				}
				if(flagPushNew){
					json = {
						lvl : categoryKey[j].lvl,
						count : 1
					}
					arrLvl.push(json)
					break;
				}
			}
		}
	}
	return arrLvl
}

function drawPDF(obj,arrAnswerKey,categoryKey,arrHashedId,cb){
	/* pareparing pdf */
	
	var pdfName = obj.fileName.split('.')[0]+'.pdf'
	var doc = new pdfDoc({
		bufferPages : true,
		margins : pdfConfig.margin
	})
	var stream = doc.pipe(fs.createWriteStream(pdfConfig.path+'paperresult/'+pdfName))
	
	stream.on('finish',function(){
		for(var key in jsonImgData){
			fs.unlink(pdfConfig.path+'img/temp/'+key.split('/')[2],function(){})
		}
		Paper.findOne({
			fileName : obj.fileName,
		}).exec(function(e,paper){
			if(e){
				console.log('reading redowrongq error!')
				cb({success:'paperresult/'+pdfName})
			}else{
				paper.stringifiedArrJsonWrongQRedo = JSON.stringify(arrJsonWrongQRedo)
				paper.save(function(e1){
					if(e1){
						console.log('saving redowrongq error!')
						cb({success:'paperresult/'+pdfName})
					}else{
						console.log('saving redowrongq successful.')
						cb({
							success : 'paperresult/'+pdfName,
							paper : paper,
						})
					}
				})
			}
		})
	})
	
	/* draw header */
	drawHeader(doc,obj)
	doc.y += 20
	doc.moveTo(50,doc.y).lineTo(540,doc.y).stroke()
	
	/* draw results */
	doc.y += 20
	var resultsTop = doc.y
	var resultLeft
	var linePosY = resultsTop
	doc.font('Helvetica').fontSize(12)
	var delay = 0
	for(var i = 0; i<arrAnswerKey.length; i++){
		if(i == 0){
			doc.fontSize(16).text('Mathematics',pdfConfig.margin.left+pdfConfig.boxLeftMargin+pdfConfig.boxWidth+pdfConfig.boxPadding,resultsTop,{width:pdfConfig.boxWidth,align:'center'})
			resultLeft = pdfConfig.margin.left+pdfConfig.boxLeftMargin+pdfConfig.boxWidth+pdfConfig.boxPadding
			doc.y += 10
		}else if(i == 20){
			arrResultIdx ++ 
			doc.fontSize(16).text('GA',pdfConfig.margin.left+pdfConfig.boxLeftMargin+pdfConfig.boxWidth*2+pdfConfig.boxPadding*2,resultsTop,{width:pdfConfig.boxWidth,align:'center'})
			resultLeft = pdfConfig.margin.left+pdfConfig.boxLeftMargin+pdfConfig.boxWidth*2+pdfConfig.boxPadding*2
			delay = 20
			doc.y += 10
		}
		
		/* English bandaid */
		else if(i == 50){
			arrResultIdx ++ 
			doc.fontSize(16).text('English',pdfConfig.margin.left+pdfConfig.boxLeftMargin,resultsTop,{width:pdfConfig.boxWidth,align:'center'})
			resultLeft = pdfConfig.margin.left+pdfConfig.boxLeftMargin
			doc.y += 10
			delay = 50
		}
		
		/* End English bandaid */
		
		linePosY = doc.y
		
		doc.y+=2
		
		doc.fontSize(8).text('Q'+(Number(i)+1-delay),resultLeft,linePosY)
		doc.fontSize(12).text(obj.answer[i],resultLeft+20,linePosY-2)
		
		if(obj.answer[i]==arrAnswerKey[i]){
			arrResult[arrResultIdx] ++
			drawTick(doc,resultLeft,linePosY)
		}else{
			drawCross(doc,resultLeft,linePosY)
			doc.text(arrAnswerKey[i],resultLeft+60,linePosY-2)
		}
		
		/* English Bandaid */
		if(i>=50){
			doc.fontSize(10).text(' ',130,linePosY-1,{
				continued:false
			})
			continue
		}
		/* End English Bandaid */
		
		for(var j = 0; j<categoryKey.length; j++){
			if(categoryKey[j].hashed_id==arrHashedId[i]&&categoryKey[j].description){
				doc.fontSize(10).text(categoryKey[j].description,resultLeft+80,linePosY-1,{
					continued:false
				})
				break;
			}
			/* if we go through every category key and still can't find it... */
			doc.text(' ',130,linePosY-1,{
				continued:false
			})
		}
	}
	
	/* tally results */
	var englishMark = 'English: '+arrResult[2] + '/20 ('+Math.round(arrResult[2]/0.2)+'%)'
	var mathsMark = 'Mathematics: '+arrResult[0] + '/20 ('+Math.round(arrResult[0]/0.2)+'%)'
	var gaMark = 'GA: '+arrResult[1] + '/30 ('+Math.round(arrResult[1]/0.3)+'%)'
	var totalMark = 'Total: '+ (arrResult[0]+arrResult[1]+arrResult[2]) + '/70 ('+Math.round((arrResult[0]+arrResult[1]+arrResult[2])/0.7)+'%)' 
	
	/* english */
	doc.text(englishMark,pdfConfig.margin.left+pdfConfig.boxLeftMargin, 680,{
		width : pdfConfig.boxWidth,
		align : 'center'
	})
	
	/* maths */
	doc.text(mathsMark,pdfConfig.margin.left+pdfConfig.boxLeftMargin+pdfConfig.boxWidth+pdfConfig.boxPadding, 680,{
		width : pdfConfig.boxWidth,
		align : 'center'
	})
	
	/* ga */
	doc.text(gaMark,pdfConfig.margin.left+pdfConfig.boxLeftMargin+pdfConfig.boxWidth*2+pdfConfig.boxPadding*2, 680,{
		width : pdfConfig.boxWidth,
		align : 'center'
	})
	
	doc.rect(pdfConfig.margin.left+pdfConfig.boxLeftMargin, 675,pdfConfig.boxWidth*3+pdfConfig.boxPadding*2 ,17).stroke()
	
	/* total */
	doc.fontSize(24).text(totalMark,pdfConfig.margin.left+pdfConfig.boxLeftMargin, 700,{
		width : pdfConfig.boxWidth*3+pdfConfig.boxPadding*2,
		align : 'center'
	})
	
	/* end first page */
	
	/* begin second page */
	for(var i = 0; i<arrJsonWrongQRedo.length; i++){
		doc.addPage()
		doc.margins = pdfConfig.margin
		var questionBody = arrJsonWrongQRedo[i].originalQuestion
								.replace(/\<.?h4\>|\&nbsp\;|\<\/div\>|\<div.*?\>/g,'')
								.replace(/\<br.*?\>/g,'\n')
		
		doc.fontSize(28).text('Incorrect:')
		doc.fontSize(12)
		drawQuestion(doc,questionBody,null)
		
		doc.y += 40
		
		if(arrJsonWrongQRedo[i].Q1){
			
			var boxTop = doc.y - 5
			var pageNum = doc.bufferedPageRange().count
			
			doc.fontSize(28).text('Makeup '+intQCounter+':')
			doc.fontSize(12)
			drawQuestion(doc,arrJsonWrongQRedo[i].Q1.question,arrJsonWrongQRedo[i].Q1.hashed_id)
			var boxBottom = doc.y - 8
			
			if(doc.bufferedPageRange().count > pageNum){
				/* this make up question expanded two or more pages */
				var flagFirstPage = true
				var flagLastPage = false
				
				/* draw open rectangle */
				doc.switchToPage(pageNum-1)
				doc.moveTo(pdfConfig.margin.left-3,842-2*pdfConfig.margin.bottom)
				.lineTo(pdfConfig.margin.left-3,boxTop)
				.lineTo(595-pdfConfig.margin.right+9,boxTop)
				.lineTo(595-pdfConfig.margin.right+9,842-2*pdfConfig.margin.bottom)
				.stroke()
				pageNum ++ 
				
				/* vertical lines */
				while(doc.bufferedPageRange().count>pageNum){
					doc.switchToPage(pageNum-1)
					doc.moveTo(pdfConfig.margin.left-3,2*pdfConfig.margin.top)
					.lineTo(pdfConfig.margin.left-3,842-2*pdfConfig.margin.bottom)
					.moveTo(595-pdfConfig.margin.right+9,2*pdfConfig.margin.top)
					.lineTo(595-pdfConfig.margin.right+9,842-2*pdfConfig.margin.bottom)
					doc.stroke()
					pageNum ++
				}
				
				boxBottom += 16
				
				/* draw closing rectange */
				doc.switchToPage(pageNum-1)
				doc.moveTo(pdfConfig.margin.left-3,pdfConfig.margin.top)
				.lineTo(pdfConfig.margin.left-3,boxBottom)
				.lineTo(595-pdfConfig.margin.right+9,boxBottom)
				.lineTo(595-pdfConfig.margin.right+9,pdfConfig.margin.top)
				.stroke()
				
			}else{
				/* wen question only takes a single page */
				boxBottom = doc.y + 20
				doc.rect(pdfConfig.margin.left-3,boxTop,595-pdfConfig.margin.left-pdfConfig.margin.right+15,boxBottom-boxTop).stroke()
			}
			
			stringAnswerKeysMakeups += 'Makeup '+intQCounter+': '+arrJsonWrongQRedo[i].Q1.answer + '\n\n'	
			intQCounter ++
		}

		if(arrJsonWrongQRedo[i].Q2){
			doc.y+=40
			
			var boxTop = doc.y - 5
			var pageNum = doc.bufferedPageRange().count
			
			doc.fontSize(28).text('Makeup '+intQCounter+':')
			doc.fontSize(12)
			drawQuestion(doc,arrJsonWrongQRedo[i].Q2.question,arrJsonWrongQRedo[i].Q2.hashed_id)
			var boxBottom = doc.y - 8
			
			if(doc.bufferedPageRange().count > pageNum){
				/* this make up question expanded two or more pages */
				var flagFirstPage = true
				var flagLastPage = false
				
				/* draw open rectangle */
				doc.switchToPage(pageNum-1)
				doc.moveTo(pdfConfig.margin.left-3,842-2*pdfConfig.margin.bottom)
				.lineTo(pdfConfig.margin.left-3,boxTop)
				.lineTo(595-pdfConfig.margin.right+9,boxTop)
				.lineTo(595-pdfConfig.margin.right+9,842-2*pdfConfig.margin.bottom)
				.stroke()
				pageNum ++ 
				
				/* vertical lines */
				while(doc.bufferedPageRange().count>pageNum){
					doc.switchToPage(pageNum-1)
					doc.moveTo(pdfConfig.margin.left-3,2*pdfConfig.margin.top)
					.lineTo(pdfConfig.margin.left-3,842-2*pdfConfig.margin.bottom)
					.moveTo(595-pdfConfig.margin.right+9,2*pdfConfig.margin.top)
					.lineTo(595-pdfConfig.margin.right+9,842-2*pdfConfig.margin.bottom)
					doc.stroke()
					pageNum ++
				}
				
				boxBottom += 16
				
				/* draw closing rectange */
				doc.switchToPage(pageNum-1)
				doc.moveTo(pdfConfig.margin.left-3,pdfConfig.margin.top)
				.lineTo(pdfConfig.margin.left-3,boxBottom)
				.lineTo(595-pdfConfig.margin.right+9,boxBottom)
				.lineTo(595-pdfConfig.margin.right+9,pdfConfig.margin.top)
				.stroke()
				
			}else{
				/* wen question only takes a single page */
				boxBottom = doc.y + 20
				doc.rect(pdfConfig.margin.left-3,boxTop,595-pdfConfig.margin.left-pdfConfig.margin.right+15,boxBottom-boxTop).stroke()
			}
			
			stringAnswerKeysMakeups += 'Makeup '+intQCounter+': '+arrJsonWrongQRedo[i].Q2.answer + '\n\n'
			intQCounter ++
		}
	}
	
	/* answer keys to makeup q's */
	
	if(stringAnswerKeysMakeups!=''){
		doc.addPage().addPage()
		doc.text('Answer Keys to makeup questions:')
		doc.text(stringAnswerKeysMakeups)
	}
	
	doc.flushPages()
	doc.end()
}

function drawQuestion(doc,string,hashed_id){
	var sTreated = string.replace(/\<img.*?\>|\[img.*?\]/g,function(s){
		return '[STRING SPLITER]'+ s +'[STRING SPLITER]'
	})
	var arrString = sTreated.split('[STRING SPLITER]')
	for(var i = 0; i<arrString.length; i++){
		if(/\<img.*?\>|\[img.*?\]/.test(arrString[i])){
			/* img */
			var imgUrl
			var sJsonKey
			if(/\[img.*?\]/.test(arrString[i])){
				var fileName = arrString[i].replace(/\[img|\]/g,'').split(' ')[0].replace('_','.')
				sJsonKey = 'img/'+hashed_id+'/'+fileName
				imgUrl = 'img/temp/'+fileName
			}else{
				var tmp = arrString[i].replace(/src\=\".*?\"/,function(s){
					sJsonKey = s.replace(/src\=|\"/g,'')
					imgUrl = 'img/temp/'+sJsonKey.split('/')[2]
				})
			}
			var thisImgData = jsonImgData[sJsonKey];
			var percentWidth=100;
			if(/width/.test(thisImgData.style)){
				thisImgData.style.replace(/width\:.*?\%/,function(s){
					percentWidth = s.replace(/width\:|%/g,'');
				})
			}
			//full width = 400px
			var targetWidth = Math.min(400/100*percentWidth,thisImgData.dimension.width);
			var targetHeight = targetWidth /thisImgData.dimension.width * thisImgData.dimension.height;
			if(doc.y+targetHeight>730){
				doc.addPage()
			}
			doc.image(pdfConfig.path+imgUrl,100,doc.y,{fit : [targetWidth,targetHeight]});
			//doc.y += targetHeight;
		}else{
			/* just text */
			doc.text(arrString[i].replace(/\t/g,''))
		}
	}
}

function drawHeader(doc,obj){
	
	var date = new Date()
	var day = date.getDate()
	var month = date.getMonth()
	var year = date.getFullYear()
	
	doc.info['Title'] = 'Mock Exam'
	doc.info['Author'] = 'Generation Educaiton'

	doc.image('./public/img/gened.png',50,50,{fit : [75,75]});
	//doc.font('Helvetica').fontSize(10).text('Generation Education',50,120,{width:75, align:'center'});
	doc.font('Helvetica').fontSize(32).text('Mock Exam Report: '+obj.quiz,125,95,{align:'left'});
	doc.fontSize(12).text('FOR',40,165,{
		width:515, 
		align:'center',
		continued:false
	})
	doc.font('Helvetica-Oblique').fontSize(18).text(obj.studentName,{
		width:515, 
		align:'center',
		continued:false
	})
	doc.font('Helvetica').fontSize(12).text('ON',40,215,{
		width:515, 
		align:'center',
		continued:false
	})
	doc.font('Helvetica-Oblique').fontSize(18).text(parseDate(day,month,year),{
		width:515, 
		align:'center',
		continued:false
	})
	
}

function parseMonth(m){
	switch(Number(m)+1){
		case 1:
		return 'January';
		case 2:
		return 'Febuary';
		case 3:
		return 'March';
		case 4:
		return 'April';
		case 5:
		return 'May';
		case 6:
		return 'June';
		case 7:
		return 'July';
		case 8:
		return 'August';
		case 9:
		return 'September';
		case 10:
		return 'October';
		case 11:
		return 'November';
		case 12:
		return 'December';
	}
}

function parseDay(d){
	
	switch(Number(d)){
		case 1:
		return '1st'
		case 2:
		return '2nd'
		case 3:
		return '3rd'
		case 21:
		return '21st'
		case 22:
		return '22nd'
		case 23:
		return '23rd'
		case 31:
		return '31st'
		default:
		return d+'th'
	}
}

function parseDate(d,m,y){
	return parseDay(d)+' '+parseMonth(m)+' '+y
}

function drawTick(doc,boxLeft,linePosY){
	doc.moveTo(boxLeft+40,linePosY+3).lineTo(boxLeft+40+3,linePosY+7).lineTo(boxLeft+40+8,linePosY-2).stroke();
}

function drawCross(doc,boxLeft,linePosY){
	doc.moveTo(boxLeft+40,linePosY).lineTo(boxLeft+40+7,linePosY+7)
	doc.moveTo(boxLeft+40+7,linePosY).lineTo(boxLeft+40,linePosY+7).stroke()
}

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
