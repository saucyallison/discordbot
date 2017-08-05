"use strict";

const Discord = require('discord.js');
const client = new Discord.Client();

const TOKEN = process.env.DISCORD_TOKEN;
const BOT_CHANNEL = "professor-willow" // restrict bot usage to this channel

// Load raw data
var fs = require('fs');
var counters = JSON.parse(fs.readFileSync("counters.json"));
var cp = JSON.parse(fs.readFileSync("cp.json"));
var emoji = JSON.parse(fs.readFileSync("emoji.json"));
var levelToCPM = JSON.parse(fs.readFileSync("levelToCPM.json"));
var pokemon = JSON.parse(fs.readFileSync("pokemon.json"));
var moves = JSON.parse(fs.readFileSync("moves.json"));
var types = JSON.parse(fs.readFileSync("types.json"));

// ** Helper functions: **
// Capitalizes the first word of input, for display purposes
String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}

function standardizePokeName(name) {
    name = name.toLowerCase();
    if (name == "hooh") {
        name = "ho-oh";
    }
    return name;
}

function appropriateChannel(message) {
    if (message.channel.name != BOT_CHANNEL) {
        message.reply("Please use this command in "+BOT_CHANNEL+" instead, thanks!");
        return false;
    }
    return true;
}

function getEmoji(name) {
    if (name == 'ho-oh') {
        name = "hooh"; // special case for ho-oh
    }
    var emojiStr = "";
    try {
        emojiStr = emoji[name];
    }
    catch(e) {
        return ""; // no emoji for this pokemon, don't print anything
    }
    return emojiStr + " "; // add a space to keep things lookin' good
}

function formatList(list, separator=",") {
    var listStr = "";
    for (var i=0; i<list.length; i++) {
        listStr = listStr + list[i] + separator + " "
    }
    return listStr.slice(0, (-1 * separator.length) - 1);
}

// Returns a String list of recommended counters for the given Pokemon
function getCounters(name) {
    var counterHash = counters[name];
    if (counterHash == null || Object.keys(counterHash).length == 0) {
        return "Sorry, counters for "+name.capitalize()+" aren't available at this time";
    }
    var reply = "";
    for (var counter in counterHash) {
        // Underline when the counter Pokemon have movesets listed
        var u = "";
        if (Object.keys(counterHash[counter]).length > 0) {
            var isLegendary = true; // For now, having a hash bigger than 0 means it's legendary. No movesets for regular raid bosses yet
            u = "__";
            if ("stats" in counterHash) { // this is the updated format for Lugia only right now
                reply = "**" + name.capitalize() + "** " + getEmoji(name) + " ";
                // stats
                for (var stat in counterHash["stats"]) {
                    reply = reply + stat + " **" + counterHash["stats"][stat] + "** | "
                }
                reply = reply.slice(0, -2) + "\n";
                // fast moves
                reply = reply + "[ " + formatList(counterHash["fast"], " /") + " -- ";
                // charge moves
                reply = reply + formatList(counterHash["charge"], " /") + " ]\n\n";
                // weaknesses
                reply = reply + "*Weaknesses*: " + formatList(counterHash["weaknesses"]) + "\n";
                // resistances
                reply = reply + "*Resistances*: " + formatList(counterHash["resistances"]) + "\n\n";
                // counters
                for (var counterType in counterHash["counters"]) {
                    reply = reply + "**" + counterType + " Counters**\n";
                    for (var pkmnName in counterHash["counters"][counterType]) {
                        for (var i=0; i<counterHash["counters"][counterType][pkmnName].length; i++) {
                            reply = reply + "- __" + pkmnName.capitalize() + "__: " + counterHash["counters"][counterType][pkmnName][i] + "\n";
                        }
                    }
                    reply = reply + "\n";
                }
                return reply;
            }
        }
        reply = reply + "\n" + u + counter.capitalize() + u;
        for (var i=0; i<counterHash[counter].length; i++) {
            if (i == 0) reply = reply + "\n"; // add a newline between 
            reply = reply + "- "+counterHash[counter][i]+"\n";
        }
    }

    reply = "Counters for **" + name.capitalize() + "** " + getEmoji(name) +"\n" + reply;
    return reply;
}

// Returns the minimum/maximum CP for encounters with the given Pokemon after a raid
function getCP(name) {
    // Check if Pokemon is valid
    try {
        var row = cp[name];
        if (row == null || row == undefined) throw Exception;
    } catch(e) {
        return "Sorry, CP for " + name.capitalize() + " isn't available at this time";
    }
    return "**"+name.capitalize()+"** "+getEmoji(name)+"Raid CP @ Lv20: [min: **"+row["min"]+"**, max: **"+row["max"]+"**]";
}

// ===========================================================================
//   Damage formula helper functions
// ===========================================================================
function roundTo(num, digits) {
    return +(Math.round(num + "e+"+digits)  + "e-"+digits);
}

function getDamage(attacker, iv, move, defender, level) {
    attacker = attacker.toUpperCase();
    move = move.toUpperCase();
    defender = defender.toUpperCase();
    var power = getPower(move);
    var attack = getBaseStat(attacker, "attack");
    var attackIV = iv;
    var attackerCPM = getCPM(level);
    var defense = getBaseStat(defender, "defense");
    var defenseIV = 15;
    var defenderCPM = getCPM(40);
    var STAB = getSTAB(move, attacker);
    var effectiveness = getEffectiveness(move, defender)
    return Math.floor(0.5 * power * ((attack+attackIV) * attackerCPM) / ((defense+defenseIV) * defenderCPM) * STAB * effectiveness) + 1;
}

