const config = require("./config.json");
const {
	Configuration,
	OpenAIApi
} = require("openai");
const openai = new OpenAIApi(new Configuration({
	apiKey: config.openai.key
}));

// Take user input via command line
const readline = require("readline").createInterface({
	input: process.stdin,
	output: process.stdout
});

sessions = {};

// Command line is session 0
sessions[0] = {
	messages: []
};

// The ask() function but as a promise
const askPromise = (prompt, session) => {
	return new Promise((resolve, reject) => {
		// If the session doesn't exist, create it
		if (!sessions[session]) {
			sessions[session] = {
				messages: []
				

// Ask the user for a prompt
const ask = () => {
	readline.question("What would you like to ask the bot? ", async (prompt) => {
		// Create a new session
		sessions[0].messages.push({
			role: "user",
			content: prompt
		});
		await openai.createChatCompletion({
			model: "gpt-3.5-turbo",
			messages: sessions[0].messages
		}).then((data) => {
			sessions[0].messages.push(data.data.choices[0].message);
			console.log(`${data.data.choices[0].message.role}: ${data.data.choices[0].message.content}`);
			ask();
		});
	});
};
ask();