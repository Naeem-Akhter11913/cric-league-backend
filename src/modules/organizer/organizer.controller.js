const { User } = require("../../models");
const apiResponse = require("../../utils/apiResponse");
const catchAsync = require("../../utils/catchAsync");


const list = catchAsync(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;
    const organizer = await User.find(
        { role: 'organizer' },
        {_id:1,email:1,name:1, phone:1}
    )
        .skip((page - 1) * limit)
        .limit(Number(limit));
    apiResponse(res, 200, 'Organizers fetched', organizer);
});


module.exports = { list }