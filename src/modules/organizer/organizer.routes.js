const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../utils/constants');
const controller = require('./organizer.controller')

const router = express.Router();

// router.post('/', authenticate, authorize([ROLES.PLAYER]), controller.createProfile);
// router.get('/me', authenticate, authorize([ROLES.PLAYER]), controller.getMyProfile);
// router.patch('/me', authenticate, authorize([ROLES.PLAYER]), controller.updateMyProfile);
router.get('/', authenticate, controller.list);
// router.post('/players', authenticate , controller.createPlayer)
// router.get('/:id', controller.getById);

router.get('/players/stats', authenticate, authorize('organizer'), controller.playerStats);
router.get('/players', authenticate, authorize('organizer'), controller.listPlayers);
router.post('/players', authenticate, authorize('organizer'), controller.createPlayer);
router.delete('/players/:id', authenticate, authorize('organizer'), controller.removePlayer);

module.exports = router;