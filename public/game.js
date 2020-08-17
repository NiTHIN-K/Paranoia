var victimList = {};
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
    console.log('ask victim was called');
    if(name == qData.victim){
        console.log("IM THE VICTIM HERE");
    }
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
            // document.getElementById('asking-field').addEventListener('keypress', e=>{
            //     if(window.event.keyCode==13){e.preventDefault()}else{return;}
            //     if(document.getElementById('asking-field').value==''){alert('Ask a question, fool.');return;}
            //     question = document.getElementById('asking-field').value;
            //     socket.emit('ask_question', question)
            //     document.getElementById('asking-field').value='';

            // });

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