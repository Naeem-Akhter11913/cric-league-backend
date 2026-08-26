const express = require('express');
const controller = require('./player.controller');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../utils/constants');

const router = express.Router();

router.post('/', authenticate, authorize([ROLES.PLAYER]), controller.createProfile);
router.get('/me', authenticate, authorize([ROLES.PLAYER]), controller.getMyProfile);
router.patch('/me', authenticate, authorize([ROLES.PLAYER]), controller.updateMyProfile);
router.get('/', authenticate, controller.list);
router.get('/:id', controller.getById);

module.exports = router;
