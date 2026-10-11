const { Match, Innings, Ball, PlayingXI, Player, Team, TeamStats, PointsTable } = require('../../models');

const BOWLER_CREDIT = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'];

const sid = (v) => (v ? String(v && v._id ? v._id : v) : null);
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;
const oversText = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
const isLegal = (b) => b.extraType !== 'wide' && b.extraType !== 'no_ball';
// cmp(x, a) < 0 means x is better than a
const best = (arr, cmp) => arr.reduce((a, x) => (!a || cmp(x, a) < 0 ? x : a), null);
const slice = (name, value, color, total) => ({
  name, value, color, pct: total ? `${((value / total) * 100).toFixed(1)}%` : '0%',
});

async function computeStatistics(tid) {
  const matches = await Match.find({ tournamentId: tid, status: 'completed' })
    .select('matchNumber teamA teamB result').sort({ matchNumber: 1 }).lean();
  const matchIds = matches.map((m) => m._id);

  const [abandoned, innings, balls, xis, teamStats, points] = await Promise.all([
    Match.countDocuments({ tournamentId: tid, status: 'abandoned' }),
    Innings.find({ matchId: { $in: matchIds } })
      .select('matchId inningsNumber battingTeam bowlingTeam totalRuns totalWickets legalBalls endReason').lean(),
    Ball.find({ matchId: { $in: matchIds } })
      .select('inningsId striker bowler runs extraType extraRuns isWicket wicket').lean(),
    PlayingXI.find({ matchId: { $in: matchIds } }).select('teamId players').lean(),
    TeamStats.find({ tournamentId: tid }).populate('teamId', 'name logoUrl').lean(),
    PointsTable.find({ tournamentId: tid }).lean(),
  ]);

  /* ---------- names ---------- */
  const teamIds = [...new Set(matches.flatMap((m) => [sid(m.teamA), sid(m.teamB)]))];
  const teamDocs = await Team.find({ _id: { $in: teamIds } }).select('name logoUrl').lean();
  const team = new Map(teamDocs.map((t) => [sid(t._id), { _id: sid(t._id), name: t.name, logoUrl: t.logoUrl }]));
  const tn = (id) => team.get(sid(id))?.name || 'Team';

  const info = new Map();                       // playerId -> { teamId, name, avatarUrl }
  const appearances = new Map();
  xis.forEach((xi) =>
    xi.players.forEach((p) => {
      const k = sid(p);
      appearances.set(k, (appearances.get(k) || 0) + 1);
      info.set(k, { teamId: sid(xi.teamId) });
    })
  );
  const pDocs = await Player.find({ _id: { $in: [...info.keys()] } }).select('userId')
    .populate('userId', 'name avatarUrl').lean();
  pDocs.forEach((p) => {
    const i = info.get(sid(p._id));
    i.name = p.userId?.name || 'Unknown';
    i.avatarUrl = p.userId?.avatarUrl;
  });
  const who = (id) => ({
    id, name: info.get(id)?.name || 'Unknown', avatarUrl: info.get(id)?.avatarUrl,
    team: team.get(info.get(id)?.teamId) || null,
  });

  const inningsById = new Map(innings.map((i) => [sid(i._id), i]));

  /* ---------- one pass over every ball ---------- */
  const bat = new Map();       // inningsId|batter  -> one batting innings
  const bowl = new Map();      // inningsId|bowler  -> one bowling spell
  const field = new Map();     // player -> { catches, runOuts, stumpings }
  const comp = { fours: 0, sixes: 0, running: 0, extras: 0, fourCount: 0, sixCount: 0 };
  const wk = { bowled: 0, caught: 0, lbw: 0, others: 0 };

  const batEntry = (iid, player) => {
    const k = `${iid}|${player}`;
    if (!bat.has(k)) bat.set(k, { inningsId: iid, player, runs: 0, balls: 0, fours: 0, sixes: 0, out: false });
    return bat.get(k);
  };

  balls.forEach((b) => {
    const iid = sid(b.inningsId);

    const s = batEntry(iid, sid(b.striker));
    if (b.extraType !== 'wide') s.balls += 1;
    if (!b.extraType || b.extraType === 'no_ball') {
      s.runs += b.runs;
      if (b.runs === 4) { s.fours += 1; comp.fours += 4; comp.fourCount += 1; }
      else if (b.runs === 6) { s.sixes += 1; comp.sixes += 6; comp.sixCount += 1; }
      else comp.running += b.runs;
    }
    comp.extras += b.extraRuns;

    const bk = `${iid}|${sid(b.bowler)}`;
    if (!bowl.has(bk)) bowl.set(bk, { inningsId: iid, player: sid(b.bowler), wickets: 0, runs: 0, legal: 0 });
    const bw = bowl.get(bk);
    if (isLegal(b)) bw.legal += 1;
    bw.runs += b.runs + (b.extraType === 'wide' || b.extraType === 'no_ball' ? b.extraRuns : 0);

    if (b.isWicket && b.wicket?.type) {
      if (b.wicket.playerOut) batEntry(iid, sid(b.wicket.playerOut)).out = true;
      if (BOWLER_CREDIT.includes(b.wicket.type)) bw.wickets += 1;
      wk[['bowled', 'caught', 'lbw'].includes(b.wicket.type) ? b.wicket.type : 'others'] += 1;

      if (b.wicket.fielder) {
        const f = field.get(sid(b.wicket.fielder)) || { catches: 0, runOuts: 0, stumpings: 0 };
        if (b.wicket.type === 'caught') f.catches += 1;
        if (b.wicket.type === 'run_out') f.runOuts += 1;
        if (b.wicket.type === 'stumped') f.stumpings += 1;
        field.set(sid(b.wicket.fielder), f);
      }
    }
  });

  /* ---------- per-player totals ---------- */
  const P = new Map();
  const acc = (id) => {
    if (!P.has(id)) {
      P.set(id, {
        innings: 0, runs: 0, balls: 0, fours: 0, sixes: 0, dismissals: 0, hundreds: 0, fifties: 0, hs: null,
        bowlBalls: 0, bowlRuns: 0, wickets: 0, bestFig: null, catches: 0, runOuts: 0, stumpings: 0,
      });
    }
    return P.get(id);
  };

  bat.forEach((e) => {
    if (e.balls === 0 && !e.out) return;
    const p = acc(e.player);
    p.innings += 1; p.runs += e.runs; p.balls += e.balls; p.fours += e.fours; p.sixes += e.sixes;
    if (e.out) p.dismissals += 1;
    if (e.runs >= 100) p.hundreds += 1; else if (e.runs >= 50) p.fifties += 1;
    if (!p.hs || e.runs > p.hs.runs) p.hs = { runs: e.runs, notOut: !e.out };
  });
  bowl.forEach((e) => {
    const p = acc(e.player);
    p.bowlBalls += e.legal; p.bowlRuns += e.runs; p.wickets += e.wickets;
    if (!p.bestFig || e.wickets > p.bestFig.wickets || (e.wickets === p.bestFig.wickets && e.runs < p.bestFig.runs)) {
      p.bestFig = { wickets: e.wickets, runs: e.runs };
    }
  });
  field.forEach((f, id) => Object.assign(acc(id), f));

  const base = (id) => ({ ...who(id), matches: appearances.get(id) || 0 });

  const batting = [...P.entries()]
    .filter(([, p]) => p.innings > 0)
    .map(([id, p]) => ({
      ...base(id),
      innings: p.innings, runs: p.runs, balls: p.balls, fours: p.fours, sixes: p.sixes,
      average: p.dismissals ? r2(p.runs / p.dismissals) : null,
      strikeRate: p.balls ? r1((p.runs / p.balls) * 100) : 0,
      hundreds: p.hundreds, fifties: p.fifties,
      highest: p.hs ? `${p.hs.runs}${p.hs.notOut ? '*' : ''}` : '–',
    }))
    .sort((a, b) => b.runs - a.runs || b.strikeRate - a.strikeRate);

  const bowling = [...P.entries()]
    .filter(([, p]) => p.bowlBalls > 0 || p.bowlRuns > 0)
    .map(([id, p]) => ({
      ...base(id),
      overs: oversText(p.bowlBalls), wickets: p.wickets, runs: p.bowlRuns,
      economy: p.bowlBalls ? r2(p.bowlRuns / (p.bowlBalls / 6)) : 0,
      average: p.wickets ? r2(p.bowlRuns / p.wickets) : null,
      best: p.bestFig ? `${p.bestFig.wickets}/${p.bestFig.runs}` : '–',
    }))
    .sort((a, b) => b.wickets - a.wickets || a.economy - b.economy);

  const fielding = [...P.entries()]
    .filter(([, p]) => p.catches + p.runOuts + p.stumpings > 0)
    .map(([id, p]) => ({
      ...base(id),
      catches: p.catches, runOuts: p.runOuts, stumpings: p.stumpings,
      total: p.catches + p.runOuts + p.stumpings,
    }))
    .sort((a, b) => b.total - a.total || b.catches - a.catches);

  /* ---------- records ---------- */
  const oppOf = (iid, side) => tn(inningsById.get(iid)?.[side]);

  const hi = best(innings, (x, a) => a.totalRuns - x.totalRuns);
  const lo = best(
    innings.filter((i) => i.endReason !== 'target_chased' && i.legalBalls > 0),
    (x, a) => x.totalRuns - a.totalRuns
  );
  const topScore = best([...bat.values()].filter((e) => e.balls > 0), (x, a) => (x.runs !== a.runs ? a.runs - x.runs : x.balls - a.balls));
  const topSpell = best([...bowl.values()].filter((e) => e.wickets > 0), (x, a) => (x.wickets !== a.wickets ? a.wickets - x.wickets : x.runs - a.runs));
  const topSixes = best([...bat.values()].filter((e) => e.sixes > 0), (x, a) => a.sixes - x.sixes);
  const topCatch = best([...P.entries()].filter(([, p]) => p.catches > 0), (x, a) => a[1].catches - x[1].catches);

  const records = {
    highestTeamTotal: hi && { value: `${hi.totalRuns}/${hi.totalWickets}`, sub: tn(hi.battingTeam), sub2: `vs ${tn(hi.bowlingTeam)}` },
    lowestTeamTotal: lo && { value: `${lo.totalRuns}`, sub: tn(lo.battingTeam), sub2: `vs ${tn(lo.bowlingTeam)}` },
    highestScore: topScore && {
      value: `${topScore.runs}${topScore.out ? '' : '*'}`, sub: who(topScore.player).name,
      sub2: `vs ${oppOf(topScore.inningsId, 'bowlingTeam')}`,
    },
    bestBowling: topSpell && {
      value: `${topSpell.wickets}/${topSpell.runs}`, sub: who(topSpell.player).name,
      sub2: `vs ${oppOf(topSpell.inningsId, 'battingTeam')}`,
    },
    mostSixes: topSixes && {
      value: `${topSixes.sixes}`, sub: who(topSixes.player).name,
      sub2: `vs ${oppOf(topSixes.inningsId, 'bowlingTeam')}`,
    },
    mostCatches: topCatch && {
      value: `${topCatch[1].catches}`, sub: who(topCatch[0]).name, sub2: `(${who(topCatch[0]).team?.name || ''})`,
    },
  };

  /* ---------- totals, donuts, trend ---------- */
  const totalRuns = innings.reduce((n, i) => n + i.totalRuns, 0);
  const totalWickets = innings.reduce((n, i) => n + i.totalWickets, 0);
  const wkTotal = wk.bowled + wk.caught + wk.lbw + wk.others;

  const inningsByMatch = new Map();
  innings.forEach((i) => {
    const k = sid(i.matchId);
    if (!inningsByMatch.has(k)) inningsByMatch.set(k, []);
    inningsByMatch.get(k).push(i);
  });

  let wonBat = 0, wonChase = 0, tied = 0, noResult = abandoned;
  matches.forEach((m) => {
    if (m.result?.isNoResult) { noResult += 1; return; }
    if (m.result?.isTie) { tied += 1; return; }
    const first = (inningsByMatch.get(sid(m._id)) || []).find((i) => i.inningsNumber === 1);
    if (first && sid(first.battingTeam) === sid(m.result?.winner)) wonBat += 1; else wonChase += 1;
  });
  const outcomeTotal = matches.length + abandoned;

  const trend = matches
    .map((m) => {
      const inn = inningsByMatch.get(sid(m._id)) || [];
      const runs = inn.reduce((n, i) => n + i.totalRuns, 0);
      const legal = inn.reduce((n, i) => n + i.legalBalls, 0);
      return { match: m.matchNumber, rate: legal ? r2(runs / (legal / 6)) : 0 };
    })
    .filter((x) => x.rate > 0);

  const avgOf = (n) => {
    const arr = innings.filter((i) => i.inningsNumber === n);
    return arr.length ? r1(arr.reduce((s, i) => s + i.totalRuns, 0) / arr.length) : 0;
  };

  /* ---------- team table (TeamStats + PointsTable) ---------- */
  const ptMap = new Map(points.map((p) => [sid(p.teamId), p]));
  const teams = teamStats
    .filter((t) => t.teamId)
    .map((t) => {
      const p = ptMap.get(sid(t.teamId)) || {};
      return {
        team: { _id: sid(t.teamId), name: t.teamId.name, logoUrl: t.teamId.logoUrl },
        matches: t.matchesPlayed || 0, won: p.won || 0, lost: p.lost || 0, tied: p.tied || 0, noResult: p.noResult || 0,
        runsScored: t.totalRunsScored || 0, wicketsTaken: t.totalWicketsTaken || 0, highest: t.highestTeamScore || 0,
        avgScore: t.matchesPlayed ? r1(t.totalRunsScored / t.matchesPlayed) : 0,
        nrr: p.netRunRate || 0,
      };
    })
    .sort((a, b) => b.won - a.won || b.nrr - a.nrr);

  return {
    hasData: matches.length > 0,
    cards: { matches: matches.length, runs: totalRuns, wickets: totalWickets },
    records,
    leaders: { batting, bowling, fielding },
    runsSummary: [
      slice('4s', comp.fours, '#6366F1', totalRuns),
      slice('6s', comp.sixes, '#60A5FA', totalRuns),
      slice('1s, 2s & 3s', comp.running, '#FBBF24', totalRuns),
      slice('Extras', comp.extras, '#34D399', totalRuns),
    ],
    wicketsSummary: [
      slice('Bowled', wk.bowled, '#6366F1', wkTotal),
      slice('Caught', wk.caught, '#60A5FA', wkTotal),
      slice('LBW', wk.lbw, '#FBBF24', wkTotal),
      slice('Others', wk.others, '#34D399', wkTotal),
    ],
    outcomes: [
      slice('Won batting first', wonBat, '#4F46E5', outcomeTotal),
      slice('Won chasing', wonChase, '#0EA5E9', outcomeTotal),
      slice('Tied', tied, '#F59E0B', outcomeTotal),
      slice('No Result', noResult, '#CBD5E1', outcomeTotal),
    ],
    outcomeTotal,
    trend,
    summary: {
      avgFirstInnings: avgOf(1),
      avgSecondInnings: avgOf(2),
      avgRunsPerMatch: matches.length ? r1(totalRuns / matches.length) : 0,
      fours: comp.fourCount,
      sixes: comp.sixCount,
      extras: comp.extras,
    },
    teams,
  };
}

module.exports = { computeStatistics };