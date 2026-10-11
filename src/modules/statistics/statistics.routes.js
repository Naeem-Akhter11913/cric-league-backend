const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../utils/constants');
const c = require('./statistics.controller');

const router = express.Router();
router.get('/', authenticate, authorize([ROLES.ORGANIZER]), c.overview);

module.exports = router;