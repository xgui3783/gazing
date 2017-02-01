var socket = io();

$(document).ready(function(){
	$('#id_modal_div_genericModal .btn-success').off('click').click(function(){
		if($(this).hasClass('disabled')){
			return;
		}
		$(this).addClass('disabled');
		var _this = $(this);
		switch($(this).attr('id')){
			case 'id_modal_primaryBtn_quiz':
				var json = {
					subject : $('#id_modal_div_genericModal select').val(),
					length : $('#id_modal_div_genericModal input').val(),
					mode : 'Quiz'
				}
				var newArray = [];
				socket.emit('help me pingQ',json,function(o){
					if(o.error){
						info_modal(o)
						_this.removeClass('disabled')
					}else{
						window.location.href = '/quiz?v='+o.shortCode;
					}
				})
			break;
			case 'id_modal_primaryBtn_homework':
				var json = {
					subject : $('#id_modal_div_genericModal select').val(),
					length : $('#id_modal_div_genericModal input').val(),
					mode : 'Homework'
				}
				var newArray = [];
				socket.emit('help me pingQ',json,function(o){
					if(o.error){
						info_modal(o)
						_this.removeClass('disabled')
					}else{
						window.location.href = '/homework?v='+o.shortCode;
					}
				})
			
			break;
			default:
			break;
		}
	})
	
	$('h1').click(function(){
		window.location.href='/'
	})
	
	
	if($('.right,.left').length>0){
		$('.right .panel').css('max-height',$(window).height()-60)
		$('.left .panel').css('max-height',$(window).height()-60)
		$('.right,.left').attr('data-offset-top',$('#centralColumn').offset().top-30)
		$('#centralColumn').css('min-height',$(window).height()-60)
	}
})

/* parsing in [img] tags */
function parsing_preview(i,h_id){
	var escaped_i = escapeHtml(i);
	//h_id = escapeHtml(h_id);
	var j = escaped_i.replace(/\[img.*?\]/g,function(s){
		return parsing_img(s,h_id);
	});
	
	var index = 0;
	var k = j.replace(/\[mcq .*?\]/g,function(s){
		index += 1;
		return parsing_mcq(index,s);
	});
	
	var l = k.replace(/\[su.*?\]/g,function(s){
		if(s.indexOf('sub')==1){
			s = s.replace(/\[sub /,'<sub>');
			s = s.replace(/\]$/,'</sub>')
		}
		if(s.indexOf('sup')==1){
			s = s.replace(/\[sup /,'<sup>');
			s = s.replace(/\]$/,'</sup>')
		}
		return s;
	});
	
	var m = l.replace(/\[space .*?\]/g,function(s){
		s = s.replace(/\[space |\]/g,'');
		ssplit = s.split(' ');
		return parsing_space(ssplit[0],ssplit[1]);
	})
	
	return m;
}

function parsing_mcq(i,s){
	var letter = String.fromCharCode(64 + i);
	var string = s.replace(/\[mcq |\]/g,'');
	return '<div class = "row"><div class = "col-md-2">'+letter+'</div><div class = "col-md-8">'+string+'</div></div>';
}

function parsing_img(i,h_id){
	var isplit = i.replace(/\[|\]/g,'').split(' ');
	var filename = isplit[0].substring(3,isplit[0].lastIndexOf('_'));
	var fileextension = isplit[0].substring(isplit[0].lastIndexOf('_')+1);
	var returnstring = '<div class = "col-md-12"><img class="col-md-12" src = "http://join.examcopedia.club/img/'+ h_id +'/'+filename+'.'+fileextension+'" /></div>';
	
	
	if(i.replace(/\[|\]/g,'').split(' ').length>1){
		for(var j=0;j<i.replace(/\[|\]/g,'').split(' ').length;j++){
			var params = i.replace(/\[|\]/g,'').split(' ')[j].split('=');
			if(params.length<2){
				continue;
			}
			returnstring = concatstyle(returnstring,params);
		}
	}else{
		return returnstring;
	}
	
	return returnstring;
}

function parsing_space(num,type){
	if(!$.isNumeric(num)||(type!='lines'&&type!='blank'&&type!='box')){
		return '';
	}
	var returnstring = '<div class = "row">';
	for(var j=0;j<num;j++){
		returnstring += '<div class = "col-md-12 spaces_'+type+'"><h4>&nbsp;</h4></div>';
	}
	returnstring +='</div>';
	return returnstring;
}

function concatstyle(i,p){
	var r = '';
	var concatstring = '';
	
	switch(p[0]){
		case 'r':
			if(!$.isNumeric(p[1])){
				return i;
			}else{
				concatstring = 
					'-webkit-transform: rotate('+p[1]+'deg);'+
					'-moz-transform: rotate('+p[1]+'deg);'+
					'-o-transform: rotate('+p[1]+'deg);'+
					'-ms-transform: rotate('+p[1]+'deg);'+ 
					'transform: rotate('+p[1]+'deg);'
			}
		break;
		case 'w':
			if(!$.isNumeric(p[1])){
				return i;
			}else{
				//concatstring = 'max-width:'+p[1]+'%'
				concatstring = Math.round(p[1]/100*12);
			}
		break;
		default:
		break;
	}
	console.log(concatstring)
	return i.replace(/img class\=\".*?\"/,'img class="col-md-'+concatstring+'"');
}

var entityMap = {
"&": "&amp;",
"<": "&lt;",
">": "&gt;",
'"': '&quot;',
"'": '&#39;',
"/": '&#x2F;',
"\n":"<br>",
"\r":"<br>",
"\r\n":"<br>",
"\t":"&nbsp;"
};

function escapeHtml(i){
	return String(i).replace(/\r\n|\r|\n|\&|\<|\>|\"|\'|\//g,function(s){
		return entityMap[s];
	});
}

function info_modal(i){
	$('#id_modal_div_infoModal .modal-body').html(escapeHtml(i))
	$('#id_modal_div_infoModal').modal('show')
}
