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
var basePrompt = config.openai.basePrompt
basePrompt.content = fs.readFileSync("./basePrompt.txt", "utf8").toString();

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
	if (!config.discord.authorized_channels.includes(interaction.channelId)) return; // Only allow messages in the authorized channels
	switch (interaction.commandName) {
		case "reset":
			// Remove the session
			await delete sessions[interaction.channelId];
			interaction.reply(lang.reset);
			break;
		case "info": // Info about the current session
			// If the session is empty other than the base prompt, say so
			if (!sessions[interaction.channelId]) return interaction.reply({
				ephemeral: true,
				content: lang.empty
			});
			if (sessions[interaction.channelId].messages.length == 1) {
				return interaction.reply({
					ephemeral: true,
					content: lang.empty
				});
			} else {
				// Otherwise, give some info like message count for both the user and the bot, and total message count
				var userCount = 0;
				var botCount = 0;
				// Await counting the messages
				await sessions[interaction.channelId].messages.forEach((message) => {
					// Ignore the base prompt
					if (message.content == basePrompt) return;
					if (message.role == "user") {
						userCount++;
					} else if (message.role == "assistant") {
						botCount++;
					}
				});
				interaction.reply({
					embeds: [{
						title: lang.info,
						description: lang.infoDesc.replace("{userCount}", userCount).replace("{botCount}", botCount).replace("{total}", userCount + botCount),
						color: 0x00FFFF,
						
						// This is broken, I don't know why, 
						footer: {
							text: lang.infoFooter
						},
						timestamp: sessions[interaction.channelId].started
						
					}]
				});
			}
			break;
	}
});

client.on('messageCreate', async (message) => {
	if (!config.discord.authorized_channels.includes(message.channelId)) return; // Only allow messages in the authorized channels
	if (message.author.bot) return;
	if (message.content.startsWith("!!")) return; // So you can chat without the bot replying
	// If the session doesn't exist, create it
	if (!sessions[message.channelId]) {
		sessions[message.channelId] = {
			messages: [basePrompt],
			started: new Date(),
		};
	}
	var typing = setInterval(() => {
		message.channel.sendTyping();
	}, 1000)
	// Add the message to the session
	sessions[message.channelId].messages.push({
		"name": `${message.author.id}`,
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
		clearInterval(typing);
		message.reply(output.content);
	});
});

console.log(`╔═══╗╔═══╗╔════╗╔══╗      ╔╗     
║╔═╗║║╔═╗║║╔╗╔╗║║╔╗║     ╔╝╚╗    
║║ ╚╝║╚═╝║╚╝║║╚╝║╚╝╚╗╔══╗╚╗╔╝    
║║╔═╗║╔══╝  ║║  ║╔═╗║║╔╗║ ║║     
║╚╩═║║║    ╔╝╚╗ ║╚═╝║║╚╝║ ║╚╗    
╚═══╝╚╝    ╚══╝ ╚═══╝╚══╝ ╚═╝    
                                 
                                 
`)
// Init
console.log(`${colors.cyan("[INFO]")} Starting...`)
// Start timer to see how long startup takes
const initTime = Date.now()
// Login to Discord
client.login(config.discord.token);