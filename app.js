const path = require('path');
require('dotenv').config();

const { App } = require('@slack/bolt');

const slackApp = new App({
  socketMode: true,
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN
});

function logErr(msg) {
  console.error(new Date(), '\x1b[31m', 'Error:', '\x1b[0m');
  console.error(msg);
}

async function getChannelMembers(channel) {
  return slackApp.client.conversations.members({channel: channel});
}

async function sendMessage(channelOrUserId, msg) {
  return slackApp.client.chat.postMessage({channel: channelOrUserId, text: msg});
}

async function getReactions(channel, timestamp) {
  return slackApp.client.reactions.get({channel: channel, timestamp: timestamp});
}

async function getBotChannels() {
  return slackApp.client.users.conversations({types: 'public_channel, private_channel'});
}

async function getPermalink(channel, timestamp) {
  return slackApp.client.chat.getPermalink({channel: channel, message_ts: timestamp});
}

async function checkIfBotInChannel(channel, channelName, invoker) {
  let channels = await getBotChannels();
  channels = channels.channels.map((x) => x.id);
  if (channels.includes(channel)) {
    return true;
  } else {
    await sendMessage(invoker, `Please invite me to the channel the message is in first! To do so, open the channel, press the #${channelName} button at the top, press Integrations (Desktop) / Apps (Mobile), click the add button, and select C-3PO.`);
    return false;
  }
}

async function getNotReacted(reactions, channel) {
  if (reactions === undefined)
    var reactUsers = [];
  else
    var reactUsers = reactions.map((r) => r.users).flat(1);
  let uniqueReactUsers = [...new Set(reactUsers)];
  let channelMembers = (await getChannelMembers(channel)).members;
  return channelMembers.filter(x => !uniqueReactUsers.includes(x) && !process.env.EXCLUDE_IDS.includes(x));
}

async function remindDm(shortcut) {
  if (shortcut.channel === undefined || shortcut.message_ts === undefined) {
    await sendMessage(shortcut.user.id, 'You must use this shortcut on a message in some channel!');
    return;
  }

  let channel = shortcut.channel.id;
  let channelName = shortcut.channel.name;
  let messageTs = shortcut.message_ts;
  let invoker = shortcut.user.id;

  let channelCheck = await checkIfBotInChannel(channel, channelName, invoker);
  if (!channelCheck)
    return;
  
  let reactions = (await getReactions(channel, messageTs)).message.reactions;
  let notReacted = await getNotReacted(reactions, channel);
  let messageLink = (await getPermalink(channel, messageTs)).permalink;

  for (let userId of notReacted) {  
    await sendMessage(userId, `Excuse me! It appears you have not reacted to <${messageLink}|this message>!`);
  }

  if (notReacted.length > 0) {
    let formattedUsers = notReacted.map((id) => `<@${id}>`).join(', ');
    await sendMessage(invoker, `I have sent reminders to the following (${notReacted.length}) users: ${formattedUsers}.`);
  } else {
    await sendMessage(invoker, `Everybody has reacted to the message!`);
  }
}

async function listNotReacted(shortcut) {
  if (shortcut.channel === undefined || shortcut.message_ts === undefined) {
    await sendMessage(shortcut.user.id, 'You must use this shortcut on a message in some channel!');
    return;
  }

  let channel = shortcut.channel.id;
  let channelName = shortcut.channel.name;
  let messageTs = shortcut.message_ts;
  let invoker = shortcut.user.id;

  let channelCheck = await checkIfBotInChannel(channel, channelName, invoker);
  if (!channelCheck)
    return;

  let reactions = (await getReactions(channel, messageTs)).message.reactions;
  let notReacted = await getNotReacted(reactions, channel);

  if (notReacted.length > 0) {
    let formattedUsers = notReacted.map((id) => `<@${id}>`).join(', ');
    await sendMessage(invoker, `According to my calculations, the following users (${notReacted.length}) have not reacted: ${formattedUsers}.`);
  } else {
    await sendMessage(invoker, `Everyone has reacted to the message!`);
  }
}

async function remindDmShortcut({shortcut, ack}) {
  try {
    await ack();
    await remindDm(shortcut);
  } catch (err) {
    logErr(err);
  }
}

async function listNotReactedShortcut({shortcut, ack}) {
  try {
    await ack();
    await listNotReacted(shortcut);
  } catch (err) {
    logErr(err);
  }
}

slackApp.shortcut('remind_dm', remindDmShortcut);

slackApp.shortcut('list_not_reacted', listNotReactedShortcut);
    
slackApp.start();
