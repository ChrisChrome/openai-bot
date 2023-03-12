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
	intents: ["MessageContent", "GuildMessages", "Guilds", "DirectMessages"]
});


const resetSession = async (id) => {
	if (timers[id]) {
		await clearTimeout(timers[id]);
		delete timers[id];
	};
	await delete sessions[id];
	return true;
}

client.on("ready", async () => {
	console.log(`${colors.cyan("[INFO]")} Logged in as ${colors.green(client.user.tag)}`)
	// Log startup time in seconds
	console.log(`${colors.cyan("[INFO]")} Startup took ${colors.green((Date.now() - initTime) / 1000)} seconds.`)
	// Load Commands
	console.log(`${colors.cyan("[INFO]")} Loading Commands...`)
	const commands = require('./commands.json');
	await (async () => {
		try {
			console.log(`${colors.cyan("[INFO]")} Registering Commands...`)
			let start = Date.now()
			// For every guild
			for (const guild of client.guilds.cache.values()) {
				let gStart = Date.now();
				console.log(`${colors.cyan("[INFO]")} Registering Commands for ${colors.green(guild.name)}...`);
				// Register commands
				await rest.put(
					Routes.applicationGuildCommands(client.user.id, guild.id), {
						body: commands
					},
				);
				console.log(`${colors.cyan("[INFO]")} Successfully registered commands for ${colors.green(guild.name)}. Took ${colors.green((Date.now() - gStart) / 1000)} seconds.`);
			};
			// Register global commands
			console.log(`${colors.cyan("[INFO]")} Registering Global Commands...`);
			await rest.put(
				Routes.applicationCommands(client.user.id), {
					body: commands
				},
			);
			console.log(`${colors.cyan("[INFO]")} Successfully registered commands. Took ${colors.green((Date.now() - start) / 1000)} seconds.`);
		} catch (error) {
			console.error(error);
		}
	})();

	// Automatically leave servers that aren't in the authorized channels list
	await (async () => {
		let m = false;
		await client.guilds.cache.forEach((guild) => {
			if (!config.discord.authorized_guilds.includes(guild.id)) {
				if (!m) {
					console.log(`${colors.cyan("[INFO]")} Leaving unauthorized guilds...`);
					m = true;
				}
				guild.leave();
				console.log(`${colors.cyan("[INFO]")} Left ${colors.green(guild.name)}`)
			}
		});
		if (!m) console.log(`${colors.cyan("[INFO]")} No unauthorized guilds to leave.`);
	})();

});

client.on('interactionCreate', async (interaction) => {
	if (!interaction.isCommand()) return;
	if (interaction.guild !== null) {
		if ((!config.discord.authorized_channels.includes(interaction.channelId) && !config.discord.authorized_channels.includes(interaction.channel.parentId))) return interaction.reply({
			ephemeral: true,
			content: lang.noauth
		}); // Only allow messages in the authorized channels
	}
	switch (interaction.commandName) {
		case "reset":
			// Remove the session
			if (!sessions[interaction.channelId]) return interaction.reply({
				ephemeral: true,
				content: lang.empty
			});
			if (!sessions[interaction.channelId].processing) {
				await resetSession(interaction.channelId);
				interaction.reply(lang.reset);
			} else {
				interaction.reply({
					content: lang.busy,
					ephemeral: true
				});
			}
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
	if (message.author.bot) return;
	if (message.guild !== null) {
		if ((!config.discord.authorized_channels.includes(message.channelId) && !config.discord.authorized_channels.includes(message.channel.parentId))) return; // Only allow messages in the authorized channels
	}
	if (message.content.startsWith("!!")) return; // So you can chat without the bot replying
	// If the session doesn't exist, create it
	if (!sessions[message.channelId]) {
		sessions[message.channelId] = {
			messages: [basePrompt],
			started: new Date(),
		};
	}
	// If the session already exists, reset the timer
	if (timers[message.channelId]) {
		await clearTimeout(timers[message.channelId]);
		delete timers[message.channelId];
	}
	// If the session is processing, don't do anything
	if (sessions[message.channelId].processing) {
		// if the bot has perms attempt to delete the message
		if ((await message.guild.members.fetchMe()).permissions.has("ManageMessages")) message.delete();
		return message.author.send(lang.busy).then((msg) => {
			setTimeout(() => {
				msg.delete();
			}, 10000);
		});
	}
	// Set the timer
	message.channel.sendTyping();
	var typing = setInterval(() => {
		message.channel.sendTyping();
	}, 5000)
	// Set processing to true
	sessions[message.channelId].processing = true;
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
		if (output.content.endsWith("!!!TERM1234!!!")) { // This can allow a self-termination command
			console.log(`${colors.cyan("[INFO]")} Self termination command detected in ${colors.green(message.channel.name)} (${colors.green(message.channelId)}): ${colors.green(output.content)}`)
			output.content = output.content.replace("!!!TERM1234!!!", "");
			clearInterval(typing);
			if (output.content.length != 0) message.channel.send(output.content);
			resetSession(message.channelId);
			return message.channel.send(lang.terminated);
		}
		// Add the bot's response to the session
		sessions[message.channelId].messages.push(output);
		// Send the bot's response
		clearInterval(typing);
		// If output.content is longer than 2000 characters, upload it as a txt file
		if (output.content.length > 2000) {
			message.channel.send({
				files: [{
					attachment: Buffer.from(output.content),
					name: "output.txt"
				}]
			});
		} else {
			message.channel.send(output.content);
		}
		sessions[message.channelId].processing = false;
		// Set the reset timer
		timers[message.channelId] = setTimeout(() => {
			resetSession(message.channelId);
			return message.channel.send(lang.timeout)
		}, config.openai.resetTime);
	}).catch((err) => {
		return message.channel.send({
			"embeds": [{
				"title": "Error",
				"description": err,
				"color": 0xFF0000
			}]
		})
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

var sessions = {}; // Keep track of sessions, not really used right now, but if I wanted to allow multiple sessions, I could
var timers = {}; // Keep track of reset timers
var basePrompt = config.openai.basePrompt
// If modPrompt.txt exists, use that instead of basePrompt.txt
if (fs.existsSync(path.join(__dirname, "modPrompt.txt"))) {
	console.log(`${colors.cyan("[INFO]")} Using Custom Prompt.`);
	basePrompt.content = fs.readFileSync("./modPrompt.txt", "utf8").toString();
} else {
	console.log(`${colors.cyan("[INFO]")} Using Default Prompt.`);
	basePrompt.content = fs.readFileSync("./basePrompt.txt", "utf8").toString();
}

// Handle SIGINT gracefully
process.on('SIGINT', async () => {
	await console.log(`${colors.cyan("[INFO]")} Stop received, exiting...`);
	await client.user.setPresence({
		status: "invisible",
		activities: []
	});
	await client.destroy();
	await console.log(`${colors.cyan("[INFO]")} Goodbye!`);
	process.exit(0);
});


console.log(`${colors.cyan("[INFO]")} Starting...`)
// Start timer to see how long startup takes
const initTime = Date.now()
// Login to Discord
client.login(config.discord.token);