const config = require("./config.json");
const lang = require("./lang.json");
const {
	Configuration,
	OpenAIApi
} = require("openai");
const openai = new OpenAIApi(new Configuration({
	apiKey: config.openai.key
}));
const Discord = require("discord.js");
const {
	REST,
	Routes
} = require('discord.js');
const rest = new REST({
	version: '10'
}).setToken(config.discord.token);
const fs = require("fs");
const path = require("path");
const colors = require("colors");

// Create a new Discord client
const client = new Discord.Client({
	intents: ["MessageContent", "GuildMessages", "Guilds"]
});
var sessions = {}; // Keep track of sessions, not really used right now, but if I wanted to allow multiple sessions, I could
client.on("ready", () => {
	console.log(`${colors.cyan("[INFO]")} Logged in as ${colors.green(client.user.tag)}`)
	// Log startup time in seconds
	console.log(`${colors.cyan("[INFO]")} Startup took ${colors.green((Date.now() - initTime) / 1000)} seconds.`)
	// Load Commands
	console.log(`${colors.cyan("[INFO]")} Loading Commands...`)
	const commands = require('./commands.json');
	(async () => {
		try {
			console.log(`${colors.cyan("[INFO]")} Registering Commands...`)
			let start = Date.now()
			// For every guild
			for (const guild of client.guilds.cache.values()) {
				// Register commands
				await rest.put(
					Routes.applicationGuildCommands(client.user.id, guild.id), {
						body: commands
					},
				);
			}
			console.log(`${colors.cyan("[INFO]")} Successfully registered commands. Took ${colors.green((Date.now() - start) / 1000)} seconds.`);
		} catch (error) {
			console.error(error);
		}
	})();
});

client.on('interactionCreate', async (interaction) => {
	if (!interaction.isCommand()) return;
	switch(interaction.commandName) {
		case "reset": 
			// Reset the session
			sessions[interaction.channelId] = {messages: []};
			interaction.reply(lang.reset);
			break;
	}
});

client.on('messageCreate', async (message) => {
	if(!message.channelId == config.discord.channel) return;
	if(message.author.bot) return;
	if(message.content.startsWith("!!")) return; // So you can chat without the bot replying
	// If the session doesn't exist, create it
	if (!sessions[message.channelId]) {
		sessions[message.channelId] = {
			messages: [],
			// 10 minute auto reset
			autoReset: setTimeout(() => {
				sessions[message.channelId] = {messages: []};
				message.channel.send(lang.timeout)
			}, config.openai.resetTime)
		};
	} else {
		// Reset the auto reset timer
		clearTimeout(sessions[message.channelId].autoReset);
		sessions[message.channelId].autoReset = setTimeout(() => {
			sessions[message.channelId] = {messages: []};
			message.channel.send(lang.timeout)
		}, config.openai.resetTime);
	}
	message.channel.sendTyping();
	// Add the message to the session
	sessions[message.channelId].messages.push({
		"name": "User",
		"content": message.content,
		"role": "user"
	});
	// Send the message to OpenAI
	await openai.createChatCompletion({
		model: "gpt-3.5-turbo",
		messages: sessions[message.channelId].messages
	}).then((data) => {
		output = data.data.choices[0].message;
		output.name = "Bot";
		// Add the bot's response to the session
		sessions[message.channelId].messages.push(output);
		// Send the bot's response
		message.channel.send(output.content);
	});
});

// Init
console.log(`${colors.cyan("[INFO]")} Starting...`)
// Start timer to see how long startup takes
const initTime = Date.now()
// Login to Discord
client.login(config.discord.token);