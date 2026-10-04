const route = require('express');
const authenticate = require('../../middlewares/auth.middleware');
const authorize = require('../../middlewares/rbac.middleware');
const { options, stats, list, create, cancel, update } = require('./match.controller');

const router = route.Router();


router.get('/options', authenticate, authorize('organizer'), options);
router.get('/stats', authenticate, authorize('organizer'), stats);
router.get('/', authenticate, authorize('organizer'), list);
router.post('/', authenticate, authorize('organizer'), create);
router.patch('/:id/cancel', authenticate, authorize('organizer'), cancel);
router.patch('/:id', authenticate, authorize('organizer'), update);


module.exports = router;