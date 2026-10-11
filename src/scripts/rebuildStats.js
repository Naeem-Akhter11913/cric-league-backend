// scripts/rebuildStats.js
require('dotenv').config();
const mongoose = require('mongoose');
const { registerMatchTeams, recomputeAfterMatch } = require('../modules/scoring/stats.service');
const { Match } = require('../models');


(async () => {
  await mongoose.connect("mongodb+srv://user123:mongodb1234@cluster0.vkrc1bu.mongodb.net/cric_league");   // use the same variable as your server
  const all = await Match.find({ status: { $ne: 'cancelled' } });
  for (const m of all) await registerMatchTeams(m);                      // squad, points table and team stats rows
  for (const m of all.filter((x) => x.status === 'completed')) await recomputeAfterMatch(m);
  console.log('Done:', all.length, 'matches');
  process.exit(0);
})();