'use strict';

const commands = [];

function cmd(info, fn) {
    if (!info.pattern) return;
    commands.push({
        pattern:   info.pattern,
        alias:     info.alias    || [],
        desc:      info.desc     || '',
        category:  info.category || 'misc',
        react:     info.react    || '',
        isOwner:   info.isOwner  || false,
        isGroup:   info.isGroup  || false,
        isPrivate: info.isPrivate|| false,
        function:  fn
    });
}

function findCmd(name) {
    return commands.find(c =>
        c.pattern === name || c.alias.includes(name)
    ) || null;
}

function allCmds() { return commands; }

module.exports = { cmd, findCmd, allCmds };
