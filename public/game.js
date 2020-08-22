var victimList = {};
var questionData;
socket.on('random_user_response', name => {
    chosenName = name;
    console.log('before brryt');
    brrrrt(0, 10);
});
socket.on('victim_list_response', retList => {
    console.log(retList);
    victimList = retList;
    for (i = 0; i < victimList.length; i++) {
        if(victimList[i] != name){
            var lobby_user = `<div style=" animation: slideIn .2s ease-out forwards;" class="lobby-user button" onclick="victimSelect(`+i+`)">` +victimList[i]+ `</div>`;
            document.getElementById("lobby-list").insertAdjacentHTML("beforeend", lobby_user)
    }
    }
});
socket.on('ask-victim', qData=>{
    questionData = qData;
    console.log('ask victim was called');
    if(name == qData.victim){    // this user is the victim and receives the question
        queryGET('/chooseanswer', res => {
            document.body.innerHTML = res;
            console.log("IM THE VICTIM HERE");
            console.log(qData.question);
            socket.emit('selecting-answer', qData);
        }, err => {
            console.log("Error: " + err);
        });
    }
    else if(name != qData.asker){  // this user is not participating in this question

    }
});
socket.on('answer_list_response', retList => {
    console.log(retList);
    victimList = retList;
    for (i = 0; i < victimList.length; i++) {
        if(victimList[i] != name){
            var lobby_user = `<div style=" animation: slideIn .2s ease-out forwards;" class="lobby-user button" onclick="endRound(`+i+`)">` +victimList[i]+ `</div>`;
            document.getElementById("lobby-list").insertAdjacentHTML("beforeend", lobby_user)
    }
    }
});

var askedaQ = "<span id='is-asking'><br>ASKED A QUESTION TO...</span>";
var whoAnsWit =  "<span id='is-asking'><br>WHO ANSWERED WITH...</span>";

socket.on('show_final_results', finalQData=>{   // Displaying final results
    console.log(finalQData);
    queryGET('/finalanswer', res=>{
        document.body.innerHTML = res;
        document.getElementById('asker-name').innerHTML = finalQData.qData.asker + askedaQ;
        document.getElementById('answerer-name').style.visibility = "visible";

        document.getElementById('answerer-name').innerHTML = finalQData.qData.victim + whoAnsWit + finalQData.ans;
        console.log('I have finished displaying both the asker and the asnwer or im dumb');
        setTimeout(()=>{
            startGame();
        }, 5000);
      }, err=>{
        console.log("Error: " + err);
      });
});


var question;
var chosenName;

var areAsking = "<span id='is-asking'><br>ARE ASKING A QUESTION...</span>";
var isAsking = "<span id='is-asking'><br>IS ASKING A QUESTION...</span>";
function startGame() {
    queryGET('/game', res => {
        document.body.innerHTML = res;
        //socketon
        if (isHost) {
            socket.emit('get_random_user', lobby_id);
        }


    }, err => {
        console.log("Error: " + err);
    });
}

function brrrrt(count, curve) {
    setTimeout(() => {
        if (curve >= 400) {
            if (name == chosenName) {
                document.getElementById('asker-name').innerHTML = "YOU" + areAsking;
            } else {
                document.getElementById('asker-name').innerHTML = chosenName + isAsking;
            }
            document.getElementById('asker-name').style.color = '#7faaff';
            document.getElementById('is-asking').style.visibility = 'visible';
            document.getElementById('is-asking').style.color = '#7faaff';
            setTimeout(askQuestion, 1800);
            return;
        }
        document.getElementById('asker-name').innerHTML = members[count % members.length] + isAsking;
        document.getElementById('asker-name').style.fontSize = '100px';

        brrrrt(++count, curve * 1.1);
    }, curve);

}


function askQuestion() {
    if (name == chosenName) {
        console.log('IM ASKING WEEE');
        queryGET('/asking', res => {
            document.body.innerHTML = res;
        }, err => {
            console.log("Error: " + err);
        });
    }
}

function askingChoice(shotTaker) {
    if (document.getElementById('asking-field').value == '') { alert('Ask a question, fool.'); return; }
    question = document.getElementById('asking-field').value;
    if (shotTaker == 1) {
        queryGET('/choosevictim', res => {
            document.body.innerHTML = res;
            socket.emit('get_victim_list', lobby_id);
            // document.getElementById('asking-field').value = '';
            console.log('i took shot weee');
        }, err => {
            console.log("Error: " + err);
        });
    } else {
        // if asker did not take shot
    }
}

function victimSelect(victimNum){
    console.log(victimList[victimNum]);
    questionReq = {"asker":name, "lobby":lobby_id, "question":question, "victim":victimList[victimNum]};
    socket.emit('ask_question', questionReq);
}

function endRound(answerChoiceNum){
    console.log('ENGAME');
    var finalAnswer = victimList[answerChoiceNum];// todo get name from answerchoicenum
    qAndAns = {"qData": questionData, "ans": finalAnswer}
    socket.emit('end_round', qAndAns);    //todo emit endround
    console.log('ENGAME EMITTED SOCKETFUCK');
    //TODO
}