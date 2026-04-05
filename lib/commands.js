/**
 * NOVA-MD - Command Handler
 * Plugin system command register
 */

class CommandHandler {
    constructor() {
        this.commands = [];
    }

    addCommand(cmdInfo, cmdFunction) {
        if (!cmdInfo.pattern) {
            console.log('⚠️  Command pattern නැහැ!');
            return;
        }

        const command = {
            pattern:   cmdInfo.pattern,
            alias:     cmdInfo.alias    || [],
            desc:      cmdInfo.desc     || 'No description',
            category:  cmdInfo.category || 'misc',
            use:       cmdInfo.use      || cmdInfo.pattern,
            react:     cmdInfo.react    || '',
            filename:  cmdInfo.filename || 'Unknown',
            isOwner:   cmdInfo.isOwner  || false,
            isGroup:   cmdInfo.isGroup  || false,
            isPrivate: cmdInfo.isPrivate|| false,
            function:  cmdFunction
        };

        this.commands.push(command);
        return command;
    }

    findCommand(cmdName) {
        return this.commands.find(cmd =>
            cmd.pattern === cmdName ||
            (cmd.alias && cmd.alias.includes(cmdName))
        );
    }

    getCommands() {
        return this.commands;
    }

    getCommandsByCategory(category) {
        return this.commands.filter(cmd => cmd.category === category);
    }

    getCategories() {
        return [...new Set(this.commands.map(cmd => cmd.category))];
    }
}

// Global singleton
const handler = new CommandHandler();

function cmd(info, func) {
    return handler.addCommand(info, func);
}

module.exports = { cmd, handler };
