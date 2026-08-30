const express = require('express');
const controller = require('./tournament.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../utils/constants');

const router = express.Router();

router.post('/', authenticate, authorize([ROLES.ORGANIZER]), controller.createTournament);
router.get('/single', authenticate, authorize([ROLES.ORGANIZER]), controller.getTournament);
router.patch('/', authenticate, authorize([ROLES.ORGANIZER]), controller.updateTournament);
router.delete('/:id', authenticate, authorize([ROLES.ORGANIZER]), controller.deleteTournament);
router.get('/', authenticate, controller.list);
router.get('/:id', controller.getById);

module.exports = router;
