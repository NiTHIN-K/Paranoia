// socket.emit('event', data)
// socket.on('event', data)

var numUsers = 0;
var isHost = false;
var socket;
var lobby_id;
var name = "";   // this client's name
var members;
// $(document).ready(function(){    
    socket = io();
    socket.on('check_lobby_response', lobbyCreationAttempt)
    socket.on('check_join_response', joinLobbyAttempt)
    socket.on('populate_game', (memberList)=>{
        members = memberList;
        startGame();
    })
// });

function joinLobbyAttempt(val){
    console.log("Server responded with: " + val);
    if(val){
        queryGET('/lobby', res=>{
            document.body.innerHTML = res;
            document.getElementById("lobby-label").innerHTML = lobby_id;
            socket.emit('get_current_users', lobby_id);
            socket.on('get_current_users_response', allUsers=>{
                for(var i = 0; i < allUsers.length; i++){
                    addUserToLobby(allUsers[i]);
                }
                document.getElementById("page-lobby").style.display="flex";
                socket.removeAllListeners('get_current_users_response');
            });
            
            //  Entering name
            document.getElementById('username-field').addEventListener('keypress', e=>{
                if(window.event.keyCode==13){}else{return;}
                if(document.getElementById('username-field').value==''){return;}
                name = document.getElementById('username-field').value;
                socket.emit('add_user', {"data1":name, "data2":lobby_id});
            });
            socket.on('username_attempt', nameAvailable=>{
                if(nameAvailable){
                    document.getElementById('username-field').style.display = "none";
                    addUserToLobby(name);
                    
                }else{
                    alert('Name already taken bozo');
                }
            })
    
            socket.on('user_add', newname=>{
                addUserToLobby(newname);
            });    
          }, err=>{
            console.log("Error: " + err);
          });

    }else{
        alert('Invalid lobby ID.');
    }
}

// function continueLobby(val){

// }

function lobbyCreationAttempt(val){
    console.log("Server responded with: ");
    console.log(val);
    if(val){
        queryGET('/lobby', res=>{
            document.body.innerHTML = res;

            document.getElementById("lobby-label").innerHTML = lobby_id;

            isHost = true;
        
            //  Entering name
            document.getElementById('username-field').addEventListener('keypress', e=>{
                if(window.event.keyCode==13){}else{return;}
                if(document.getElementById('username-field').value==''){return;}
                name = document.getElementById('username-field').value;
                socket.emit('add_user', {"data1":name, "data2":lobby_id});
            });
    
            socket.on('username_attempt', nameAvailable=>{
                if(nameAvailable){
                    document.getElementById('username-field').style.display = "none";
                    addUserToLobby(name);
                }else{
                    alert('Name already taken bozo');
                }
            })
    
            socket.on('user_add', newname=>{
                addUserToLobby(newname);
            });
    
          }, err=>{
            console.log("Error: " + err);
          });

    }else{
        createLobby();
    }
}

function endLobby(){
    socket.emit('start_game', lobby_id);
}

function addUserToLobby(newname){
    numUsers++;
    if(name!="" && numUsers >= 1 && isHost && !(document.getElementById('start-button'))){
        var start_btn = `<div class="button" onclick="endLobby()" id="start-button">START GAME</div>`;
        document.getElementById("lobby-label").insertAdjacentHTML("beforebegin", start_btn);
    
    }
    var lobby_user = `<div style=" animation: slideIn .2s ease-out forwards;" class="lobby-user button">` + newname + `</div>`;
    document.getElementById("lobby-list").insertAdjacentHTML("beforeend", lobby_user);


}

function createLobby(){
    lobby_id = Math.floor(Math.random()*9000+1000);
    socket.emit('create_lobby', lobby_id);
}

function joinLobby(){
    queryGET('/join', res=>{
        document.body.innerHTML = res;
        document.getElementById('gamecode-field').addEventListener('keypress', e=>{
            if(window.event.keyCode==13){e.preventDefault()}else{return;}
            if(document.getElementById('gamecode-field').value==''){alert('Invalid lobby ID.');return;}
            lobby_id = document.getElementById('gamecode-field').value;
            socket.emit('join_lobby', lobby_id)
            document.getElementById('gamecode-field').value='';
        });
      }, err=>{
        console.log("Error: " + err);
      });
}



function queryGET(url, successCallback, errorCallback){
    const options = {method: 'GET',
                    headers: {
                        'Content-Type': 'html/text'
                    },
                };
    fetch(url, options)
    .then(resp => resp.text())
    .then(text=>{
        successCallback(text);
    })
    .then(err=>{
        if(err){
            errorCallback(err);
        }
    });
  }