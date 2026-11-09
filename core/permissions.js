'use strict';

const settings = require('../config/settings');

function phoneDigits(jid) {
  if (!jid || typeof jid !== 'string') return '';
  const local = jid.split('@')[0].split(':')[0];
  return /^\d+$/.test(local) ? local : '';
}

function jidMatches(left, right) {
  if (left === right) return true;
  const leftDigits = phoneDigits(left);
  const rightDigits = phoneDigits(right);
  return Boolean(leftDigits && rightDigits && leftDigits === rightDigits);
}

function isOwner(jid) {
  const candidate = phoneDigits(jid);
  return Boolean(candidate && settings.OWNER_NUMBERS.some((owner) => phoneDigits(owner) === candidate));
}

async function groupParticipant(sock, groupId, participantJid) {
  const metadata = await sock.groupMetadata(groupId);
  const participant = metadata.participants?.find((item) => jidMatches(item.id, participantJid));
  return { metadata, participant };
}

async function isGroupAdmin(sock, groupId, participantJid) {
  if (!groupId?.endsWith('@g.us')) return false;
  try {
    const { participant } = await groupParticipant(sock, groupId, participantJid);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch { return false; }
}

async function isBotAdmin(sock, groupId) {
  if (!groupId?.endsWith('@g.us')) return false;
  try {
    const { participant } = await groupParticipant(sock, groupId, sock.user?.id);
    return participant?.admin === 'admin' || participant?.admin === 'superadmin';
  } catch { return false; }
}

module.exports = { phoneDigits, jidMatches, isOwner, isGroupAdmin, isBotAdmin, groupParticipant };
