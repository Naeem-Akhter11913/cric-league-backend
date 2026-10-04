const { Team, TeamPlayer, Player } = require('../../models');
const catchAsync = require('../../utils/catchAsync');
const apiResponse = require('../../utils/apiResponse');
const ApiError = require('../../utils/apiError');
const { default: mongoose } = require('mongoose');

const createTeam = catchAsync(async (req, res) => {
  const team = await Team.create({ ...req.body, managerId: req.user.id });
  apiResponse(res, 201, 'Team created (pending approval)', team);
});

const getById = catchAsync(async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) throw new ApiError(404, 'Team not found');
  apiResponse(res, 200, 'Team fetched', team);
});

// const list = catchAsync(async (req, res) => {
//   const { page = 1, limit = 20 } = req.query;
//   const team = await Team.aggregate([
//     {
//       $match: {
//         managerId: new mongoose.Types.ObjectId(req.user.id)
//       }
//     },
//     {
//       $skip: (Number(page) - 1) * limit
//     },
//     {
//       $limit: Number(limit)
//     }
//   ]);
//   apiResponse(res, 200, 'Teams fetched', team);
// });


// const list = catchAsync(async (req, res) => {
//   const { page = 1, limit = 20 } = req.query;

//   const teams = await Team.aggregate([
//     {
//       $match: {
//         managerId: new mongoose.Types.ObjectId(req.user.id)
//       }
//     },
//     {
//       $sort: { createdAt: -1 }
//     },
//     {
//       $skip: (Number(page) - 1) * Number(limit)
//     },
//     {
//       $limit: Number(limit)
//     },

//     // ---- Populate players (Player[]), each Player nested-populated with its User ----
//     {
//       $lookup: {
//         from: 'players',
//         let: { playerIds: '$players' },
//         pipeline: [
//           {
//             $match: {
//               $expr: { $in: ['$_id', '$$playerIds'] }
//             }
//           },
//           {
//             $lookup: {
//               from: 'users',
//               localField: 'userId',
//               foreignField: '_id',
//               as: 'userId'
//             }
//           },
//           {
//             $unwind: {
//               path: '$userId',
//               preserveNullAndEmptyArrays: true
//             }
//           }
//         ],
//         as: 'players'
//       }
//     }
//   ]);

//   apiResponse(res, 200, 'Teams fetched', teams);
// });

const list = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const teams = await Team.aggregate([
    {
      $match: {
        managerId: new mongoose.Types.ObjectId(req.user.id)
      }
    },
    {
      $sort: { createdAt: -1 }
    },
    {
      $skip: (Number(page) - 1) * Number(limit)
    },
    {
      $limit: Number(limit)
    },

    // ---- Populate players (Player[]), each Player nested-populated with its User ----
    {
      $lookup: {
        from: 'players',
        let: { playerIds: '$players' },
        pipeline: [
          {
            $match: {
              $expr: { $in: ['$_id', '$$playerIds'] }
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'userId',
              foreignField: '_id',
              as: 'userId',
              pipeline: [
                {
                  $project: {
                    password: 0,
                    refreshTokens: 0,
                    passwordHash: 0
                  }
                }
              ]
            }
          },
          {
            $unwind: {
              path: '$userId',
              preserveNullAndEmptyArrays: true
            }
          }
        ],
        as: 'players'
      }
    }
  ]);

  apiResponse(res, 200, 'Teams fetched', teams);
});

const updateTeam = catchAsync(async (req, res) => {
  const team = await Team.findOne({ _id: req.params.id, managerId: req.user.id });
  if (!team) throw new ApiError(404, 'Team not found or not owned by you');
  Object.assign(team, req.body);
  await team.save();
  apiResponse(res, 200, 'Team updated', team);
});

// Register a player (team or outsider) into a team roster
const addPlayer = catchAsync(async (req, res) => {
  const { playerId, playerCategory = 'team_player', jerseyNumber, role } = req.body;
  const team = await Team.findOne({ _id: req.params.id, managerId: req.user.id });
  if (!team) throw new ApiError(404, 'Team not found or not owned by you');

  const entry = await TeamPlayer.create({
    teamId: team._id,
    playerId,
    playerCategory,
    jerseyNumber,
    role,
  });
  apiResponse(res, 201, 'Player added to team', entry);
});

const listPlayers = catchAsync(async (req, res) => {
  const players = await TeamPlayer.find({ teamId: req.params.id, status: 'active' }).populate(
    'playerId'
  );
  apiResponse(res, 200, 'Team players fetched', players);
});


const deleteTeam = catchAsync(async (req, res) => {
  const team = await Team.findByIdAndDelete(req.params.id);
  if (!team) return apiResponse(res, 404, 'Team not found');
  await PlayingXI.deleteMany({ teamId: team._id });
  apiResponse(res, 200, 'Team deleted');
});

const stats = catchAsync(async (req, res) => {
  const filter = {}; // if teams belong to one organizer: { createdBy: req.user._id }

  const [byStatus, playerIds, tournamentIds, largest, totalPlayingXIs] = await Promise.all([
    Team.aggregate([
      { $match: filter },
      { $group: { _id: { $toLower: { $ifNull: ['$status', ''] } }, count: { $sum: 1 } } },
    ]),
    Team.distinct('players', filter),       // distinct players across all squads
    Team.distinct('tournament', filter),    // distinct tournaments
    Team.aggregate([
      { $match: filter },
      { $project: { name: 1, playerCount: { $size: { $ifNull: ['$players', []] } } } },
      { $sort: { playerCount: -1, name: 1 } },
      { $limit: 1 },
    ]),
    PlayingXI.countDocuments(),             // scope this too if you scope teams
  ]);

  const c = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));

  apiResponse(res, 200, 'Team stats', {
    totalTeams: byStatus.reduce((sum, s) => sum + s.count, 0),
    activeTeams: c.active || 0,
    inactiveTeams: c.inactive || 0,
    blockedTeams: c.blocked || 0,
    totalPlayers: playerIds.length,
    tournamentsPlayed: tournamentIds.filter(Boolean).length,
    totalPlayingXIs,
    largestSquad: largest[0]
      ? { _id: largest[0]._id, name: largest[0].name, playerCount: largest[0].playerCount }
      : null,
  });
});
// router.delete('/teams/:id', auth, authorize('organizer'), remove);

module.exports = { createTeam, getById, list, updateTeam, addPlayer, listPlayers, deleteTeam, stats };
