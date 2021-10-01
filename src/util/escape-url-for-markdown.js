// Prevent any parentheses from causing the markdown URL format of "[text](link)" to mess up
const escapeUrlForMarkdown = url => {
	return url.replace(/[()]/g, c => '%' + c.charCodeAt(0).toString(16));
};

module.exports = escapeUrlForMarkdown;