function getPower(move) {
    return moves[move]["power"];
}

function getBaseStat(name, stat) {
    return pokemon[name]["stats"][stat];
}

function getCPM(level) {
    return roundTo(levelToCPM[level.toString()], 3);
}

function getSTAB(move, attacker) {
    var type = moves[move]["type"];
    if (pokemon[attacker]["types"].indexOf(type) >= 0) {
        return 1.2;
    }
    return 1.0;
}

function getEffectiveness(move, defender) {
    var moveInfo = moves[move];
    var moveType = moveInfo["type"];
    var defenderInfo = pokemon[defender];
    var defenderTypes = defenderInfo["types"];
    var multiplier = 1.0;
    for (var i=0; i<defenderTypes.length; i++) {
        var defenderType = defenderTypes[i];
        // check if it's not very effective
        if (types[moveType]["nve"].indexOf(defenderType) >= 0) {
            multiplier *= 0.714;
        }
        // check if it's super effective
        if (types[moveType]["se"].indexOf(defenderType) >= 0) {
            multiplier *= 1.4;
        }
    }
    return multiplier;
}

function getBreakpoint(attacker, move, iv, defender) {
    attacker = attacker.toUpperCase();
    move = move.toUpperCase();
    iv = parseInt(iv);
    var pokeInfo = pokemon[attacker];
    var moveInfo = moves[move];
    // list of bosses will either be what the user specified, or we find some
    var bosses = (defender == null) ? getBosses(attacker) : [defender];
    // TODO: if none found, find one that attacker is decent against.
     // for now, we'll just assume.. mewtwo
    if (bosses.length == 0) {
      bosses = ['mewtwo']
    }
    var reply = "";
    var breakpoints = {};
    for (var index in bosses) {
        var defender = bosses[index];
        breakpoints[defender] = {}
        reply += move.replace("_", " ")+" damage against "+defender.capitalize()+"\n"
        var currentMaxDamage = getDamage(attacker, iv, move, defender, 20);
        breakpoints[defender][20] = currentMaxDamage;
        for (var level=20; level<40; level+=0.5) {
            var damage = getDamage(attacker.toUpperCase(), iv, move, defender.toUpperCase(), level);
            if (damage > currentMaxDamage) {
                breakpoints[defender][level] = damage;
                currentMaxDamage = damage;
            }
        }
        var sortedKeys = Object.keys(breakpoints[defender]).sort();
        for (var i=0; i<sortedKeys.length; i++) {
            var level = parseFloat(sortedKeys[i]);
            var damage = breakpoints[defender][level];
            var separator = (level % 1 == 0) ? ":   " : ": "; // add nice spacing for levels with .5
            reply += "Lv"+level+separator+breakpoints[defender][level];
            var percent = "";
            if (i > 0) {
                // add a % increase calculation
                var prevLevel = parseFloat(sortedKeys[i-1]);
                percent = roundTo((1.0 * breakpoints[defender][level] / breakpoints[defender][prevLevel] - 1) * 100.0, 2);
                reply += " (+"+percent+"%)"
            }
            reply += "\n";
        }
        if (Object.keys(breakpoints[defender]).indexOf(39.5) == -1) {
            reply = reply + "Lv39.5: "+getDamage(attacker, iv, move, defender, level);
        }
        reply += "\n";
    }
    return "```"+reply+"```";
}

function getBosses(attacker) {
    var bosses = [];
    for (var boss in counters) {
        if (Object.keys(counters[boss]).indexOf(attacker.toLowerCase()) >= 0) {
            bosses.push(boss);
        }
    }
    return bosses.slice(Math.max(bosses.length - 3, 1)); // return last 3 elements
}

// Bot setup
client.on('ready', () => {
  console.log('Ready to rock!');
});

client.on('message', message => {
    try {
        if (message.content.toLowerCase().lastIndexOf('!cp', 0) === 0) {
            if (!appropriateChannel(message)) {
                return;
            }
            var name = standardizePokeName(message.content.split(" ")[1]);
            var reply = getCP(name);
            message.channel.send(reply);
        }

        if (message.content.toLowerCase().lastIndexOf('!counter', 0) === 0) {
            if (!appropriateChannel(message)) {
                return;
            }
            var name = standardizePokeName(message.content.split(" ")[1]);
            var reply = getCounters(name);
            message.channel.send(reply);
        }

        if (message.content.toLowerCase().lastIndexOf('!break', 0) === 0) {
            if (!appropriateChannel(message)) {
                return;
            }
            var usage = "Command usage: `!breakpoint attacker attack_name iv (optional: defender)`";
            var msgSplit = message.content.toLowerCase().split(" ");
            if (msgSplit.length < 4) {
                message.channel.send("Sorry, incorrect format.\n"+usage);
                return;
            }
            var attacker = standardizePokeName(msgSplit[1]);
            var move = msgSplit[2];
            var iv = msgSplit[3]; // check for int 0-15
            if (isNaN(iv)) {
                message.channel.send("Sorry, IV must be 0-15.\n"+usage);
                return;
            }
            var defender = null; // specifying defender is optional
            if (msgSplit.length >= 5) {
                defender = standardizePokeName(msgSplit[4]);
            }
            var reply = getBreakpoint(attacker, move, iv, defender);
            message.channel.send(reply);
        }
    } catch(e) {
            message.channel.send("error. bot is sorry");
            console.log(e);
            return;
    }
});

client.login(TOKEN);
