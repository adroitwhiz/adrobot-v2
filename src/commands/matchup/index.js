const fs = require('fs').promises;
const path = require('path');
const {MessageEmbed} = require('discord.js');
const {SlashCommandBuilder} = require('@discordjs/builders');

const escapeUrlForMarkdown = require('../../util/escape-url-for-markdown');

const getRandomItem = arr => {
	return arr[Math.floor(Math.random() * arr.length)];
};

const shuffleArray = array => {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const temp = array[i];
		array[i] = array[j];
		array[j] = temp;
	}
	return array;
};

const articleLink = character => `[${character.fictional_characterLabel}](${escapeUrlForMarkdown(character.article)})`;

const generateMatchupObject = (characters, series, members) => {
	let chosenCharacters = [];
	for (let i = 0; i < 2; i++) {
		chosenCharacters.push(getRandomItem(characters));
	}

	// Battle royale
	if (Math.random() < 0.05) {
		for (let i = 0; i < Math.floor(Math.random() * 7) + 1; i++) {
			chosenCharacters.push(getRandomItem(characters));
		}
	}

	const chosenMembers = members.slice(0);
	shuffleArray(chosenMembers);

	let castings = [];

	for (let i = 0; i < chosenCharacters.length; i++) {
		castings.push({
			'rapper': chosenMembers[i],
			'character': articleLink(chosenCharacters[i])
		});
	}

	const seasonString = Math.random() < 0.5 ? 'Season ' + (Math.floor(Math.random() * 4) + 1) : '';

	return {
		'title': `**${chosenCharacters[0].fictional_characterLabel} vs ${chosenCharacters[1].fictional_characterLabel}**`,
		'series': `${series} ${seasonString}`,
		'castings': castings
	};
};

const renderMatchupEmbed = matchup => {
	const embed = {
		'title': matchup.title,
		'description': matchup.series,
		'fields': []
	};

	for (let casting of matchup.castings) {
		embed.fields.push({
			'name': `${casting.rapper}`,
			'value': `as ${casting.character}`,
			'inline': true
		});
	}

	return new MessageEmbed(embed);
};

const adjectives = ['Crazy', 'Wicked', 'Epic', 'Radical', 'Insane', 'Poggers', 'Cool', 'Unfathomable', 'Astounding', 'Neato', 'Uber'];
const rap = ['Lyrical', 'Rap', 'Hip-Hop', 'Diss', 'Spit Barz', 'Rhyme'];
const battle = ['Wars', 'Clashes', 'Battles', 'Conflicts', 'Skirmishes', 'Altercations'];
const ofWhat = ['Steven Universe', 'Fiction', 'Vivziepop', 'The Community', 'Reality', 'The Universe', 'Literature', 'Television', 'Video Games', 'Internet History', 'Environmental Science', 'Anime'];

const sample = arr => arr[Math.floor(Math.random() * arr.length)];

const randomSeriesName = () => sample([
	() => `${sample(adjectives)} ${sample(rap)} ${sample(battle)} of ${sample(ofWhat)}`,
	() => `${sample(adjectives)} ${sample(rap)} ${sample(battle)}`,
	() => `${sample(adjectives)} ${sample(rap)} ${sample(battle)}: ${sample(ofWhat)} vs Anything`
])();

module.exports = {
	data: new SlashCommandBuilder()
		.setName('matchup')
		.setDescription('Generates a random rap battle matchup'),

	init: async () => {
		const characters = JSON.parse(await fs.readFile(path.join(__dirname, 'data', 'characters.json'), {encoding: 'utf-8'}));
		const communityMembers = JSON.parse(await fs.readFile(path.resolve(__dirname, '../../../', 'community-members.json'), {encoding: 'utf-8'}));

		return interaction => {
			const matchup = generateMatchupObject(characters, randomSeriesName(), communityMembers);
			return interaction.reply({embeds: [renderMatchupEmbed(matchup)]});
		};
	},

	commonData: {communityMembers: 'community-members.json'}
};
