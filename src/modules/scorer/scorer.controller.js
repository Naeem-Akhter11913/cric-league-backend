const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Scorer, Match, Ball, Tournament } = require('../../models');
const apiResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');
const { orgIdOf } = require('../../utils/orgId');

const DEFAULT_SCORER_PASSWORD = process.env.DEFAULT_SCORER_PASSWORD || '000000';
const MIN_BALLS_FOR_RATING = 30;               // below 5 overs an accuracy % means nothing
const UPCOMING = ['scheduled', 'toss_done'];
const LIVE = ['live', 'innings_break'];

const ratingOf = (a) =>
  a === null ? null : a >= 90 ? 'Excellent' : a >= 75 ? 'Good' : a >= 50 ? 'Average' : 'Poor';
const clampYears = (v) => Math.min(60, Math.max(0, Math.floor(Number(v)) || 0));
const makeOnlyChief = (orgId, profileId) =>
  Scorer.updateMany({ organizerId: orgId, _id: { $ne: profileId } }, { $set: { isChief: false } });

/* every scorer of this organization, with their numbers */
async function loadScorers(orgId) {
  const profiles = await Scorer.find({ organizerId: orgId })
    .populate('userId', 'name email phone avatarUrl')
    .sort({ createdAt: -1 })
    .lean();
  const rows = profiles.filter((p) => p.userId);          // skip profiles whose user was deleted
  const ids = rows.map((p) => p.userId._id);

  const [scored, upcoming, balls] = ids.length
    ? await Promise.all([
        Match.aggregate([
          { $match: { createdBy: orgId, scorerId: { $in: ids }, status: 'completed' } },
          { $group: { _id: '$scorerId', count: { $sum: 1 } } },
        ]),
        Match.aggregate([
          { $match: { createdBy: orgId, scorerId: { $in: ids }, status: { $in: UPCOMING } } },
          { $group: { _id: '$scorerId', count: { $sum: 1 } } },
        ]),
        Ball.aggregate([
          { $match: { recordedBy: { $in: ids } } },
          { $group: { _id: '$recordedBy', total: { $sum: 1 }, corrected: { $sum: { $cond: ['$isCorrected', 1, 0] } } } },
        ]),
      ])
    : [[], [], []];

  const scoredMap = new Map(scored.map((x) => [String(x._id), x.count]));
  const upcomingMap = new Map(upcoming.map((x) => [String(x._id), x.count]));
  const ballMap = new Map(balls.map((x) => [String(x._id), x]));

  return rows.map((p) => {
    const key = String(p.userId._id);
    const b = ballMap.get(key);
    const ballsRecorded = b?.total || 0;
    const accuracy =
      ballsRecorded >= MIN_BALLS_FOR_RATING
        ? Math.round((1 - b.corrected / b.total) * 1000) / 10
        : null;
    return {
      _id: p._id,
      userId: p.userId,
      city: p.city || '',
      experienceYears: p.experienceYears || 0,
      isChief: !!p.isChief,
      status: p.status,
      createdAt: p.createdAt,
      matchesScored: scoredMap.get(key) || 0,
      upcomingMatches: upcomingMap.get(key) || 0,
      ballsRecorded,
      accuracy,
      rating: ratingOf(accuracy),
    };
  });
}

const findMine = (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Scorer.findOne({ _id: req.params.id, organizerId: orgIdOf(req) }).populate('userId', 'name email phone');
};

