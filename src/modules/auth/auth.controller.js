const authService = require('./auth.service');
const catchAsync = require('../../utils/catchAsync');
const apiResponse = require('../../utils/apiResponse');

const register = catchAsync(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  apiResponse(res, 201, 'Registered successfully', {
    user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status },
    accessToken,
    refreshToken,
  });
});

const login = catchAsync(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  apiResponse(res, 200, 'Login successful', {
    user: { id: user._id, name: user.name, email: user.email, role: user.role, status: user.status },
    accessToken,
    refreshToken,
  });
});

const refresh = catchAsync(async (req, res) => {
  const tokens = await authService.refresh(req.body.refreshToken);
  apiResponse(res, 200, 'Token refreshed', tokens);
});

const logout = catchAsync(async (req, res) => {
  await authService.logout(req.user.id, req.body.refreshToken);
  apiResponse(res, 200, 'Logged out successfully');
});

module.exports = { register, login, refresh, logout };
