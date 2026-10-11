const { Tournament } = require('../../models');
const apiResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');
const { orgIdOf } = require('../../utils/orgId');
const { computeStatistics } = require('./statistics.service');

const yearOf = (t) => new Date(t.startDate || t.createdAt).getFullYear();

// GET /statistics?tournamentId=
const overview = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);
  const tournaments = await Tournament.find({ organizerId: orgId })
    .select('name status startDate createdAt')
    .sort({ startDate: -1, createdAt: -1 })
    .lean();
  const list = tournaments.map((t) => ({ _id: String(t._id), name: t.name, status: t.status, year: yearOf(t) }));
  if (!tournaments.length) return apiResponse(res, 200, 'Statistics', { tournaments: [], tournament: null });

  const t =
    tournaments.find((x) => String(x._id) === req.query.tournamentId) ||
    tournaments.find((x) => x.status === 'ongoing') ||
    tournaments[0];

  const stats = await computeStatistics(t._id);
  apiResponse(res, 200, 'Statistics', {
    tournaments: list,
    tournament: list.find((x) => x._id === String(t._id)),
    ...stats,
  });
});

module.exports = { overview };