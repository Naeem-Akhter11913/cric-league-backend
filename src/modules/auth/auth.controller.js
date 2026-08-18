// const authService = require('./auth.service');
// const catchAsync = require('../../utils/catchAsync');
// const apiResponse = require('../../utils/apiResponse');

// const register = catchAsync(async (req, res) => {
//   const { user, accessToken, refreshToken } = await authService.register(req.body);
//   apiResponse(res, 201, 'Registered successfully', {
//     user: {
//       id: user._id,
//       name: user.name,
//       email: user.email,
//       role: user.role,
//       status: user.status
//     },
//     accessToken,
//     refreshToken,
//   });
// });

// const login = catchAsync(async (req, res) => {
//   const { user, accessToken, refreshToken } = await authService.login(req.body);
//   apiResponse(res, 200, 'Login successful', {
//     user: {
//       id: user._id,
//       name: user.name,
//       email: user.email,
//       role: user.role,
//       status: user.status
//     },
//     accessToken,
//     refreshToken,
//   });
// });

// const refresh = catchAsync(async (req, res) => {
//   const tokens = await authService.refresh(req.body.refreshToken);
//   apiResponse(res, 200, 'Token refreshed', tokens);
// });

// const logout = catchAsync(async (req, res) => {
//   await authService.logout(req.user.id, req.body.refreshToken);
//   apiResponse(res, 200, 'Logged out successfully');
// });

// module.exports = { register, login, refresh, logout };



const authService = require('./auth.service');
const catchAsync = require('../../utils/catchAsync');
const apiResponse = require('../../utils/apiResponse');

const REFRESH_COOKIE_NAME = 'refreshToken';
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production', // false in local dev over http, true in prod over https
  sameSite: 'strict',
  path: '/api/v1/auth',                            // only sent back to auth routes
  maxAge: 7 * 24 * 60 * 60 * 1000,                  // 7 days — keep in sync with JWT_REFRESH_EXPIRES_IN
};

const register = catchAsync(async (req, res) => {
  console.log(req.body)
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  // res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
  apiResponse(res, 201, 'Registered successfully', {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    },
    // accessToken,
    // refreshToken removed from the JSON body — it now lives only in the httpOnly cookie
  });
});

const login = catchAsync(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions);
  apiResponse(res, 200, 'Login successful', {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    },
    accessToken,
  });
});

const refresh = catchAsync(async (req, res) => {
  try {
    const refreshToken = req.cookies[REFRESH_COOKIE_NAME];
    const tokens = await authService.refresh(refreshToken);
    res.cookie(REFRESH_COOKIE_NAME, tokens.refreshToken, cookieOptions); // rotate: set the new one back 
    apiResponse(res, 200, 'Token refreshed', { accessToken: tokens.accessToken });
  } catch (error) {
    console.log(error);
  }
});

const logout = catchAsync(async (req, res) => {
  const refreshToken = req.cookies[REFRESH_COOKIE_NAME];
  await authService.logout(req.user.id, refreshToken);
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
  apiResponse(res, 200, 'Logged out successfully');
});

module.exports = { register, login, refresh, logout };