const mongoose = require('mongoose');
const { Match, Tournament, Team, Venue, User, Scorer } = require('../../models');
const apiResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');
const { orgIdOf } = require('../../utils/orgId');

const GROUPS = {
  live: ['live', 'innings_break'],
  upcoming: ['scheduled', 'toss_done'],
  completed: ['completed'],
  cancelled: ['cancelled', 'abandoned'],
};
const DEFAULT_OVERS = { T20: 20, T10: 10, ODI: 50, Test: null };
const WINDOW_HOURS = { T10: 3, T20: 4, ODI: 9, Test: 24 };   // how long a match "blocks" a team or venue
const FORMATS = Object.keys(DEFAULT_OVERS);

// If tournaments / teams / venues are owned per organizer, put the owner filter here,
// e.g. { tournament: { organizerId: orgId } }. Empty = no extra filter.
// const ownerScope = (orgId) => ({ tournament: {}, team: {}, venue: {} });
const ownerScope = (orgId) => ({
  tournament: { organizerId: orgId },
  team: { managerId: orgId },
  venue: { createdBy: orgId },
});

const POPULATE = [
  { path: 'teamA', select: 'name logoUrl' },
  { path: 'teamB', select: 'name logoUrl' },
  { path: 'tournamentId', select: 'name' },
  { path: 'venueId', select: 'name address' },
  { path: 'scorerId', select: 'name email' },
  { path: 'toss.winner', select: 'name' },
  { path: 'result.winner', select: 'name logoUrl' },
  { path: 'playerOfMatch.player', select: 'userId', populate: { path: 'userId', select: 'name avatarUrl' } },
];

/* ------------------------------ validation ------------------------------ */

async function validateInput(body, orgId, existing = null) {
  const pick = (k) => (body[k] !== undefined ? body[k] : existing ? existing[k] : undefined);
  const asId = (v) => (v ? String(v) : '');

  // the tournament is fixed once a match exists (match numbers belong to it)
  const tournamentId = existing ? asId(existing.tournamentId) : asId(body.tournamentId);
  const teamA = asId(pick('teamA'));
  const teamB = asId(pick('teamB'));
  const venueId = asId(pick('venueId')) || null;
  const scorerId = asId(pick('scorerId')) || null;
  const format = pick('format') || 'T20';


  // scorerId && scorerId !== asId(existing?.scorerId)
  // ? Scorer.exists({ userId: scorerId, organizerId: orgId, status: 'active' })
  // : true,

  if (!tournamentId) return { error: 'Tournament is required' };
  if (!teamA || !teamB) return { error: 'Both teams are required' };
  const ids = [tournamentId, teamA, teamB, venueId, scorerId].filter(Boolean);
  if (!ids.every((id) => mongoose.isValidObjectId(id))) return { error: 'Invalid id in request' };
  if (teamA === teamB) return { error: 'Team A and Team B must be different' };
  if (!FORMATS.includes(format)) return { error: 'Invalid format' };

  const scheduledAt = new Date(pick('scheduledAt'));
  if (isNaN(scheduledAt)) return { error: 'A valid match date and time is required' };
  const dateChanged = !existing || scheduledAt.getTime() !== new Date(existing.scheduledAt).getTime();
  if (dateChanged && scheduledAt <= new Date()) return { error: 'Match time must be in the future' };

  let overs = null;
  if (format !== 'Test') {
    const raw =
      body.overs !== undefined && body.overs !== ''
        ? Number(body.overs)
        : existing?.overs ?? DEFAULT_OVERS[format];
    if (!Number.isInteger(raw) || raw < 1 || raw > 50) {
      return { error: 'Overs must be a whole number between 1 and 50' };
    }
    overs = raw;
  }

  const scope = ownerScope(orgId);
  const [tournament, teamCount, venue, scorer] = await Promise.all([
    Tournament.exists({ _id: tournamentId, ...scope.tournament }),
    Team.countDocuments({ _id: { $in: [teamA, teamB] }, ...scope.team }),
    venueId ? Venue.exists({ _id: venueId, ...scope.venue }) : true,
    // scorerId ? User.exists({ _id: scorerId, role: 'scorer' }) : true,
    scorerId && scorerId !== asId(existing?.scorerId)
      ? Scorer.exists({ userId: scorerId, organizerId: orgId, status: 'active' })
      : true,
  ]);
  if (!tournament) return { error: 'Tournament not found' };
  if (teamCount !== 2) return { error: 'One or both teams were not found' };
  if (!venue) return { error: 'Venue not found' };
  if (!scorer) return { error: 'Scorer not found' };

  // no double-booking of a team or venue around the same time
  const windowMs = WINDOW_HOURS[format] * 3600 * 1000;
  const near = {
    scheduledAt: {
      $gt: new Date(scheduledAt.getTime() - windowMs),
      $lt: new Date(scheduledAt.getTime() + windowMs),
    },
    status: { $in: [...GROUPS.upcoming, ...GROUPS.live] },
    ...(existing && { _id: { $ne: existing._id } }),
  };
  const [teamClash, venueClash] = await Promise.all([
    Match.exists({ ...near, $or: [{ teamA: { $in: [teamA, teamB] } }, { teamB: { $in: [teamA, teamB] } }] }),
    venueId ? Match.exists({ ...near, venueId }) : null,
  ]);
  if (teamClash) return { error: 'One of these teams already has a match around that time', status: 409 };
  if (venueClash) return { error: 'This venue is already booked around that time', status: 409 };

  return { data: { tournamentId, teamA, teamB, venueId, scorerId, format, overs, scheduledAt } };
}

