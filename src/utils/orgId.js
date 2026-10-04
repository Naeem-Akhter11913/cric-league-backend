const mongoose = require('mongoose');

const orgIdOf = (req) => {
  const raw = req.user?._id ?? req.user?.id ?? req.user?.userId ?? req.userId;
  if (!raw || !mongoose.isValidObjectId(String(raw))) {
    throw new Error('Could not read the logged-in user id from req.user');
  }
  return new mongoose.Types.ObjectId(String(raw));
};

module.exports = { orgIdOf };