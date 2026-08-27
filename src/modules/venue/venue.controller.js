const { Venue } = require("../../models");
const apiResponse = require("../../utils/apiResponse");
const catchAsync = require("../../utils/catchAsync");



const createVenue = catchAsync(async (req, res) => {
  const venue = await Venue.create({ ...req.body, createdBy: req.user.id });
  apiResponse(res, 201, 'venue created (pending approval)', venue);
});


module.exports ={createVenue}