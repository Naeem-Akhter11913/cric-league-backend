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

module.exports = { createTeam, getById, list, updateTeam, addPlayer, listPlayers };
