const fs = require('fs').promises;
const path = require('path');
const Fuse = require('fuse.js');
const {MessageEmbed} = require('discord.js');
const {SlashCommandBuilder} = require('@discordjs/builders');

const escapeUrlForMarkdown = require('../../util/escape-url-for-markdown');

// Shamelessly yanked from StackOverflow: https://stackoverflow.com/a/19270021
const getRandom = (arr, n) => {
	const result = new Array(n);
	let len = arr.length;
	const taken = new Array(len);
	if (n > len)
		throw new RangeError('getRandom: more elements taken than available');
	while (n--) {
		const x = Math.floor(Math.random() * len);
		result[n] = arr[x in taken ? taken[x] : x];
		taken[x] = --len in taken ? taken[len] : len;
	}
	return result;
};

const escapeMarkdown = text => {
	const unescaped = text.replace(/\\(\*|_|`|~|\\)/g, '$1'); // unescape any "backslashed" character
	const escaped = unescaped.replace(/(\*|_|`|~|\\)/g, '\\$1'); // escape *, _, `, ~, \
	return escaped;
};

const filterByAnyKeySubstring = (array, prop, keys) => {
	return array.filter(item => {
		for (const filterKey of keys) {
			if (item[prop] && item[prop].findIndex(itemKey => itemKey.toLowerCase().includes(filterKey)) !== -1) {
				return true;
			}
		}
		return false;
	});
};

const MAX_BEATS = 10;