/* GET /scorers/overview: cards, top scorer, donut, recent activity, filter options */
const overview = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);
  const rows = await loadScorers(orgId);

  const rated = rows.filter((r) => r.accuracy !== null);
  const topAccuracy =
    [...rated].sort((a, b) => b.accuracy - a.accuracy || b.matchesScored - a.matchesScored)[0] || null;
  const mostMatches = [...rows].sort((a, b) => b.matchesScored - a.matchesScored)[0] || null;
  const best = topAccuracy || (mostMatches?.matchesScored ? mostMatches : null);
  const brief = (r) =>
    r && {
      _id: r._id,
      name: r.userId.name,
      city: r.city,
      avatarUrl: r.userId.avatarUrl,
      matchesScored: r.matchesScored,
      accuracy: r.accuracy,
      ballsRecorded: r.ballsRecorded,
    };

  // matches scored, grouped by the rating of the scorer who scored them
  const buckets = { Excellent: 0, Good: 0, Average: 0, Poor: 0, unrated: 0 };
  rows.forEach((r) => { buckets[r.rating || 'unrated'] += r.matchesScored; });
  const totalMatches = rows.reduce((n, r) => n + r.matchesScored, 0);
  const pct = (v) => (totalMatches ? `${((v / totalMatches) * 100).toFixed(1)}%` : '0%');
  const performance = [
    { name: 'Excellent (90%+)', value: buckets.Excellent, color: '#22C55E' },
    { name: 'Good (75-90%)', value: buckets.Good, color: '#3B82F6' },
    { name: 'Average (50-75%)', value: buckets.Average, color: '#F59E0B' },
    { name: 'Poor (<50%)', value: buckets.Poor, color: '#EF4444' },
    { name: 'Not rated yet', value: buckets.unrated, color: '#9CA3AF' },
  ].map((d) => ({ ...d, pct: pct(d.value) }));

  const ids = rows.map((r) => r.userId._id);
  const [recent, tournaments] = await Promise.all([
    ids.length
      ? Match.find({ createdBy: orgId, scorerId: { $in: ids }, status: 'completed' })
          .sort({ updatedAt: -1 }).limit(5)
          .populate('teamA teamB', 'name')
          .populate('scorerId', 'name')
          .lean()
      : [],
    Tournament.find({ organizerId: orgId }).select('name').sort({ createdAt: -1 }).limit(100).lean(),
  ]);

  apiResponse(res, 200, 'Scorer overview', {
    stats: {
      total: rows.length,
      active: rows.filter((r) => r.status === 'active').length,
      matchesScored: totalMatches,
      topAccuracy: topAccuracy && { name: topAccuracy.userId.name, accuracy: topAccuracy.accuracy },
      mostMatches: mostMatches?.matchesScored
        ? { name: mostMatches.userId.name, count: mostMatches.matchesScored }
        : null,
    },
    topScorer: brief(best),
    performance,
    recentActivity: recent.map((m) => ({
      _id: m._id,
      name: m.scorerId?.name || 'Scorer',
      action: 'scored match',
      detail: `${m.teamA?.name} vs ${m.teamB?.name}`,
      at: m.updatedAt,
    })),
    filters: {
      cities: [...new Set(rows.map((r) => r.city).filter(Boolean))].sort(),
      tournaments,
    },
  });
});

/* GET /scorers?page&limit&search&status&city&tournamentId&sort */
const list = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const { search = '', status, city, tournamentId, sort = 'name_asc' } = req.query;

  let rows = await loadScorers(orgId);

  if (['active', 'inactive'].includes(status)) rows = rows.filter((r) => r.status === status);
  if (city) rows = rows.filter((r) => r.city.toLowerCase() === String(city).toLowerCase());
  if (tournamentId && mongoose.isValidObjectId(tournamentId)) {
    const ids = new Set((await Match.distinct('scorerId', { createdBy: orgId, tournamentId })).map(String));
    rows = rows.filter((r) => ids.has(String(r.userId._id)));
  }
  const q = String(search).trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        r.userId.name.toLowerCase().includes(q) ||
        r.userId.email.toLowerCase().includes(q) ||
        (r.userId.phone || '').includes(q)
    );
  }

  const SORTS = {
    name_asc: (a, b) => a.userId.name.localeCompare(b.userId.name),
    name_desc: (a, b) => b.userId.name.localeCompare(a.userId.name),
    matches: (a, b) => b.matchesScored - a.matchesScored,
    accuracy: (a, b) => (b.accuracy ?? -1) - (a.accuracy ?? -1),
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  };
  rows.sort(SORTS[sort] || SORTS.name_asc);

  apiResponse(res, 200, 'Scorers fetched', {
    items: rows.slice((page - 1) * limit, page * limit),
    total: rows.length,
    page,
    limit,
  });
});

