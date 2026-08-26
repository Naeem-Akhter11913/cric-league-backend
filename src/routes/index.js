const express = require('express');

const router = express.Router();

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/players', require('../modules/player/player.routes'));
router.use('/teams', require('../modules/team/team.routes'));

// Remaining modules follow the same pattern once fleshed out:
// router.use('/tournaments', require('../modules/tournament/tournament.routes'));
// router.use('/matches', require('../modules/match/match.routes'));
// router.use('/scoring', require('../modules/scoring/scoring.routes'));
// router.use('/venues', require('../modules/venue/venue.routes'));
// router.use('/stats', require('../modules/stats/stats.routes'));
// router.use('/points-table', require('../modules/pointsTable/pointsTable.routes'));
// router.use('/admin', require('../modules/superAdmin/superAdmin.routes'));
router.use('/organizer', require('../modules/organizer/organizer.routes'));
// router.use('/notifications', require('../modules/notification/notification.routes'));

router.get('/health', (req, res) => res.json({ success: true, message: 'API is healthy' }));

module.exports = router;
