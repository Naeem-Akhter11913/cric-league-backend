// tournament.controller.js
const mongoose = require('mongoose');
const apiResponse = require('../../utils/apiResponse');
const catchAsync = require('../../utils/catchAsync');
const ApiError = require('../../utils/apiError'); // adjust path/name if yours differs
const { Tournament } = require('../../models');

const createTournament = catchAsync(async (req, res) => {
    const {
        name,
        logo,
        format,
        startDate,
        endDate,
        registrationDeadline,
        venues,
        rules,
        status,
        runnerPrice,
        winnerPrice
    } = req.body;

    const tournament = await Tournament.create({
        name,
        logo,
        organizerId: req.user.id,
        format,
        startDate,
        endDate,
        registrationDeadline,
        rules,
        venues,
        status,
        runnerPrice,
        winnerPrice
    });


    apiResponse(res, 201, 'Tournament created', tournament);
});

const getTournament = catchAsync(async (req, res) => {
    const filter = req.query.id
        ? { _id: req.query.id }
        : { organizerId: req.user.id };

    const tournament = await Tournament.findOne(filter)
        .populate('organizerId', 'name email')
        .populate('venues', 'name city address');

    if (!tournament) {
        throw new ApiError(404, 'Tournament not found');
    }

    apiResponse(res, 200, 'Tournament fetched', tournament);
});

const updateTournament = catchAsync(async (req, res) => {
    const { id, ...updates } = req.body;

    const filter = id
        ? { _id: new mongoose.Types.ObjectId(id), organizerId: new mongoose.Types.ObjectId(req.user.id) }
        : { organizerId: req.user._id };

    const tournament = await Tournament.findOneAndUpdate(filter, updates, {
        new: true,
        runValidators: true,
    });

  
    apiResponse(res, 200, 'Tournament updated', tournament);
});


const list = catchAsync(async (req, res) => {
    const { status, format, search, page = 1, limit = 10 } = req.query;

    const match = {};
    if (status) match.status = status;
    if (format) match.format = format;
    if (search) match.name = { $regex: search, $options: 'i' };

    const skip = (Number(page) - 1) * Number(limit);

    const pipeline = [
        { $match: match },
        {
            $lookup: {
                from: 'users',
                localField: 'organizerId',
                foreignField: '_id',
                as: 'organizer',
            },
        },
        { $unwind: { path: '$organizer', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'venues',
                localField: 'venues',
                foreignField: '_id',
                as: 'venues',
            },
        },
        {
            $addFields: {
                venueCount: { $size: '$venues' },
                teamCount: { $size: { $ifNull: ['$teams', []] } },
            },
        },
        {
            $project: {
                name: 1,
                logo: 1,
                format: 1,
                formatType: 1,
                startDate: 1,
                endDate: 1,
                registrationDeadline: 1,
                status: 1,
                rules: 1,
                winnerPrice: 1,
                runnerPrice: 1,
                venues: { name: 1, city: 1, _id: 1 },
                venueCount: 1,
                teamCount: 1,
                createdAt: 1,
                updatedAt: 1,
                'organizer._id': 1,
                'organizer.name': 1,
                'organizer.email': 1,
            },
        },
        { $sort: { createdAt: -1 } },
        {
            $facet: {
                data: [{ $skip: skip }, { $limit: Number(limit) }],
                totalCount: [{ $count: 'count' }],
                statusCounts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
                participantTotal: [{ $group: { _id: null, total: { $sum: '$teamCount' } } }],
            },
        },
    ];

    const result = await Tournament.aggregate(pipeline);
    const data = result[0].data;
    const total = result[0].totalCount[0]?.count || 0;
    const statusCounts = result[0].statusCounts.reduce((acc, s) => {
        acc[s._id] = s.count;
        return acc;
    }, {});
    const totalParticipants = result[0].participantTotal[0]?.total || 0;

    apiResponse(res, 200, 'Tournaments fetched', {
        tournaments: data,
        pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
        },
        statusCounts,
        totalParticipants,
    });
});
const getById = catchAsync(async (req, res) => {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid tournament id');

    const tournament = await Tournament.findById(id)
        .populate('organizerId', 'name email')
        .populate('venues', 'name city');

    if (!tournament) throw new ApiError(404, 'Tournament not found');

    apiResponse(res, 200, 'Tournament fetched', tournament);
});

const deleteTournament = catchAsync(async (req, res) => {
    const { id } = req.params;

    await Tournament.findOneAndDelete({
        _id: id,
        organizerId: req.user.id,
    });


    apiResponse(res, 200, 'Tournament deleted', { id });
});

module.exports = {
    createTournament,
    getTournament,
    updateTournament,
    deleteTournament,
    list,
    getById,
};