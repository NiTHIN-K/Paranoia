/** TO CHANGE PAGE
  queryGET('/game', res=>{
  document.body.innerHTML = res;
}, err=>{
  console.log("Error: " + err);
});
 */

var express = require('express');
var socket = require('socket.io');
var app = express();
var server = app.listen(process.env.PORT || 3000);
app.use(express.static('public'))
.set('views', 'views')
.set('view engine', 'ejs')
.get('/', (req, res) => res.render('pages/index'))
.get('/join', (req, res) => res.render('pages/join'))
.get('/game', (req, res) => res.render('pages/game'))
.get('/lobby', (req, res) => res.render('pages/lobby'))
.get('/asking', (req, res) => res.render('pages/asking'))
.get('/choosevictim', (req, res) => res.render('pages/choosevictim'));

var io = socket(server);
io.sockets.on('connection', newConnection);


var users = {};

function newConnection(socket){
  console.log("Connected: " + socket.id);
  socket.on('create_lobby', id=>{
    if(users[id]){
      console.log("lobby already exists");
      socket.emit('check_lobby_response', false);
    }else{
      users[id] = [];
      console.log("Lobby " + id + " created.");
      socket.join(id);
      socket.emit('check_lobby_response', true);
    }
  });

  socket.on('start_game', code=>{
    io.in(code).emit('populate_game', users[code])
  });

  socket.on('add_user', data=>{
    if(users[data.data2].includes(data.data1)){
      socket.emit('username_attempt', false)
    }else{
      users[data.data2].push(data.data1);
      socket.to(data.data2).emit('user_add', data.data1);
      socket.emit('username_attempt', true)
    }
  });

   socket.on('join_lobby', id=>{
    if(users[id]){
      socket.join(id);
      socket.emit('check_join_response', true);
    }else{
      socket.emit('check_join_response', false);
    }
  });

  socket.on('get_current_users', lobbyId=>{
    socket.emit('get_current_users_response', users[lobbyId]);
  });

  socket.on('get_victim_list', lobbyId=>{
    socket.emit('victim_list_response', users[lobbyId]);
  });

  socket.on('get_random_user', (id)=>{
    io.in(id).emit('random_user_response', users[id][Math.floor(users[id].length * Math.random())]);
  });

  socket.on('ask_question', questionData=>{
    io.in(questionData.lobby).emit('ask-victim', questionData);
  })

  // socket.on('ask_question', (id)=>{
  //   io.in(id)
  // });
}

