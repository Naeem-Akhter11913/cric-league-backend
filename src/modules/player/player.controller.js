const { Player, User } = require('../../models');
const catchAsync = require('../../utils/catchAsync');
const apiResponse = require('../../utils/apiResponse');
const ApiError = require('../../utils/apiError');

// Create/complete a player profile for the logged-in user
const createProfile = catchAsync(async (req, res) => {
  const existing = await Player.findOne({ userId: req.user.id });
  if (existing) throw new ApiError(409, 'Player profile already exists');

  const player = await Player.create({ userId: req.user.id, ...req.body });
  apiResponse(res, 201, 'Player profile created', player);
});

const getMyProfile = catchAsync(async (req, res) => {
  const player = await Player.findOne({ userId: req.user._id }).populate('userId', 'name email');
  if (!player) throw new ApiError(404, 'Player profile not found');
  apiResponse(res, 200, 'Player profile fetched', player);
});

const getById = catchAsync(async (req, res) => {
  const player = await Player.findById(req.params.id).populate('userId', 'name email');
  if (!player) throw new ApiError(404, 'Player not found');
  apiResponse(res, 200, 'Player fetched', player);
});

const list = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const players = await Player.find()
    .populate('userId', 'name email')
    .skip((page - 1) * limit)
    .limit(Number(limit));
  apiResponse(res, 200, 'Players fetched', players);
});

const updateMyProfile = catchAsync(async (req, res) => {
  const player = await Player.findOneAndUpdate({ userId: req.user.id }, req.body, { new: true });
  if (!player) throw new ApiError(404, 'Player profile not found');
  apiResponse(res, 200, 'Player profile updated', player);
});

module.exports = { createProfile, getMyProfile, getById, list, updateMyProfile };
