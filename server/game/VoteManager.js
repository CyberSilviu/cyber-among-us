'use strict';

const DISCUSSION_TIME = 30; // seconds
const VOTING_TIME = 60; // seconds

class VoteManager {
  constructor(io, roomCode) {
    this.io = io;
    this.roomCode = roomCode;
    this.active = false;
    this.phase = null; // 'discussion' | 'voting' | null
    this.reporterId = null;
    this.reason = null; // 'body' | 'meeting'
    this.votes = new Map(); // voterId -> targetId | 'skip'
    this.eligibleVoters = new Set(); // alive player ids
    this.discussionTimer = null;
    this.votingTimer = null;
    this.onMeetingEnd = null; // callback
  }

  startMeeting(alivePlayers, reporterId, reason, onMeetingEnd) {
    if (this.active) return;
    this.active = true;
    this.phase = 'discussion';
    this.reporterId = reporterId;
    this.reason = reason;
    this.votes.clear();
    this.eligibleVoters = new Set(alivePlayers.map(p => p.id));
    this.onMeetingEnd = onMeetingEnd;

    const roomPlayers = alivePlayers.map(p => p.getPublicData());

    this.io.to(this.roomCode).emit('meeting-start', {
      reason,
      reporterId,
      alivePlayers: roomPlayers,
      discussionTime: DISCUSSION_TIME,
      votingTime: VOTING_TIME,
    });

    // Discussion phase timer
    this.discussionTimer = setTimeout(() => {
      this.startVotingPhase();
    }, DISCUSSION_TIME * 1000);
  }

  startVotingPhase() {
    this.phase = 'voting';
    this.io.to(this.roomCode).emit('voting-phase-start', { votingTime: VOTING_TIME });

    this.votingTimer = setTimeout(() => {
      this.tallyVotes();
    }, VOTING_TIME * 1000);
  }

  castVote(voterId, targetId) {
    if (!this.active || this.phase !== 'voting') return false;
    if (!this.eligibleVoters.has(voterId)) return false;
    if (this.votes.has(voterId)) return false; // already voted

    this.votes.set(voterId, targetId); // null = skip

    // Notify everyone that this voter has voted (not who they voted for)
    this.io.to(this.roomCode).emit('vote-cast', {
      voterId,
      votesIn: this.votes.size,
      totalVoters: this.eligibleVoters.size,
    });

    // Auto-tally when everyone has voted
    if (this.votes.size >= this.eligibleVoters.size) {
      clearTimeout(this.votingTimer);
      setTimeout(() => this.tallyVotes(), 1000);
    }
    return true;
  }

  tallyVotes() {
    if (!this.active) return;
    clearTimeout(this.discussionTimer);
    clearTimeout(this.votingTimer);
    this.active = false;
    this.phase = null;

    // Count votes per target
    const tally = new Map(); // targetId -> count
    this.votes.forEach((targetId) => {
      if (targetId === null) {
        tally.set('skip', (tally.get('skip') || 0) + 1);
      } else {
        tally.set(targetId, (tally.get(targetId) || 0) + 1);
      }
    });

    // Add skips for players who didn't vote
    this.eligibleVoters.forEach(voterId => {
      if (!this.votes.has(voterId)) {
        tally.set('skip', (tally.get('skip') || 0) + 1);
      }
    });

    // Find the player with the most votes
    let maxVotes = 0;
    let ejectedId = null;
    let tie = false;

    tally.forEach((count, targetId) => {
      if (targetId === 'skip') return;
      if (count > maxVotes) {
        maxVotes = count;
        ejectedId = targetId;
        tie = false;
      } else if (count === maxVotes) {
        tie = true;
      }
    });

    // If tie or skip majority — no ejection
    const skipCount = tally.get('skip') || 0;
    if (tie || skipCount >= maxVotes) {
      ejectedId = null;
    }

    // Build readable votes object
    const votesObj = {};
    this.votes.forEach((targetId, voterId) => {
      votesObj[voterId] = targetId;
    });

    this.io.to(this.roomCode).emit('vote-result', {
      votes: votesObj,
      ejectedId,
      tally: Object.fromEntries(tally),
    });

    // Callback to GameRoom after short delay for animation
    setTimeout(() => {
      if (this.onMeetingEnd) this.onMeetingEnd(ejectedId);
    }, 4000);
  }

  abort() {
    clearTimeout(this.discussionTimer);
    clearTimeout(this.votingTimer);
    this.active = false;
    this.phase = null;
  }
}

module.exports = VoteManager;
