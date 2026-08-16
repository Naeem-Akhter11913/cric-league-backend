const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User } = require('../../models');
const env = require('../../config/env');
const ApiError = require('../../utils/apiError');

function generateTokens(user) {
  const accessToken = jwt.sign({ sub: user._id, role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
  const refreshToken = jwt.sign({ sub: user._id }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
  return { accessToken, refreshToken };
}

async function register({ name, email, password, phone, role }) {
  const existing = await User.findOne({ email });
  if (existing) throw new ApiError(409, 'Email already registered');

  const passwordHash = await bcrypt.hash(password, 10);

  // Roles that require approval before they can act (organizer, scorer, team_manager)
  const status = role === 'player' ? 'approved' : 'pending';

  const user = await User.create({ name, email, phone, passwordHash, role, status });

  const tokens = generateTokens(user);
  user.refreshTokens.push(tokens.refreshToken);
  await user.save();

  return { user, ...tokens };
}

async function login({ email, password }) {
  const user = await User.findOne({ email });
  if (!user) throw new ApiError(401, 'Invalid email or password');

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw new ApiError(401, 'Invalid email or password');

  if (user.status === 'suspended') throw new ApiError(403, 'Account suspended');

  const tokens = generateTokens(user);
  user.refreshTokens.push(tokens.refreshToken);
  await user.save();

  return { user, ...tokens };
}

async function refresh(refreshToken) {
  let payload;
  try {
    // console.log(refreshToken);
    payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.refreshTokens.includes(refreshToken)) {
    throw new ApiError(401, 'Refresh token not recognized');
  }

  // rotate refresh token
  user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
  const tokens = generateTokens(user);
  user.refreshTokens.push(tokens.refreshToken);
  await user.save();

  return tokens;
}

async function logout(userId, refreshToken) {
  await User.updateOne({ _id: userId }, { $pull: { refreshTokens: refreshToken } });
}

module.exports = { register, login, refresh, logout, generateTokens };
