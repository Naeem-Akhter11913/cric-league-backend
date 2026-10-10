const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../utils/constants');
const c = require('./scoring.controller');

const router = express.Router();
const guard = [authenticate, authorize([ROLES.ORGANIZER, ROLES.SCORER])];

router.get('/my-matches', guard, c.myMatches);
router.get('/:matchId/state', guard, c.state);
router.post('/:matchId/toss', guard, c.toss);
router.post('/:matchId/innings/start', guard, c.startInnings);
router.post('/:matchId/batter', guard, c.selectBatter);
router.post('/:matchId/bowler', guard, c.selectBowler);
router.post('/:matchId/ball', guard, c.recordBall);
router.delete('/:matchId/ball/last', guard, c.undo);

module.exports = router;