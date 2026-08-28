const { default: mongoose } = require("mongoose");
const { Venue } = require("../../models");
const apiResponse = require("../../utils/apiResponse");
const catchAsync = require("../../utils/catchAsync");



const createVenue = catchAsync(async (req, res) => {
  const venue = await Venue.create({ ...req.body, createdBy: req.user.id });
  apiResponse(res, 201, 'venue created (pending approval)', venue);
});

const list = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;

  const filter = {
    createdBy: new mongoose.Types.ObjectId(req.user.id),
  };

  const venueList = await Venue.aggregate([
    { $match: filter },
    { $skip: (Number(page) - 1) * Number(limit) },
    { $limit: Number(limit) },
  ]);

  const totalCount = await Venue.countDocuments(filter);

  apiResponse(res, 200, 'Venues fetched successfully', {
    data: venueList,
    totalCount,
    totalPages: Math.ceil(totalCount / Number(limit)),
  });
});


module.exports = { createVenue, list }