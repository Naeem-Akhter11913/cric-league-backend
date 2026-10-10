const mongoose = require('mongoose');
const {
  Match, Innings, Ball, PlayingXI, PointsTable, TeamStats, PlayerStats, TournamentSquad, Scorer,
} = require('../../models');

const POINTS = { win: 2, tie: 1, noResult: 1 };               // change the points rules here
const BOWLER_CREDIT = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'];
const MIN_ENTERED_FOR_ACCURACY = 30;                           // below 5 overs an accuracy % means nothing

const sid = (v) => (v ? String(v && v._id ? v._id : v) : null);
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const oversNotation = (balls) => Number(`${Math.floor(balls / 6)}.${balls % 6}`);   // 87 balls -> 14.3

/* ---------------- when a match is scheduled ---------------- */

async function registerMatchTeams(match) {
  const xis = await PlayingXI.find({ matchId: match._id }).select('teamId players substitutes').lean();

  for (const teamId of [match.teamA, match.teamB]) {
    const xi = xis.find((x) => sid(x.teamId) === sid(teamId));
    const ids = xi ? [...xi.players, ...(xi.substitutes || [])] : [];

    await Promise.all([
      TournamentSquad.updateOne(
        { tournamentId: match.tournamentId, teamId },
        { $setOnInsert: { approvalStatus: 'approved' }, $addToSet: { players: { $each: ids } } },
        { upsert: true }
      ),
      PointsTable.updateOne({ tournamentId: match.tournamentId, teamId }, { $setOnInsert: { played: 0 } }, { upsert: true }),
      TeamStats.updateOne({ teamId, tournamentId: match.tournamentId }, { $setOnInsert: { matchesPlayed: 0 } }, { upsert: true }),
      TeamStats.updateOne({ teamId, tournamentId: null }, { $setOnInsert: { matchesPlayed: 0 } }, { upsert: true }),
    ]);
  }
}

/* ---------------- team numbers (points table + team stats) ---------------- */

async function computeTeam(teamId, tournamentId) {
  const T = sid(teamId);
  const filter = {
    status: { $in: ['completed', 'abandoned'] },
    $or: [{ teamA: teamId }, { teamB: teamId }],
  };
  if (tournamentId) filter.tournamentId = tournamentId;

  const matches = await Match.find(filter).select('overs status result').lean();
  const innings = matches.length
    ? await Innings.find({ matchId: { $in: matches.map((m) => m._id) } })
        .select('matchId battingTeam totalRuns totalWickets legalBalls endReason').lean()
    : [];
  const byMatch = new Map();
  innings.forEach((i) => {
    const k = sid(i.matchId);
    if (!byMatch.has(k)) byMatch.set(k, []);
    byMatch.get(k).push(i);
  });

  // an all-out innings counts as the full quota of overs for net run rate
  const ballsFaced = (i, m) => (i.endReason === 'all_out' ? m.overs * 6 : i.legalBalls);

  let played = 0, won = 0, lost = 0, tied = 0, noResult = 0;
  let runsFor = 0, ballsFor = 0, runsAgainst = 0, ballsAgainst = 0;
  let wicketsTaken = 0, highest = 0;

  matches.forEach((m) => {
    played += 1;
    if (m.status === 'abandoned' || m.result?.isNoResult) { noResult += 1; return; }
    if (m.result?.isTie) tied += 1;
    else if (sid(m.result?.winner) === T) won += 1;
    else lost += 1;

    const inn = byMatch.get(sid(m._id)) || [];
    const mine = inn.find((i) => sid(i.battingTeam) === T);
    const theirs = inn.find((i) => sid(i.battingTeam) !== T);
    if (mine) {
      runsFor += mine.totalRuns;
      ballsFor += ballsFaced(mine, m);
      highest = Math.max(highest, mine.totalRuns);
    }
    if (theirs) {
      runsAgainst += theirs.totalRuns;
      ballsAgainst += ballsFaced(theirs, m);
      wicketsTaken += theirs.totalWickets;
    }
  });

  const netRunRate =
    ballsFor && ballsAgainst ? round(runsFor / (ballsFor / 6) - runsAgainst / (ballsAgainst / 6), 3) : 0;

  return {
    points: { played, won, lost, tied, noResult, points: won * POINTS.win + tied * POINTS.tie + noResult * POINTS.noResult, netRunRate },
    stats: {
      matchesPlayed: won + lost + tied,
      wins: won,
      losses: lost,
      totalRunsScored: runsFor,
      totalWicketsTaken: wicketsTaken,
      highestTeamScore: highest,
    },
  };
}

/* ---------------- player numbers ---------------- */

