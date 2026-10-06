const express = require('express');
const controller = require('./team.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../utils/constants');

const router = express.Router();

router.post('/', authenticate, authorize([ROLES.ORGANIZER]), controller.createTeam);
router.get('/', authenticate , controller.list);
router.get('/:id', controller.getById);
router.patch('/:id', authenticate, authorize([ROLES.ORGANIZER]), controller.updateTeam);
router.post('/:id/players', authenticate, authorize([ROLES.ORGANIZER]), controller.addPlayer);
router.get('/:id/players', authenticate, controller.listPlayers);
// router.delete('/:id/players', authenticate, controller.deleteTeam);
// router.get('/teams/stats', authenticate, authorize('organizer'), controller.stats);


// team.routes.js: static paths before '/:id'
router.get('/stats', authenticate, authorize([ROLES.ORGANIZER]), controller.stats);
router.delete('/:id', authenticate, authorize([ROLES.ORGANIZER]), controller.deleteTeam);

module.exports = router;