module.exports = {
	data: new SlashCommandBuilder()
		.setName('beat')
		.setDescription('Serves up a funky fresh beat')
		.addStringOption(option => option.setName('name').setDescription('Name of the beat you\'re looking for.'))
		.addStringOption(option => option.setName('exact-name').setDescription('Name of the beat you\'re looking for, exactly as typed (no "fuzzy" matching).'))
		.addStringOption(option => option.setName('name-contains').setDescription('Filter by beats whose names include this text somewhere'))
		.addStringOption(option => option.setName('producers').setDescription('Beat producer(s) to filter by, separated with commas.'))
		.addStringOption(option => option.setName('genres').setDescription('Genre(s) to filter by, separated with commas. Displays beats with at least one matching genre.'))
		.addStringOption(option => option.setName('bpm').setDescription('Tempo (in beats per minute) of the beat you want. This can be a number or a range (e.g. "80-90").'))
		.addBooleanOption(option => option.setName('purchasable').setDescription('Filter out beats that\'ve definitely been sold. Doesn\'t guarantee that returned beats can be bought.'))
		.addBooleanOption(option => option.setName('every').setDescription('Return every beat (up to a limit) matching your filter(s), instead of just one.'))
		.addIntegerOption(option => option.setName('num').setDescription('Return this many matching beats.'))
		.addStringOption(option => option.setName('url').setDescription('Filter beats whose audio file links contain this text.')),

	init: async () => {
		const beats = JSON.parse(await fs.readFile(path.join(__dirname, 'beats.json'), {encoding: 'utf-8'}));
		const fuse = new Fuse(beats, {
			shouldSort: true,
			keys: [
				'name'
			],
			maxPatternLength: 32
		});

		return interaction => {
			const {options} = interaction;

			let matchingBeats;
			let shouldRandomize = true;

			// Mutually exclusive filtering functions.
			// TODO: error if you try to use more than one at a time.
			if (options.get('exact-name')) {
				const exactName = options.getString('exact-name').toLowerCase();
				matchingBeats = beats.filter(beat => beat.name.toLowerCase() === exactName);
			} else if (options.get('name-contains')) {
				const substring = options.getString('name-contains').toLowerCase();
				matchingBeats = beats.filter(beat => beat.name.toLowerCase().includes(substring));
			} else if (options.get('name')) {
				matchingBeats = fuse.search(options.getString('name'));
				shouldRandomize = false;
			} else if (options.get('url')) {
				const urlFragment = options.getString('url').toLowerCase();
				matchingBeats = beats.filter(beat => beat.fileUrl.toLowerCase().includes(urlFragment));
			} else {
				matchingBeats = Array.from(beats);
			}

			if (options.get('bpm')) {
				const bpmRange = options.getString('bpm').split(/[^\d]+/).map(n => parseFloat(n));
				if (bpmRange.length < 1 || bpmRange.length > 2 || bpmRange.some(bpm => Number.isNaN(bpm))) {
					return interaction.reply(`Invalid BPM argument "${options.getString('bpm')}"`);
				}
				if (bpmRange.length === 1) {
					// Single exact BPM
					const bpm = bpmRange[0];
					// a little room for error
					matchingBeats = matchingBeats.filter(beat => beat.bpm && Math.abs(bpm - beat.bpm) < 0.01);
				} else {
					// BPM range
					const bpmMin = Math.min(bpmRange[0], bpmRange[1]);
					const bpmMax = Math.max(bpmRange[0], bpmRange[1]);
					// a little room for error
					matchingBeats = matchingBeats.filter(beat =>
						beat.bpm > bpmMin - 0.01 && beat.bpm < bpmMax + 0.01);
				}
			}

			if (options.get('producers')) {
				const producersArg = options.getString('producers').toLowerCase().split(',').map(prodName => prodName.trim());

				matchingBeats = filterByAnyKeySubstring(matchingBeats, 'producers', producersArg);
			}

			if (options.get('genres')) {
				const genresArg = options.getString('genres').toLowerCase().split(',').map(name => name.trim());

				matchingBeats = filterByAnyKeySubstring(matchingBeats, 'genres', genresArg);
			}

			if (options.get('moods')) {
				const moodsArg = options.getString('moods').toLowerCase().split(',').map(name => name.trim());

				matchingBeats = filterByAnyKeySubstring(matchingBeats, 'moods', moodsArg);
			}

			if (options.getBoolean('purchasable')) {
				// use strict equals here in case availableForPurchase is undefined
				matchingBeats = matchingBeats.filter(beat => beat.availableForPurchase !== false);
			}

			if (matchingBeats.length === 0) {
				return interaction.reply('No matching beats found.');
			}

			let beatsToReturn;

			if (options.getBoolean('every')) {
				beatsToReturn = matchingBeats;
			} else if (options.get('num')) {
				const numBeats = options.getInteger('num');
				beatsToReturn = shouldRandomize ?
					getRandom(matchingBeats, Math.min(numBeats, matchingBeats.length)) :
					matchingBeats.slice(0, numBeats);
			} else {
				beatsToReturn = [
					shouldRandomize ?
						matchingBeats[Math.floor(Math.random() * matchingBeats.length)] :
						matchingBeats[0]
				];
			}

			if (beatsToReturn.length > MAX_BEATS) {
				return interaction.reply(`${beatsToReturn.length} beats found, but I can only display ${MAX_BEATS} at once.`);
			}

			const embeds = [];
			for (const beat of beatsToReturn) {
				const embed = {
					title: `**${escapeMarkdown(beat.name)}** by **${escapeMarkdown(beat.producers ? beat.producers.join(', ') : '???')}**`,
					fields: [
						{
							name: 'Audio file',
							value: `[Listen](${escapeUrlForMarkdown(beat.fileUrl)})`,
							inline: true
						},
						{
							name: 'Beat page',
							value: `[Visit](${escapeUrlForMarkdown(beat.pageUrl)})`,
							inline: true
						}
					]
				};

				if (beat.bpm) {
					embed.fields.push({
						name: 'BPM',
						value: beat.bpm.toString()
					});
				}

				if (beat.genres && beat.genres.length > 0) {
					embed.fields.push({
						name: 'Genres',
						value: beat.genres.join(', '),
						inline: true
					});
				}

				if (beat.moods && beat.moods.length > 0) {
					embed.fields.push({
						name: 'Moods',
						value: beat.moods.join(', '),
						inline: true
					});
				}

				if (beat.availableForPurchase === false) {
					embed.footer = {
						icon_url: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/2.2.5/36x36/26a0.png',
						text: 'This beat has been purchased. It may be unmonetizable.'
					};
				}

				embeds.push(new MessageEmbed(embed));
			}

			return interaction.reply({embeds});
		};
	}
};
