// const express = require('express');
// const controller = require('./auth.controller');
// const validate = require('../../middlewares/validate.middleware');
// const authenticate = require('../../middlewares/auth.middleware');
// const { registerSchema, loginSchema, refreshSchema } = require('./auth.validation');
// const { authLimiter } = require('../../middlewares/rateLimiter.middleware');

// const router = express.Router();

// router.post('/register', authLimiter, validate(registerSchema), controller.register);
// router.post('/login', authLimiter, validate(loginSchema), controller.login);
// router.post('/refresh', validate(refreshSchema), controller.refresh);
// router.post('/logout', authenticate, controller.logout);

// module.exports = router;



const express = require('express');
const controller = require('./auth.controller');
const validate = require('../../middlewares/validate.middleware');
const authenticate = require('../../middlewares/auth.middleware');
const { registerSchema, loginSchema } = require('./auth.validation');
const { authLimiter } = require('../../middlewares/rateLimiter.middleware');

const router = express.Router();

router.post('/register', authLimiter, validate(registerSchema), controller.register);
router.post('/login', authLimiter, validate(loginSchema), controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', authenticate, controller.logout);

module.exports = router;