/* POST /scorers: add by email (creates the account, or links an existing scorer) */
const create = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return apiResponse(res, 400, 'A valid email is required');

  const name = String(req.body.name || '').trim() || email.split('@')[0];
  if (name.length < 2) return apiResponse(res, 400, 'Name must be at least 2 characters');
  const phone = String(req.body.phone || '').trim() || undefined;
  const city = String(req.body.city || '').trim();
  const experienceYears = clampYears(req.body.experienceYears);
  const isChief = !!req.body.isChief;

  let user = await User.findOne({ email });
  let createdUser = false;
  if (user && user.role !== 'scorer') return apiResponse(res, 409, 'This email belongs to a non-scorer account');
  if (!user) {
    user = await User.create({
      name, email, phone,
      passwordHash: await bcrypt.hash(DEFAULT_SCORER_PASSWORD, 10),
      role: 'scorer',
      status: 'approved',
    });
    createdUser = true;
  }

  let profile = await Scorer.findOne({ userId: user._id });
  if (profile?.organizerId) {
    return apiResponse(
      res, 409,
      String(profile.organizerId) === String(orgId)
        ? 'This scorer is already in your organization'
        : 'This scorer already belongs to another organization'
    );
  }

  try {
    if (!profile) {
      profile = await Scorer.create({ userId: user._id, organizerId: orgId, city, experienceYears, isChief });
    } else {
      Object.assign(profile, { organizerId: orgId, city: city || profile.city, experienceYears, isChief });
      await profile.save();
    }
  } catch (err) {
    if (createdUser) await User.deleteOne({ _id: user._id });   // don't leave an orphan user
    throw err;
  }
  if (isChief) await makeOnlyChief(orgId, profile._id);

  apiResponse(res, 201, createdUser ? 'Scorer created' : 'Existing scorer added to your organization', {
    _id: profile._id,
    userId: { _id: user._id, name: user.name, email: user.email },
  });
});

/* PATCH /scorers/:id: name/phone live on the user, the rest on the scorer profile */
const update = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);
  const profile = await findMine(req);
  if (!profile) return apiResponse(res, 404, 'Scorer not found in your organization');

  const b = req.body;
  const userUpdates = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (name.length < 2) return apiResponse(res, 400, 'Name must be at least 2 characters');
    userUpdates.name = name;
  }
  if (b.phone !== undefined) userUpdates.phone = String(b.phone).trim();
  if (b.status !== undefined && !['active', 'inactive'].includes(b.status)) {
    return apiResponse(res, 400, 'Invalid status');
  }

  if (b.city !== undefined) profile.city = String(b.city).trim();
  if (b.experienceYears !== undefined) profile.experienceYears = clampYears(b.experienceYears);
  if (b.isChief !== undefined) profile.isChief = !!b.isChief;
  if (b.status !== undefined) profile.status = b.status;

  await profile.save();
  if (Object.keys(userUpdates).length) await User.updateOne({ _id: profile.userId._id }, { $set: userUpdates });
  if (profile.isChief) await makeOnlyChief(orgId, profile._id);

  apiResponse(res, 200, 'Scorer updated');
});

/* DELETE /scorers/:id: remove from MY organization (the account stays) */
const remove = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);
  const profile = await findMine(req);
  if (!profile) return apiResponse(res, 404, 'Scorer not found in your organization');

  const scoringNow = await Match.exists({ createdBy: orgId, scorerId: profile.userId._id, status: { $in: LIVE } });
  if (scoringNow) return apiResponse(res, 409, 'This scorer is scoring a live match right now');

  profile.organizerId = undefined;
  profile.isChief = false;
  await profile.save();

  const r = await Match.updateMany(
    { createdBy: orgId, scorerId: profile.userId._id, status: { $in: UPCOMING } },
    { $unset: { scorerId: 1 } }
  );
  apiResponse(res, 200, 'Scorer removed from your organization', { matchesUnassigned: r.modifiedCount });
});

module.exports = { overview, list, create, update, remove };