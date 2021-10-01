const {Client, Intents} = require('discord.js');
const {REST} = require('@discordjs/rest');
const {Routes} = require('discord-api-types/v9');
const fs = require('fs').promises;
const path = require('path');

require('dotenv').config();

const loadCommands = async () => {
	const commandData = [];
	const commandFunctions = {};
	const commandPromises = [];
	const commandFolders = await fs.readdir(path.join(__dirname, 'commands'));
	for (const folder of commandFolders) {
		const command = require(path.join(__dirname, 'commands', folder, 'index.js'));
		commandPromises.push(
			Promise.resolve(command.init())
				.then(func => {
					console.log(`Successfully loaded command ${folder}`);
					commandData.push(command.data);
					commandFunctions[folder] = func;
				})
				.catch(err => {
					console.error(`Failed to load command ${folder}: ${err.message}`);
				})
		);
	}
	await Promise.all(commandPromises);
	return {commandData, commandFunctions};
};

const rest = new REST({ version: '9' }).setToken(process.env.TOKEN);

(async () => {
	const {commandData, commandFunctions} = await loadCommands();

	try {
		console.log(`Started refreshing ${process.env.COMMAND_MODE} (/) commands.`);

		let route = process.env.COMMAND_MODE === 'global' ?
			Routes.applicationCommands(process.env.CLIENT_ID) :
			Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID);

		await rest.put(
			route,
			{body: commandData},
		);

		console.log(`Successfully reloaded ${process.env.COMMAND_MODE} (/) commands.`);
	} catch (error) {
		console.error(error);
	}


	const client = new Client({intents: [Intents.FLAGS.GUILDS]});

	client.once('ready', () => {
		console.log('Client ready');
	});

	client.on('interactionCreate', async interaction => {
		if (!interaction.isCommand()) return;

		const {commandName} = interaction;

		if (Object.prototype.hasOwnProperty.call(commandFunctions, commandName)) {
			commandFunctions[commandName](interaction);
		}
	});

	client.login(process.env.TOKEN);
})();
