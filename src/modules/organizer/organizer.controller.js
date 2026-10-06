// const { User } = require("../../models");
// const bcrypt = require('bcryptjs'); 
// const apiResponse = require("../../utils/apiResponse");
// const catchAsync = require("../../utils/catchAsync");

// const DEFAULT_PLAYER_PASSWORD = process.env.DEFAULT_PLAYER_PASSWORD || '000000';
// const list = catchAsync(async (req, res) => {
//     const { page = 1, limit = 20 } = req.query;
//     const organizer = await User.find(
//         { role: 'organizer' },
//         { _id: 1, email: 1, name: 1, phone: 1 }
//     )
//         .skip((page - 1) * limit)
//         .limit(Number(limit));
//     apiResponse(res, 200, 'Organizers fetched', organizer);
// });

// const createPlayer = catchAsync(async (req, res) => {
//     const email = (req.body.email || '').trim().toLowerCase();

//     console.log("hhhhhhh",email)

//     if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
//         return apiResponse(res, 400, 'A valid emaisdfsdl is required');
//     }

//     const exists = await User.findOne({ email });
//     if (exists) {
//         return apiResponse(res, 409, 'A user with this email already exists');
//     }

//     const passwordHash = await bcrypt.hash(DEFAULT_PLAYER_PASSWORD, 10);

//     const player = await User.create({
//         name: email.split('@')[0],   // schema requires name; player can edit it later
//         email,
//         passwordHash,
//         role: 'player',
//         status: 'approved',          // organizer-created, so no approval needed
//     });

//     apiResponse(res, 201, 'Player created', {
//         _id: player._id,
//         name: player.name,
//         email: player.email,
//         role: player.role,
//         status: player.status,
//     });
// });


// module.exports = { list, createPlayer }


const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, Player, Team, PlayingXI } = require('../../models');
const apiResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');
const { orgIdOf } = require('../../utils/orgId');

const DEFAULT_PLAYER_PASSWORD = process.env.DEFAULT_PLAYER_PASSWORD || '000000';
const PLAYER_TYPES = ['batter', 'bowler', 'all_rounder', 'wicket_keeper'];
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


/* POST /organizer/players: add by email (creates the user + player, or links an existing one) */
const createPlayer = catchAsync(async (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return apiResponse(res, 400, 'A valid email is required');
  const orgId = orgIdOf(req);

  let user = await User.findOne({ email });
  let createdUser = false;

  if (user && user.role !== 'player') {
    return apiResponse(res, 409, 'This email belongs to a non-player account');
  }
  if (!user) {
    user = await User.create({
      name: email.split('@')[0],
      email,
      passwordHash: await bcrypt.hash(DEFAULT_PLAYER_PASSWORD, 10),
      role: 'player',
      status: 'approved',
    });
    createdUser = true;
  }

  // let player = await Player.findOne({ userId: user._id });
  // if (player && (player.forPlayer || []).some((o) => String(o) === String(orgId))) {
  //   return apiResponse(res, 409, 'This player is already in your organization');
  // }

  // try {
  //   if (!player) player = await Player.create({ userId: user._id, forPlayer: [orgId] });
  //   else {
  //     player.forPlayer.addToSet(orgId);
  //     await player.save();
  //   }
  // } catch (err) {
  //   if (createdUser) await User.deleteOne({ _id: user._id }); // don't leave an orphan user
  //   throw err;
  // }

  let player = await Player.findOne({ userId: user._id });
  if (player?.forPlayer) {
    return String(player.forPlayer) === String(orgId)
      ? apiResponse(res, 409, 'This player is already in your organization')
      : apiResponse(res, 409, 'This player already belongs to another organization');
  }
  try {
    if (!player) player = await Player.create({ userId: user._id, forPlayer: orgId });
    else { player.forPlayer = orgId; await player.save(); }
  } catch (err) {
    if (createdUser) await User.deleteOne({ _id: user._id });
    throw err;
  }

  apiResponse(res, 201, createdUser ? 'Player created' : 'Existing player added to your organization', {
    _id: player._id,
    userId: { _id: user._id, name: user.name, email: user.email },
  });
});

