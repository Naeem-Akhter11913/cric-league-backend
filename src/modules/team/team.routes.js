const express = require('express');
const controller = require('./team.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../utils/constants');

const router = express.Router();

router.post('/', authenticate, authorize([ROLES.ORGANIZER]), controller.createTeam);
// router.post('/', authenticate, authorize([ROLES.TEAM_MANAGER]), controller.createTeam);
router.get('/', authenticate , controller.list);
router.get('/:id', controller.getById);
router.patch('/:id', authenticate, authorize([ROLES.TEAM_MANAGER]), controller.updateTeam);
router.post('/:id/players', authenticate, authorize([ROLES.TEAM_MANAGER]), controller.addPlayer);
router.get('/:id/players', controller.listPlayers);

module.exports = router;
