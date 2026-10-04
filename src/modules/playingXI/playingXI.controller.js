const { PlayingXI, Team } = require('../../models');
const apiResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');

const MAX_SUBS = 4;

const get = catchAsync(async (req, res) => {
    const { teamId, format = 'T20', matchId } = req.query;
    if (!teamId) return apiResponse(res, 400, 'teamId is required');
    const xi = await PlayingXI.findOne({ teamId, format, matchId: matchId || null }).lean();
    apiResponse(res, 200, 'Playing XI fetched', xi); // null when none saved yet
});

const save = catchAsync(async (req, res) => {
    const { teamId, format = 'T20', matchId = null, players = [], substitutes = [], captain, viceCaptain } = req.body;

    const team = await Team.findById(teamId).select('players');
    if (!team) return apiResponse(res, 404, 'Team not found');

    const teamPlayers = new Set(team.players.map(String));
    const xi = players.map(String);
    const subs = substitutes.map(String);

    if (xi.length !== 11 || new Set(xi).size !== 11)
        return apiResponse(res, 400, 'Playing XI must have exactly 11 different players');
    if (subs.length > MAX_SUBS)
        return apiResponse(res, 400, `Maximum ${MAX_SUBS} substitutes allowed`);
    if (![...xi, ...subs].every((id) => teamPlayers.has(id)))
        return apiResponse(res, 400, 'All players must belong to the selected team');
    if (subs.some((id) => xi.includes(id)))
        return apiResponse(res, 400, 'A player cannot be in both the XI and the substitutes');
    if (!xi.includes(String(captain)) || !xi.includes(String(viceCaptain)) || String(captain) === String(viceCaptain))
        return apiResponse(res, 400, 'Captain and vice captain must be two different players from the XI');

    const saved = await PlayingXI.findOneAndUpdate(
        { teamId, format, matchId },
        { $set: { players: xi, substitutes: subs, captain, viceCaptain, createdBy: req.user._id } },
        { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
    );
    apiResponse(res, 200, 'Playing XI saved', saved);
});


const list = catchAsync(async (req, res) => {
    const { page = 1, limit = 10, teamId, format } = req.query;
    const filter = {};
    if (teamId) filter.teamId = teamId;
    if (format) filter.format = format;

    const playerName = { path: 'userId', select: 'name' };

    const [items, total] = await Promise.all([
        PlayingXI.find(filter)
            .populate('teamId', 'name logoUrl')
            .populate({ path: 'captain', select: 'userId', populate: playerName })
            .populate({ path: 'viceCaptain', select: 'userId', populate: playerName })
            .sort({ updatedAt: -1 })
            .skip((Number(page) - 1) * Number(limit))
            .limit(Number(limit))
            .lean(),
        PlayingXI.countDocuments(filter),
    ]);

    apiResponse(res, 200, 'Playing XIs fetched', { items, total, page: Number(page), limit: Number(limit) });
});

const remove = catchAsync(async (req, res) => {
    const xi = await PlayingXI.findByIdAndDelete(req.params.id);
    if (!xi) return apiResponse(res, 404, 'Playing XI not found');
    apiResponse(res, 200, 'Playing XI deleted');
});

module.exports = { get, save, list, remove };
