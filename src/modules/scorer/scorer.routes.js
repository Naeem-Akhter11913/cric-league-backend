const express = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const { ROLES } = require('../../utils/constants');
const c = require('./scorer.controller');

const router = express.Router();
const guard = [authenticate, authorize([ROLES.ORGANIZER])];

router.get('/overview', guard, c.overview);
router.get('/', guard, c.list);
router.post('/', guard, c.create);
router.patch('/:id', guard, c.update);
router.delete('/:id', guard, c.remove);

module.exports = router;