/* GET /organizer/players?page&limit&search&playerType&status&sort */
const listPlayers = catchAsync(async (req, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));
  const { search = '', playerType, status, sort } = req.query;

  const filter = { forPlayer: orgIdOf(req) };
  if (PLAYER_TYPES.includes(playerType)) filter.playerType = playerType;
  if (['active', 'suspended'].includes(status)) filter.status = status;

  if (search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    const users = await User.find({ role: 'player', $or: [{ name: rx }, { email: rx }] }).select('_id').lean();
    filter.userId = { $in: users.map((u) => u._id) };
  }

  const [items, total] = await Promise.all([
    Player.find(filter)
      .populate('userId', 'name email phone avatarUrl')
      .sort({ createdAt: sort === 'oldest' ? 1 : -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Player.countDocuments(filter),
  ]);

  // which teams each player is in
  const teams = items.length
    ? await Team.find({ players: { $in: items.map((p) => p._id) } }).select('name players').lean()
    : [];
  const teamsByPlayer = {};
  teams.forEach((t) =>
    t.players.forEach((pid) => {
      const k = String(pid);
      if (!teamsByPlayer[k]) teamsByPlayer[k] = [];
      teamsByPlayer[k].push({ _id: t._id, name: t.name });
    })
  );

  const rows = items.map((p) => ({ ...p, teams: teamsByPlayer[String(p._id)] || [] }));
  apiResponse(res, 200, 'Players fetched', { items: rows, total, page, limit });
});

/* GET /organizer/players/stats */
const playerStats = catchAsync(async (req, res) => {
  const orgId = orgIdOf(req);
  const base = { forPlayer: orgId };

  const [total, byStatus, byType, available, playerIds] = await Promise.all([
    Player.countDocuments(base),
    Player.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Player.aggregate([{ $match: base }, { $group: { _id: '$playerType', count: { $sum: 1 } } }]),
    Player.countDocuments({ ...base, availability: 'Available' }),
    Player.distinct('_id', base),
  ]);

  const inTeams = await Team.distinct('players', { players: { $in: playerIds } });
  const mine = new Set(playerIds.map(String));
  const assigned = inTeams.filter((id) => mine.has(String(id))).length;

  const st = Object.fromEntries(byStatus.map((x) => [x._id, x.count]));
  const ty = Object.fromEntries(byType.map((x) => [x._id || 'unset', x.count]));

  apiResponse(res, 200, 'Player stats', {
    total,
    active: st.active || 0,
    suspended: st.suspended || 0,
    available,
    assigned,
    unassigned: total - assigned,
    byType: {
      batter: ty.batter || 0,
      bowler: ty.bowler || 0,
      all_rounder: ty.all_rounder || 0,
      wicket_keeper: ty.wicket_keeper || 0,
    },
  });
});

/* DELETE /organizer/players/:id: remove from MY organization (the player account stays) */
const removePlayer = catchAsync(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return apiResponse(res, 400, 'Invalid player id');
  const orgId = orgIdOf(req);

  const player = await Player.findOneAndUpdate(
    { _id: id, forPlayer: orgId },
    { $unset: { forPlayer: orgId } },
    { new: true }
  );
  if (!player) return apiResponse(res, 404, 'Player not found in your organization');

  // clean up: squads and Playing XIs that used this player
  const teamScope = {}; // if teams are owned per organizer, use { createdBy: orgId }
  const teams = await Team.find({ ...teamScope, players: id }).select('_id');
  const teamIds = teams.map((t) => t._id);
  let playingXIsDeleted = 0;

  if (teamIds.length) {
    // await Team.updateMany({ _id: { $in: teamIds } }, { $unset: { players: id } });
    await Team.updateMany({ _id: { $in: teamIds } }, { $pull: { players: id } });
    await Team.updateMany({ _id: { $in: teamIds }, captain: id }, { $unset: { captain: 1 } });
    await Team.updateMany({ _id: { $in: teamIds }, viceCaptain: id }, { $unset: { viceCaptain: 1 } });
    const r = await PlayingXI.deleteMany({
      teamId: { $in: teamIds },
      $or: [{ players: id }, { substitutes: id }],
    });
    playingXIsDeleted = r.deletedCount || 0;
  }

  apiResponse(res, 200, 'Player removed from your organization', {
    teamsAffected: teamIds.length,
    playingXIsDeleted,
  });
});

const list = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const organizer = await User.find(
    { role: 'organizer' },
    { _id: 1, email: 1, name: 1, phone: 1 }
  )
    .skip((page - 1) * limit)
    .limit(Number(limit));
  apiResponse(res, 200, 'Organizers fetched', organizer);
});

module.exports = { list, createPlayer, listPlayers, playerStats, removePlayer };