const findMine = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Match.findOne({ _id: req.params.id, createdBy: orgIdOf(req) });
};

/* ------------------------------- handlers ------------------------------- */

// GET /matches/options: everything the Schedule form needs in one call
const options = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);
  const scope = ownerScope(orgIdOf(req));

  const [tournaments, teams, venues, scorerProfiles] = await Promise.all([
    Tournament.find(scope.tournament).select('name format overs').sort({ createdAt: -1 }).limit(200).lean(),
    Team.find({ ...scope.team, status: { $nin: ['suspended'] } })
      .select('name logoUrl').sort({ name: 1 }).limit(500).lean(),
    Venue.find(scope.venue).select('name address').sort({ name: 1 }).limit(200).lean(),
    // was: User.find({ role: 'scorer', status: 'approved' }) — which listed every scorer in the system
    Scorer.find({ organizerId: orgId, status: 'active' }).populate('userId', 'name email').lean(),
  ]);

  const scorers = scorerProfiles
    .filter((p) => p.userId)
    .map((p) => ({ _id: p.userId._id, name: p.userId.name, email: p.userId.email }));

  apiResponse(res, 200, 'Options fetched', { tournaments, teams, venues, scorers });
});

// GET /matches/stats
const stats = catchAsync(async (req, res) => {
  const base = { createdBy: orgIdOf(req) };
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 3600 * 1000);

  const [byStatus, next7] = await Promise.all([
    Match.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Match.countDocuments({ ...base, status: { $in: GROUPS.upcoming }, scheduledAt: { $gte: now, $lte: in7 } }),
  ]);
  const c = Object.fromEntries(byStatus.map((x) => [x._id, x.count]));
  const sum = (arr) => arr.reduce((n, s) => n + (c[s] || 0), 0);

  apiResponse(res, 200, 'Match stats', {
    total: byStatus.reduce((n, x) => n + x.count, 0),
    live: sum(GROUPS.live),
    upcoming: sum(GROUPS.upcoming),
    upcomingNext7Days: next7,
    completed: sum(GROUPS.completed),
    cancelled: sum(GROUPS.cancelled),
  });
});

// GET /matches?status=all|live|upcoming|completed|cancelled&page&limit&tournamentId
const list = catchAsync(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const { status = 'all', tournamentId } = req.query;

  const filter = { createdBy: orgIdOf(req) };
  if (GROUPS[status]) filter.status = { $in: GROUPS[status] };
  if (tournamentId && mongoose.isValidObjectId(tournamentId)) filter.tournamentId = tournamentId;

  const soonestFirst = status === 'upcoming' || status === 'live';

  const [items, total] = await Promise.all([
    Match.find(filter)
      .populate(POPULATE)
      .sort({ scheduledAt: soonestFirst ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Match.countDocuments(filter),
  ]);
  apiResponse(res, 200, 'Matches fetched', { items, total, page, limit });
});

// POST /matches
const create = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);
  const { error, data, status } = await validateInput(req.body, orgId);
  if (error) return apiResponse(res, status || 400, error);

  const last = await Match.findOne({ tournamentId: data.tournamentId })
    .sort({ matchNumber: -1 }).select('matchNumber').lean();

  const match = await Match.create({ ...data, matchNumber: (last?.matchNumber || 0) + 1, createdBy: orgId });
  const populated = await Match.findById(match._id).populate(POPULATE).lean();
  apiResponse(res, 201, 'Match scheduled', populated);
});

// PATCH /matches/:id: only before the match has started
const update = catchAsync(async (req, res) => {
  console.log(req)
  const match = await findMine(req);
  if (!match) return apiResponse(res, 404, 'Match not found');
  if (match.status !== 'scheduled') {
    return apiResponse(res, 400, 'Only matches that have not started can be edited');
  }

  const { error, data, status } = await validateInput(req.body, orgIdOf(req), match);
  if (error) return apiResponse(res, status || 400, error);

  Object.assign(match, data);
  await match.save();
  const populated = await Match.findById(match._id).populate(POPULATE).lean();
  apiResponse(res, 200, 'Match updated', populated);
});

// PATCH /matches/:id/cancel
const cancel = catchAsync(async (req, res) => {
  const match = await findMine(req);
  if (!match) return apiResponse(res, 404, 'Match not found');
  if (!GROUPS.upcoming.includes(match.status)) {
    return apiResponse(res, 400, 'Only upcoming matches can be cancelled');
  }
  match.status = 'cancelled';
  match.cancelReason = String(req.body.reason || '').trim().slice(0, 300);
  await match.save();
  apiResponse(res, 200, 'Match cancelled');
});

module.exports = { options, stats, list, create, update, cancel };