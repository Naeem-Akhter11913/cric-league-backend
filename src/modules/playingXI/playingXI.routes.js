const express = require('express');
const authorize = require('../../middlewares/rbac.middleware');
const { get, save, remove, list } = require('./playingXI.controller');
const authenticate = require('../../middlewares/auth.middleware');

const router = express.Router();


router.get('/playing-xi', authenticate, authorize('organizer'), get);
router.post('/playing-xi', authenticate, authorize('organizer'), save);
router.get('/playing-xi/list', authenticate, authorize('organizer'), list);
router.delete('/playing-xi/:id', authenticate, authorize('organizer'), remove);

module.exports = router;