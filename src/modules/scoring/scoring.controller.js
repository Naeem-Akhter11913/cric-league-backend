const mongoose = require('mongoose');
const { Match } = require('../../models');
const apiResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/apiError');
const svc = require('./scoring.service');
const { broadcastBallScored, broadcastInningsEnd, broadcastMatchCompleted } = require('../../sockets/liveScore.socket');

// the assigned scorer, or the organizer who owns the match
const canScore = (user, match) => {
  if (user.role === 'scorer') return String(match.scorerId || '') === String(user.id);
  if (user.role === 'organizer') return String(match.createdBy) === String(user.id);
  return false;
};

const getMatch = async (req) => {
  const { matchId } = req.params;
  const match = mongoose.isValidObjectId(matchId) ? await Match.findById(matchId) : null;
  if (!match) throw new ApiError(404, 'Match not found');
  if (!canScore(req.user, match)) throw new ApiError(403, 'You are not assigned to score this match');
  return match;
};

const safeEmit = (fn, matchId, payload) => {
  try { fn(matchId, payload); } catch (e) { /* sockets are optional */ }
};

const respond = async (res, match, message) =>
  apiResponse(res, 200, message, await svc.buildState(match._id));

// GET /scoring/my-matches
const myMatches = catchAsync(async (req, res) => {
  const filter = req.user.role === 'scorer' ? { scorerId: req.user.id } : { createdBy: req.user.id };
  filter.status = { $in: ['scheduled', 'toss_done', 'live', 'innings_break'] };
  const items = await Match.find(filter)
    .sort({ scheduledAt: 1 }).limit(50)
    .populate('teamA teamB', 'name logoUrl')
    .populate('tournamentId', 'name')
    .populate('venueId', 'name')
    .lean();
  apiResponse(res, 200, 'Matches fetched', { items });
});

const state = catchAsync(async (req, res) => {
  const match = await getMatch(req);
  // console.log(match)
  await respond(res, match, 'Match state');
});

const toss = catchAsync(async (req, res) => {
  const match = await getMatch(req);
  await svc.recordToss(match, req.body);
  await respond(res, match, 'Toss recorded');
});

const startInnings = catchAsync(async (req, res) => {
  const match = await getMatch(req);
  await svc.startInnings(match, req.body);
  await respond(res, match, 'Innings started');
});

const selectBatter = catchAsync(async (req, res) => {
  const match = await getMatch(req);
  await svc.selectBatter(match, req.body.playerId);
  await respond(res, match, 'Batter selected');
});

const selectBowler = catchAsync(async (req, res) => {
  const match = await getMatch(req);
  await svc.selectBowler(match, req.body.playerId);
  await respond(res, match, 'Bowler selected');
});

const recordBall = catchAsync(async (req, res) => {
  const match = await getMatch(req);
  const outcome = await svc.recordBall(match, req.user.id, req.body);
  const data = await svc.buildState(match._id);

  if (!outcome.duplicate) {
    const c = data.current;
    safeEmit(broadcastBallScored, match._id, { matchId: match._id, runs: c.runs, wickets: c.wickets, overs: c.overs, lastBalls: c.lastBalls });
    if (outcome.endReason && c.number === 1) safeEmit(broadcastInningsEnd, match._id, { matchId: match._id, innings: data.innings });
    if (data.match.status === 'completed') safeEmit(broadcastMatchCompleted, match._id, { matchId: match._id, result: data.match.result });
  }
  apiResponse(res, 200, 'Ball recorded', data);
});

const undo = catchAsync(async (req, res) => {
  const match = await getMatch(req);
  // await svc.undoLastBall(match);
  await svc.undoLastBall(match, req.user.id);
  const data = await svc.buildState(match._id);
  if (data.current) {
    safeEmit(broadcastBallScored, match._id, { matchId: match._id, runs: data.current.runs, wickets: data.current.wickets, overs: data.current.overs, lastBalls: data.current.lastBalls });
  }
  
  apiResponse(res, 200, 'Last ball removed', data);
});

module.exports = { myMatches, state, toss, startInnings, selectBatter, selectBowler, recordBall, undo };