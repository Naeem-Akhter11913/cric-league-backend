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

const updateVenue = catchAsync(async (req, res) => {
  const { venueId } = req.params;
  const authorId = req.user.id;
  const venueDetails = req.body;

  const updatedVenue = await Venue.findOneAndUpdate(
    { _id: new mongoose.Types.ObjectId(venueId), createdBy: new mongoose.Types.ObjectId(authorId) },
    { $set: venueDetails },
    { new: true, runValidators: true }
  );

  if (!updatedVenue) {
    throw new ApiError(404, 'Venue not found or you are not authorized to update it');
  }

  apiResponse(res, 200, 'Venue updated successfully', updatedVenue);
});


const deleteVenue = catchAsync(async (req, res) => {
  const { venueId } = req.params;
  const authorId = req.user.id;
  console.log({venueId,authorId})
  await Venue.findOneAndDelete({
    createdBy: new mongoose.Types.ObjectId(authorId),
    _id: new mongoose.Types.ObjectId(venueId)
  })
  apiResponse(res, 200, 'Venue deleted successfully');
})


module.exports = { createVenue, list, updateVenue, deleteVenue }