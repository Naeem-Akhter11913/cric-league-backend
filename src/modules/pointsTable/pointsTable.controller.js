const { Tournament, Match, PointsTable, PlayerStats, PlayingXI } = require('../../models');
const apiResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');
const { orgIdOf } = require('../../utils/orgId');
const { POINTS } = require('../scoring/stats.service');

const PLAYOFF_SPOTS = 4;
const sid = (v) => (v ? String(v && v._id ? v._id : v) : null);
const oversText = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
const yearOf = (t) => new Date(t.startDate || t.createdAt).getFullYear();

async function topPerformers(tid, finishedIds) {
  const specs = [
    { key: 'runs', label: 'Runs' },
    { key: 'wickets', label: 'Wickets' },
    { key: 'highestScore', label: 'Highest score' },
  ];
  const found = await Promise.all(
    specs.map((s) =>
      PlayerStats.findOne({ tournamentId: tid, [s.key]: { $gt: 0 } })
        .sort({ [s.key]: -1, matches: 1 })
        .populate({ path: 'playerId', select: 'userId', populate: { path: 'userId', select: 'name avatarUrl' } })
        .lean()
    )
  );

  // which team each of them played for in this tournament
  const playerIds = found.filter((r) => r?.playerId).map((r) => r.playerId._id);
  const xis = playerIds.length && finishedIds.length
    ? await PlayingXI.find({ matchId: { $in: finishedIds }, players: { $in: playerIds } })
        .select('teamId players').populate('teamId', 'name').lean()
    : [];
  const teamOf = new Map();
  xis.forEach((xi) => xi.players.forEach((p) => teamOf.set(sid(p), xi.teamId?.name)));

  return specs
    .map((s, i) => {
      const r = found[i];
      if (!r?.playerId) return null;
      return {
        key: s.key,
        label: s.label,
        value: r[s.key],
        name: r.playerId.userId?.name || 'Unknown',
        avatarUrl: r.playerId.userId?.avatarUrl,
        team: teamOf.get(sid(r.playerId._id)) || '',
      };
    })
    .filter(Boolean);
}

// GET /points-table?tournamentId=
const overview = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);

  const tournaments = await Tournament.find({ organizerId: orgId })
    .select('name status formatType startDate createdAt')
    .sort({ startDate: -1, createdAt: -1 })
    .lean();
  const list = tournaments.map((t) => ({
    _id: sid(t._id), name: t.name, status: t.status, formatType: t.formatType, year: yearOf(t),
  }));
  if (!tournaments.length) return apiResponse(res, 200, 'Points table', { tournaments: [], tournament: null });

  const t =
    tournaments.find((x) => sid(x._id) === req.query.tournamentId) ||
    tournaments.find((x) => x.status === 'ongoing') ||
    tournaments[0];
  const tid = t._id;

  const [rows, byStatus, finished] = await Promise.all([
    PointsTable.find({ tournamentId: tid }).populate('teamId', 'name logoUrl').lean(),
    Match.aggregate([{ $match: { tournamentId: tid } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Match.find({ tournamentId: tid, status: { $in: ['completed', 'abandoned'] } })
      .select('teamA teamB status result scheduledAt').sort({ scheduledAt: -1 }).lean(),
  ]);

  /* last 5 results per team (oldest to newest) */
  const outcome = (m, teamId) =>
    m.status === 'abandoned' || m.result?.isNoResult ? 'NR'
    : m.result?.isTie ? 'T'
    : sid(m.result?.winner) === teamId ? 'W' : 'L';
  const form = new Map();
  finished.forEach((m) =>
    [m.teamA, m.teamB].forEach((team) => {
      const k = sid(team);
      const arr = form.get(k) || [];
      if (arr.length < 5) { arr.push(outcome(m, k)); form.set(k, arr); }
    })
  );

  /* positions: points, then net run rate, then wins, then name */
  const ranked = rows
    .filter((r) => r.teamId)
    .sort((a, b) =>
      b.points - a.points ||
      (b.netRunRate || 0) - (a.netRunRate || 0) ||
      b.won - a.won ||
      a.teamId.name.localeCompare(b.teamId.name)
    );

  const spots = t.formatType === 'League + Playoffs'
    ? Math.min(PLAYOFF_SPOTS, Math.max(1, Math.floor(ranked.length / 2)))
    : 0;
  const anyPlayed = ranked.some((r) => r.played > 0);
  const zoneOf = (pos) =>
    !spots || !anyPlayed ? null : pos <= spots ? 'qualified' : t.status === 'completed' ? 'eliminated' : 'maybe';

  const standings = ranked.map((r, i) => ({
    pos: i + 1,
    team: { _id: sid(r.teamId), name: r.teamId.name, logoUrl: r.teamId.logoUrl },
    played: r.played, won: r.won, lost: r.lost, tied: r.tied, noResult: r.noResult,
    points: r.points,
    netRunRate: r.netRunRate || 0,
    runsFor: r.runsFor || 0, oversFor: oversText(r.ballsFor || 0),
    runsAgainst: r.runsAgainst || 0, oversAgainst: oversText(r.ballsAgainst || 0),
    last5: (form.get(sid(r.teamId)) || []).slice().reverse(),
    zone: zoneOf(i + 1),
  }));

  const c = Object.fromEntries(byStatus.map((x) => [x._id, x.count]));
  const completed = (c.completed || 0) + (c.abandoned || 0);
  const remaining = (c.scheduled || 0) + (c.toss_done || 0) + (c.live || 0) + (c.innings_break || 0);
  const totalMatches = completed + remaining;                          // cancelled matches are not counted

  apiResponse(res, 200, 'Points table', {
    tournaments: list,
    tournament: { ...list.find((x) => x._id === sid(tid)), spots },
    stats: {
      teams: ranked.length,
      totalMatches,
      completed,
      remaining,
      pointsAvailable: totalMatches * POINTS.win,
      pointsAwarded: ranked.reduce((n, r) => n + r.points, 0),
    },
    standings,
    topPerformers: await topPerformers(tid, finished.map((m) => m._id)),
    pointsSystem: { win: POINTS.win, tie: POINTS.tie, noResult: POINTS.noResult, loss: 0 },
    lastUpdated: rows.reduce((max, r) => (!max || r.updatedAt > max ? r.updatedAt : max), null),
  });
});

module.exports = { overview };