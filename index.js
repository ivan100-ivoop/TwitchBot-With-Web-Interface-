const tmi = require('tmi.js');
const mongoose = require('mongoose');
const bodyparser = require('body-parser');
const config = require('./config.json');
const Commands = require('./db/Commands.js');
var express = require('express');
var app = express();
app.set('view engine', 'ejs');
app.use(bodyparser.urlencoded({extended: false}));
app.use(express.json());
app.use('/', express.static('public'))
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

const Giveaway = new Map();

const client = new tmi.Client({
  options: { debug: true },
  connection: {
    secure: true,
    reconnect: true
  },
  identity: {
    username: config.username,
    password: `oauth:${config.token}`
  },
  channels: config.channel
});

async function getCommands(ch){
	let _command = [];
	for(let i =0; i<ch.length; i++){
		let _channel = ch[i];
		const info = await Commands.find({ id: _channel.split('#')[1] });
		if(info){
			for( let t =0; t<info.length; t++){
				let db = info[t];
				_command.push({
					command: db.name,
					message: db.response,
					userlevel: db.access
				})
			}
		}
	}
	return _command;
}

function getUser(u){
	if(u.length == 0){
		return u[0];
	}
	return u[Math.floor(Math.random() * u.length)] || null;
}

function isMatch(c, u){
	const give = Giveaway.get(c);
	for(let i =0; i<give.users.length; i++){
		let user = give.users[i];
		if(user.username == u){
			return true;
		}
	}
	return false;
}

app.get('/', async(req, res)=>{
	const data = await getCommands(config.channel);
  res.render('index', { prefix: config.prefix, icon: config.img, title: config.title, data: data , channel: config.channel[0] ,user: config.username });
});

app.post('/deleteCommand', async (req, res)=>{
	res.setHeader("ContentType", "application/json");
	const { channel, command } = req.body;
	if(!channel){
		res.status(200).json({
			success: false,
			message: "Error, body Not Found!"
		})
		return ;
	}
	const info = await Commands.findOne({ id: channel, name: command }) || null;
	if(info){
		await info.delete();
		const command = await await getCommands([`#${channel}`]);
		res.status(200).json({
			success: true,
			data: {
				commands: command
			}
		})
	} else {
		res.status(200).json({
			success: false,
			message: "Error, command Not exists"
		})
	}
});

app.post('/editCommand', async (req, res)=>{
	res.setHeader("ContentType", "application/json");
	const { channel, originalCommand, commandInputEdit, messageInputEdit, userlevelEdit } = req.body;
	if(!channel){
		res.status(200).json({
			success: false,
			message: "Error, body Not Found!"
		})
		return ;
	}
	const info = await Commands.findOne({ id: channel, name: originalCommand }) || null;
	if(info){
		info.name = commandInputEdit;
		info.response = messageInputEdit;
		info.access = userlevelEdit;
		await info.save();
		const command = await await getCommands([`#${channel}`]);
		res.status(200).json({
			success: true,
			data: {
				commands: command
			}
		})
	} else {
		res.status(200).json({
			success: false,
			message: "Error, command Not exists"
		})
	}
});

app.post('/addCommand', async (req, res)=>{
	res.setHeader("ContentType", "application/json");
	const { channel, commandInput, messageInput, userlevel } = req.body;
	if(!channel){
		res.status(200).json({
			success: false,
			message: "Error, body Not Found!"
		})
		return ;
	}
	const info = await Commands.findOne({ id: channel, name: commandInput }) || null;
	if(!info){
		const newInfo = new Commands({ id: channel, name: commandInput, response: messageInput, access: userlevel });
		await newInfo.save();
		const command = await await getCommands([`#${channel}`]);
		res.status(200).json({
			success: true,
			data: {
				commands: command
			}
		})
	} else {
		res.status(200).json({
			success: false,
			message: "Error, command already exists"
		})
	}
	
})

app.get('/giveaway', async (req, res)=>{
	 res.render('giveaway', { prefix: config.prefix, icon: config.img, title: config.title, channel: config.channel[0] ,user: config.username });
})

client.on('message', async (channel, tags, message, self) => {
	const give = Giveaway.get(channel);
	
	if(give && give.start){
		give.socket.emit('chat', { user: tags['display-name'], content: message });
	}
	
	if(!message.toLowerCase().startsWith(config.prefix)) return;
	//if(self && !message.toLowerCase().startsWith(config.prefix)) return;
	
	const args = message.toLowerCase().slice(config.prefix.length).split(/ +/);
	const command = args.shift().toLowerCase();
	
	if(give && command === give.name && give.start){
		if(isMatch(channel, tags.username)){
			client.say(channel, `@${tags['display-name']}, You already in Giveaway: ${give.name}`);
		} else { 
			give.users.push({
				username: tags.username,
				name: tags['display-name'],
				message: args ? args[0] : ""
			})
			give.socket.emit('info', { type: "newUser", value: tags['display-name'] });
			client.say(channel, `@${tags['display-name']}, You in Giveaway: ${give.name}`);
		}
	} else {
		const info = await Commands.findOne({ id: channel.split('#')[1], name: command }) || null;
		if(!info) return client.say(channel, `@${tags['display-name']}, ${config.error.notfound}`);
		if(info.response.indexOf('@user@') >= 0){
			info.response = info.response.replace('@user@', tags['display-name']);
		}
		client.say(channel, info.response);
	}
});

io.on('connection', (socket) => {
  console.log('user connected');
  socket.on('command', (cmd) => {
	switch(cmd.type){
		case "newGiveaway":
		    Giveaway.set(cmd.channel, { start: true, name: cmd.keyword.toLowerCase(), users: [], socket: socket});
			client.say(cmd.channel, `New Giveaway is Start use: !${cmd.keyword.toLowerCase()} <and you message> to join`);
		break;
		case "stopGiveaway":
		    client.say(cmd.channel, `Giveaway: ${Giveaway.get(cmd.channel).name} is end!!`);
		    Giveaway.delete(cmd.channel);
		break;
		case "getResult":
		    const give = Giveaway.get(cmd.channel);
			give.start=false;
			const user = getUser(give.users);
			if(!user) return;
			if(user && !give.start){
				socket.emit('info', { type: "winnerMessage", message: user.message})
				socket.emit('info', { type: "result", value: user.name })
				client.say(cmd.channel, `@${user.name}, You WIN Giveaway: ${give.name}`);
			}
		break;
		default:
	}
  });
  socket.on('disconnect', () => {
    console.log('user disconnected');
  });
});

 mongoose.connect(config.mongodb, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    }).then(() => {
        console.log('Connected to MongoDB');
		server.listen(config.port, ()=>{
			console.log(`Server is listening on port ${config.port}`);
			client.connect();
		});
    }).catch((err) => {
        console.log('Unable to connect to MongoDB Database.\nError: ' + err)
    })