async function computePlayers(playerIds, tournamentId) {
  const mFilter = { status: 'completed' };
  if (tournamentId) mFilter.tournamentId = tournamentId;
  const matchIds = (await Match.find(mFilter).select('_id').lean()).map((m) => m._id);
  const out = new Map();
  if (!matchIds.length) return out;

  const [balls, xis] = await Promise.all([
    Ball.find({
      matchId: { $in: matchIds },
      $or: [{ striker: { $in: playerIds } }, { bowler: { $in: playerIds } }, { 'wicket.fielder': { $in: playerIds } }],
    }).select('matchId striker bowler runs extraType extraRuns isWicket wicket').lean(),
    PlayingXI.find({ matchId: { $in: matchIds }, players: { $in: playerIds } }).select('players').lean(),
  ]);

  const want = new Set(playerIds.map(sid));
  const get = (id) => {
    const k = sid(id);
    if (!out.has(k)) {
      out.set(k, {
        matches: 0, runs: 0, ballsFaced: 0, wickets: 0, ballsBowled: 0, runsConceded: 0,
        catches: 0, runOuts: 0, perMatchRuns: new Map(), perMatchBowl: new Map(),
      });
    }
    return out.get(k);
  };

  xis.forEach((xi) => xi.players.forEach((p) => { if (want.has(sid(p))) get(p).matches += 1; }));

  balls.forEach((b) => {
    const mid = sid(b.matchId);
    const legal = b.extraType !== 'wide' && b.extraType !== 'no_ball';

    if (want.has(sid(b.striker))) {
      const s = get(b.striker);
      if (b.extraType !== 'wide') s.ballsFaced += 1;
      if (!b.extraType || b.extraType === 'no_ball') {
        s.runs += b.runs;
        s.perMatchRuns.set(mid, (s.perMatchRuns.get(mid) || 0) + b.runs);
      }
    }
    if (want.has(sid(b.bowler))) {
      const bw = get(b.bowler);
      if (legal) bw.ballsBowled += 1;
      const conceded = b.runs + (b.extraType === 'wide' || b.extraType === 'no_ball' ? b.extraRuns : 0);
      bw.runsConceded += conceded;
      const pm = bw.perMatchBowl.get(mid) || { wickets: 0, runs: 0 };
      pm.runs += conceded;
      if (b.isWicket && BOWLER_CREDIT.includes(b.wicket?.type)) { bw.wickets += 1; pm.wickets += 1; }
      bw.perMatchBowl.set(mid, pm);
    }
    if (b.isWicket && b.wicket?.fielder && want.has(sid(b.wicket.fielder))) {
      const f = get(b.wicket.fielder);
      if (b.wicket.type === 'caught') f.catches += 1;
      if (b.wicket.type === 'run_out') f.runOuts += 1;
    }
  });

  out.forEach((s) => {
    s.highestScore = Math.max(0, ...s.perMatchRuns.values());
    let best = null;
    s.perMatchBowl.forEach((pm) => {
      if (!best || pm.wickets > best.wickets || (pm.wickets === best.wickets && pm.runs < best.runs)) best = pm;
    });
    s.bestBowling = best && best.wickets > 0 ? `${best.wickets}/${best.runs}` : null;
  });
  return out;
}

const playerRow = (s = {}) => ({
  matches: s.matches || 0,
  runs: s.runs || 0,
  ballsFaced: s.ballsFaced || 0,
  wickets: s.wickets || 0,
  ballsBowled: s.ballsBowled || 0,
  oversBowled: oversNotation(s.ballsBowled || 0),
  runsConceded: s.runsConceded || 0,
  catches: s.catches || 0,
  runOuts: s.runOuts || 0,
  highestScore: s.highestScore || 0,
  bestBowling: s.bestBowling ?? null,
});

async function writePlayers(playerIds, tournamentId) {
  if (!playerIds.length) return;
  const stats = await computePlayers(playerIds, tournamentId);
  await PlayerStats.bulkWrite(
    playerIds.map((id) => ({
      updateOne: {
        filter: { playerId: id, tournamentId: tournamentId || null },
        update: { $set: playerRow(stats.get(sid(id))) },
        upsert: true,
      },
    }))
  );
}

/* ---------------- scorer numbers ---------------- */

async function recomputeScorer(scorerUserId) {
  if (!scorerUserId) return;
  const uid = new mongoose.Types.ObjectId(String(scorerUserId));
  const profile = await Scorer.findOne({ userId: uid }).select('ballsUndone').lean();
  if (!profile) return;                                         // an organizer scoring their own match has no scorer profile

  const [matchesScored, ballsRecorded] = await Promise.all([
    Match.countDocuments({ scorerId: uid, status: 'completed' }),
    Ball.countDocuments({ recordedBy: uid }),
  ]);
  const undone = profile.ballsUndone || 0;
  const entered = ballsRecorded + undone;                       // every ball they ever entered, including undone ones

  await Scorer.updateOne(
    { userId: uid },
    {
      $set: {
        matchesScored,
        ballsRecorded,
        accuracy: entered >= MIN_ENTERED_FOR_ACCURACY ? round((1 - undone / entered) * 100, 1) : null,
        lastScoredAt: new Date(),
      },
    }
  );
}

/* ---------------- when a match completes (or is re-opened by undo) ---------------- */

async function recomputeAfterMatch(match) {
  const xis = await PlayingXI.find({ matchId: match._id }).select('players').lean();
  const playerIds = [...new Set(xis.flatMap((x) => x.players.map(sid)))];

  for (const teamId of [match.teamA, match.teamB]) {
    const inTournament = await computeTeam(teamId, match.tournamentId);
    await PointsTable.updateOne(
      { tournamentId: match.tournamentId, teamId },
      { $set: inTournament.points },
      { upsert: true }
    );
    await TeamStats.updateOne({ teamId, tournamentId: match.tournamentId }, { $set: inTournament.stats }, { upsert: true });

    const overall = await computeTeam(teamId, null);
    await TeamStats.updateOne({ teamId, tournamentId: null }, { $set: overall.stats }, { upsert: true });
  }

  await writePlayers(playerIds, match.tournamentId);   // this tournament
  await writePlayers(playerIds, null);                 // career
  await recomputeScorer(match.scorerId);
}

module.exports = { registerMatchTeams, recomputeAfterMatch };