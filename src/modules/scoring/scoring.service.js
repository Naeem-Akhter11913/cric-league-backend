const { Match, Innings, Ball, PlayingXI, Team, Scorer } = require('../../models');
const ApiError = require('../../utils/apiError');
const mongoose = require('mongoose');
const { recomputeAfterMatch } = require('./stats.service');

const EXTRA_TYPES = ['wide', 'no_ball', 'bye', 'leg_bye'];
const WICKET_TYPES = ['bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'other'];
const ALLOWED_ON_EXTRA = { wide: ['stumped', 'run_out', 'hit_wicket'], no_ball: ['run_out'] };
const BOWLER_CREDIT = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'];
const STRIKER_ONLY = ['bowled', 'caught', 'lbw', 'stumped', 'hit_wicket'];

const sid = (v) => (v ? String(v && v._id ? v._id : v) : null);
const oversText = (legal) => `${Math.floor(legal / 6)}.${legal % 6}`;
const r1 = (n) => Math.round(n * 10) / 10;
const r2 = (n) => Math.round(n * 100) / 100;

/* ------------------------------------------------------------------ */
/* Replay: everything about an innings, derived from its ball log     */
/* ------------------------------------------------------------------ */

function replay(balls) {
    const bat = new Map();
    const bowl = new Map();
    const extras = { wides: 0, noBalls: 0, byes: 0, legByes: 0 };
    const fow = [];
    let runs = 0, wickets = 0, legal = 0;

    const batter = (id) => {
        const k = sid(id);
        if (!bat.has(k)) bat.set(k, { runs: 0, balls: 0, fours: 0, sixes: 0, out: null });
        return bat.get(k);
    };
    const bowler = (id) => {
        const k = sid(id);
        if (!bowl.has(k)) bowl.set(k, { legalBalls: 0, runs: 0, wickets: 0 });
        return bowl.get(k);
    };

    balls.forEach((b) => {
        const isLegal = b.extraType !== 'wide' && b.extraType !== 'no_ball';
        runs += b.runs + b.extraRuns;

        const s = batter(b.striker);
        batter(b.nonStriker);
        const bw = bowler(b.bowler);

        if (b.extraType !== 'wide') s.balls += 1;                 // a wide is not a ball faced
        if (!b.extraType || b.extraType === 'no_ball') {          // byes never count to the batter
            s.runs += b.runs;
            if (b.runs === 4) s.fours += 1;
            if (b.runs === 6) s.sixes += 1;
        }

        if (isLegal) { legal += 1; bw.legalBalls += 1; }
        bw.runs += b.runs + (b.extraType === 'wide' || b.extraType === 'no_ball' ? b.extraRuns : 0);

        if (b.extraType === 'wide') extras.wides += b.extraRuns;
        if (b.extraType === 'no_ball') extras.noBalls += b.extraRuns;
        if (b.extraType === 'bye') extras.byes += b.extraRuns;
        if (b.extraType === 'leg_bye') extras.legByes += b.extraRuns;

        if (b.isWicket && b.wicket && b.wicket.playerOut) {
            wickets += 1;
            batter(b.wicket.playerOut).out = {
                type: b.wicket.type, bowler: sid(b.bowler), fielder: sid(b.wicket.fielder),
            };
            if (BOWLER_CREDIT.includes(b.wicket.type)) bw.wickets += 1;
            fow.push({ wicket: wickets, runs, playerOut: sid(b.wicket.playerOut), over: oversText(legal) });
        }
    });

    return { bat, bowl, extras, fow, runs, wickets, legalBalls: legal };
}

const prevOverBowler = (balls, legal) => {
    const idx = Math.floor(legal / 6) - 1;
    if (idx < 0) return null;
    const b = balls.find((x) => x.over === idx);
    return b ? sid(b.bowler) : null;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

async function xiPlayerIds(match, teamId) {
    const xi = await PlayingXI.findOne({ teamId, format: match.format, matchId: match._id }).select('players').lean();
    return (xi?.players || []).map(sid);
}

async function loadXIs(match) {
    const docs = await PlayingXI.find({
        teamId: { $in: [match.teamA._id, match.teamB._id] },
        // teamId: { $in: [match.teamA._id || match.teamA, match.teamB._id || match.teamB] },
        format: match.format,
        matchId: { $in: [null, match._id] },
    })
        .populate({ path: 'players', select: 'userId', populate: { path: 'userId', select: 'name' } })
        .lean();

    const byTeam = {};
    docs.forEach((d) => {                       // the match snapshot wins over the saved template
        const k = sid(d.teamId);
        if (!byTeam[k] || d.matchId) byTeam[k] = d;
    });
    return byTeam;
}

// async function snapshotXIs(match) {
//     await PlayingXI.deleteMany({ matchId: match._id });   // only reached before any innings exists
//     for (const teamId of [match.teamA, match.teamB]) {
//         const tpl = await PlayingXI.findOne({ teamId, format: match.format }).lean();
//         if (!tpl || tpl.players.length !== 11) {
//             const t = await Team.findById(teamId).select('name').lean();
//             throw new ApiError(400, `Save a ${match.format} Playing XI for ${t?.name || 'the team'} before starting the match`);
//         }
//         await PlayingXI.create({
//             teamId, 
//             format: match.format,
//             matchId: match._id,
//             players: tpl.players,
//             substitutes: tpl.substitutes,
//             captain: tpl.captain,
//             viceCaptain: tpl.viceCaptain,
//             createdBy: tpl.createdBy,
//         });
//     }
// }

async function snapshotXIs(match) {
    const templates = [];
    for (const teamId of [match.teamA, match.teamB]) {
        const tpl = await PlayingXI.findOne({ teamId, format: match.format, matchId: null }).lean();
        if (!tpl || tpl.players.length !== 11) {
            const t = await Team.findById(teamId).select('name').lean();
            throw new ApiError(400, `Save a ${match.format} Playing XI for ${t?.name || 'the team'} first`);
        }
        templates.push(tpl);
    }

    for (const tpl of templates) {
        await PlayingXI.findOneAndUpdate(
            { teamId: tpl.teamId, format: match.format, matchId: match._id },
            {
                $set: {
                    players: tpl.players,
                    substitutes: tpl.substitutes,
                    captain: tpl.captain,
                    viceCaptain: tpl.viceCaptain,
                    createdBy: tpl.createdBy,
                },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );
    }
}

async function requireLiveInnings(match) {
    if (match.status !== 'live') throw new ApiError(409, 'This match is not live');
    const innings = await Innings.findById(match.currentInningsId);
    if (!innings || innings.status !== 'in_progress') throw new ApiError(409, 'There is no innings in progress');
    return innings;
}

/* ------------------------------------------------------------------ */
/* Ball rules                                                         */
/* ------------------------------------------------------------------ */

function parseBall(body, cursor, bowlingIds) {
    const extraType = body.extraType || null;
    if (extraType && !EXTRA_TYPES.includes(extraType)) throw new ApiError(400, 'Invalid extra type');

    let runs = Number(body.runs ?? 0);
    let extraRuns = Number(body.extraRuns ?? 0);
    if (!Number.isInteger(runs) || runs < 0 || runs > 7) throw new ApiError(400, 'Runs must be between 0 and 7');
    if (!Number.isInteger(extraRuns) || extraRuns < 0 || extraRuns > 10) throw new ApiError(400, 'Invalid extra runs');

    if (extraType === 'wide') { runs = 0; extraRuns = Math.max(1, extraRuns); }
    else if (extraType === 'no_ball') { extraRuns = Math.max(1, extraRuns); }          // 1 = the no-ball itself
    else if (extraType === 'bye' || extraType === 'leg_bye') {
        runs = 0;
        if (extraRuns < 1) throw new ApiError(400, 'Byes and leg byes need at least 1 run');
    } else extraRuns = 0;

    const isWicket = !!body.isWicket;
    let wicket;
    if (isWicket) {
        const type = body.wicket?.type;
        if (!WICKET_TYPES.includes(type)) throw new ApiError(400, 'Choose how the batter got out');
        if (ALLOWED_ON_EXTRA[extraType] && !ALLOWED_ON_EXTRA[extraType].includes(type)) {
            throw new ApiError(400, `${type.replace('_', ' ')} is not possible on a ${extraType.replace('_', ' ')}`);
        }
        const playerOut = sid(body.wicket?.playerOut) || cursor.striker;
        if (![cursor.striker, cursor.nonStriker].includes(playerOut)) {
            throw new ApiError(400, 'The dismissed batter must be one of the two batters at the crease');
        }
        if (STRIKER_ONLY.includes(type) && playerOut !== cursor.striker) {
            throw new ApiError(400, 'Only the striker can be out that way');
        }
        const fielder = sid(body.wicket?.fielder);
        if (fielder && !bowlingIds.includes(fielder)) throw new ApiError(400, 'The fielder must be in the bowling team');
        wicket = { type, playerOut, fielder: fielder || undefined };
    }
    return { runs, extraType, extraRuns, isWicket, wicket };
}

// where everyone stands after the ball
function nextCursor(cursor, ball, isLegal, legalAfter) {
    let striker = cursor.striker;
    let nonStriker = cursor.nonStriker;
    let bowler = cursor.bowler;

    let ran;                                               // runs physically run (boundaries are not run)
    if (ball.extraType === 'wide') ran = ball.extraRuns - 1;
    else if (ball.extraType === 'bye' || ball.extraType === 'leg_bye') ran = ball.extraRuns;
    else ran = ball.runs === 4 || ball.runs === 6 ? 0 : ball.runs;

    if (ran % 2 === 1) [striker, nonStriker] = [nonStriker, striker];

    if (ball.isWicket) {
        const out = ball.wicket.playerOut;
        if (out === striker) striker = null;
        else if (out === nonStriker) nonStriker = null;
    }
    if (isLegal && legalAfter % 6 === 0) {                 // over complete: ends change, new bowler needed
        [striker, nonStriker] = [nonStriker, striker];
        bowler = null;
    }
    return { striker, nonStriker, bowler };
}

/* ------------------------------------------------------------------ */
/* After any change: recompute totals, end the innings / match        */
/* ------------------------------------------------------------------ */

async function computeResult(match) {
    const [first, second] = await Innings.find({ matchId: match._id }).sort({ inningsNumber: 1 }).lean();
    const teams = await Team.find({ _id: { $in: [match.teamA, match.teamB] } }).select('name').lean();
    const nameOf = (id) => teams.find((t) => sid(t._id) === sid(id))?.name || 'Team';

    if (second.totalRuns > first.totalRuns) {
        const w = Math.max(0, 10 - second.totalWickets);
        return { winner: second.battingTeam, summary: `${nameOf(second.battingTeam)} won`, margin: `By ${w} ${w === 1 ? 'wicket' : 'wickets'}`, isTie: false, isNoResult: false };
    }
    if (second.totalRuns === first.totalRuns) {
        return { summary: 'Match tied', isTie: true, isNoResult: false };
    }
    const diff = first.totalRuns - second.totalRuns;
    return { winner: first.battingTeam, summary: `${nameOf(first.battingTeam)} won`, margin: `By ${diff} ${diff === 1 ? 'run' : 'runs'}`, isTie: false, isNoResult: false };
}

async function settle(match, innings) {
    const balls = await Ball.find({ inningsId: innings._id }).sort({ seq: 1 }).lean();
    const st = replay(balls);

    let endReason = null;
    if (st.wickets >= 10) endReason = 'all_out';
    else if (st.legalBalls >= match.overs * 6) endReason = 'overs_complete';
    else if (innings.inningsNumber === 2 && st.runs >= innings.target) endReason = 'target_chased';

    innings.totalRuns = st.runs;
    innings.totalWickets = st.wickets;
    innings.legalBalls = st.legalBalls;
    innings.totalOvers = Number(oversText(st.legalBalls));
    innings.extras = st.extras;
    innings.status = endReason ? 'completed' : 'in_progress';
    innings.endReason = endReason || undefined;
    await innings.save();

    const before = match.status;
    if (!endReason) {
        match.status = 'live';
        match.result = { isTie: false, isNoResult: false };
    } else if (innings.inningsNumber === 1) {
        match.status = 'innings_break';
        match.result = { isTie: false, isNoResult: false };
    } else {
        match.result = await computeResult(match);
        match.status = 'completed';
    }
    await match.save();

    if (before === 'completed' || match.status === 'completed') {
        // runs when the match finishes, and also when undo re-opens a finished match
        await recomputeAfterMatch(match).catch((e) => console.error('Stats update failed:', e));
    }
    return { endReason, st, statusChanged: before !== match.status };
}

/* ------------------------------------------------------------------ */
/* Actions                                                            */
/* ------------------------------------------------------------------ */

async function recordToss(match, { winnerTeamId, decision }) {
    console.log("KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK", match, { winnerTeamId, decision })
    if (!['scheduled', 'toss_done'].includes(match.status) || match.currentInningsId) {
        throw new ApiError(409, 'The toss can only be recorded before the match starts');
    }
    if (match.format === 'Test' || !match.overs) {
        throw new ApiError(400, 'Scoring supports limited-overs formats only');
    }
    if (![sid(match.teamA), sid(match.teamB)].includes(sid(winnerTeamId))) {
        throw new ApiError(400, 'The toss winner must be one of the two teams');
    }
    if (!['bat', 'bowl'].includes(decision)) throw new ApiError(400, 'Choose bat or bowl');

    await snapshotXIs(match);
    match.toss = { winner: winnerTeamId, decision };
    match.status = 'toss_done';
    await match.save();
}

async function startInnings(match, input) {
    let inningsNumber, battingTeam, bowlingTeam, target;

    if (match.status === 'toss_done') {
        inningsNumber = 1;
        const winner = sid(match.toss.winner);
        const loser = winner === sid(match.teamA) ? sid(match.teamB) : sid(match.teamA);
        battingTeam = match.toss.decision === 'bat' ? winner : loser;
        bowlingTeam = battingTeam === winner ? loser : winner;
    } else if (match.status === 'innings_break') {
        const first = await Innings.findOne({ matchId: match._id, inningsNumber: 1 });
        inningsNumber = 2;
        battingTeam = sid(first.bowlingTeam);
        bowlingTeam = sid(first.battingTeam);
        target = first.totalRuns + 1;
    } else {
        throw new ApiError(409, 'This match is not ready for an innings to start');
    }
    if (await Innings.exists({ matchId: match._id, inningsNumber })) {
        throw new ApiError(409, 'This innings has already started');
    }

    const [batIds, bowlIds] = await Promise.all([xiPlayerIds(match, battingTeam), xiPlayerIds(match, bowlingTeam)]);
    const striker = sid(input.striker), nonStriker = sid(input.nonStriker), bowler = sid(input.bowler);
    if (!striker || !nonStriker || striker === nonStriker) throw new ApiError(400, 'Pick two different opening batters');
    if (!batIds.includes(striker) || !batIds.includes(nonStriker)) {
        throw new ApiError(400, "Openers must come from the batting team's Playing XI");
    }
    if (!bowler || !bowlIds.includes(bowler)) throw new ApiError(400, "The bowler must come from the bowling team's Playing XI");

    const innings = await Innings.create({
        matchId: match._id, inningsNumber, battingTeam, bowlingTeam, target,
        status: 'in_progress', striker, nonStriker, currentBowler: bowler,
    });
    match.currentInningsId = innings._id;
    match.status = 'live';
    await match.save();
}

async function selectBatter(match, playerId) {
    const innings = await requireLiveInnings(match);
    if (innings.striker && innings.nonStriker) throw new ApiError(409, 'No new batter is needed right now');

    const balls = await Ball.find({ inningsId: innings._id }).lean();
    const used = new Set([...replay(balls).bat.keys(), sid(innings.striker), sid(innings.nonStriker)]);
    const pid = sid(playerId);
    const batIds = await xiPlayerIds(match, innings.battingTeam);
    if (!pid || !batIds.includes(pid) || used.has(pid)) throw new ApiError(400, 'That player cannot bat now');

    if (!innings.striker) innings.striker = pid;
    else innings.nonStriker = pid;
    await innings.save();
}

async function selectBowler(match, playerId) {
    const innings = await requireLiveInnings(match);
    if (innings.currentBowler) throw new ApiError(409, 'A bowler is already selected');

    const balls = await Ball.find({ inningsId: innings._id }).sort({ seq: 1 }).lean();
    const st = replay(balls);
    const pid = sid(playerId);
    const bowlIds = await xiPlayerIds(match, innings.bowlingTeam);
    if (!pid || !bowlIds.includes(pid)) throw new ApiError(400, 'That player is not in the bowling team');
    if (pid === prevOverBowler(balls, st.legalBalls)) throw new ApiError(400, 'A bowler cannot bowl two overs in a row');
    const maxOvers = Math.ceil(match.overs / 5);
    if ((st.bowl.get(pid)?.legalBalls || 0) >= maxOvers * 6) {
        throw new ApiError(400, `A bowler can bowl at most ${maxOvers} overs`);
    }
    innings.currentBowler = pid;
    await innings.save();
}

async function recordBall(match, userId, body) {
    const innings = await requireLiveInnings(match);
    const ballUuid = body.ballUuid || new mongoose.Types.ObjectId().toString();
    if (await Ball.exists({ ballUuid })) return { duplicate: true };       // retried request, already saved

    const balls = await Ball.find({ inningsId: innings._id }).sort({ seq: 1 }).lean();
    const cursor = { striker: sid(innings.striker), nonStriker: sid(innings.nonStriker), bowler: sid(innings.currentBowler) };
    if (!cursor.striker || !cursor.nonStriker) throw new ApiError(409, 'Select the new batter first');
    if (!cursor.bowler) throw new ApiError(409, 'Select the bowler for this over first');

    const bowlIds = await xiPlayerIds(match, innings.bowlingTeam);
    const input = parseBall(body, cursor, bowlIds);
    const st = replay(balls);
    const isLegal = input.extraType !== 'wide' && input.extraType !== 'no_ball';
    const legalInOver = st.legalBalls % 6;

    await Ball.create({
        ballUuid,
        matchId: match._id,
        inningsId: innings._id,
        seq: (balls.length ? balls[balls.length - 1].seq : 0) + 1,
        over: Math.floor(st.legalBalls / 6),
        ballInOver: isLegal ? legalInOver + 1 : legalInOver,
        bowler: cursor.bowler,
        striker: cursor.striker,
        nonStriker: cursor.nonStriker,
        runs: input.runs,
        extraType: input.extraType,
        extraRuns: input.extraRuns,
        isLegal,
        isWicket: input.isWicket,
        wicket: input.wicket,
        recordedBy: userId,
    });

    const next = nextCursor(cursor, input, isLegal, st.legalBalls + (isLegal ? 1 : 0));
    innings.striker = next.striker;
    innings.nonStriker = next.nonStriker;
    innings.currentBowler = next.bowler;
    return settle(match, innings);
}

async function undoLastBall(match) {
    if (!['live', 'innings_break', 'completed'].includes(match.status)) {
        throw new ApiError(409, 'There is nothing to undo yet');
    }
    const innings = await Innings.findById(match.currentInningsId);
    const last = innings && (await Ball.findOne({ inningsId: innings._id }).sort({ seq: -1 }));
    if (!last) throw new ApiError(400, 'There is no ball to undo in this innings');

    await last.deleteOne();
    await Scorer.updateOne({ userId }, { $inc: { ballsUndone: 1 } });
    innings.striker = last.striker;                 // everyone goes back to where they were before the ball
    innings.nonStriker = last.nonStriker;
    innings.currentBowler = last.bowler;
    return settle(match, innings);
}

/* ------------------------------------------------------------------ */
/* State for the scoring screen                                       */
/* ------------------------------------------------------------------ */

const ballLabel = (b) => {
    if (b.isWicket) return { text: 'W', kind: 'wicket' };
    switch (b.extraType) {
        case 'wide': return { text: b.extraRuns > 1 ? `Wd+${b.extraRuns - 1}` : 'Wd', kind: 'extra' };
        case 'no_ball': return { text: b.runs ? `Nb+${b.runs}` : 'Nb', kind: 'extra' };
        case 'bye': return { text: `B${b.extraRuns}`, kind: 'extra' };
        case 'leg_bye': return { text: `Lb${b.extraRuns}`, kind: 'extra' };
        default: return { text: String(b.runs), kind: b.runs === 6 ? 'six' : b.runs === 4 ? 'four' : b.runs === 0 ? 'dot' : 'run' };
    }
};
async function xiReadyFor(match) {
    const idStr = (v) => String(v?._id ?? v);
    const docs = await PlayingXI.find({
        teamId: { $in: [idStr(match.teamA), idStr(match.teamB)] },
        format: match.format || 'T20',
        matchId: { $in: [null, match._id] },
    }).select('teamId players').lean();

    const ok = new Set(docs.filter((d) => d.players.length === 11).map((d) => idStr(d.teamId)));
    return { teamA: ok.has(idStr(match.teamA)), teamB: ok.has(idStr(match.teamB)) };
}
async function buildState(matchId) {
    const match = await Match.findById(matchId)
        .populate('teamA teamB', 'name logoUrl')
        .populate('tournamentId', 'name')
        .populate('venueId', 'name')
        .populate('toss.winner result.winner', 'name')
        .lean();
    if (!match) throw new ApiError(404, 'Match not found');

    const [inningsList, xiByTeam] = await Promise.all([
        Innings.find({ matchId }).sort({ inningsNumber: 1 }).lean(),
        loadXIs(match),
    ]);

    const teams = { [sid(match.teamA)]: match.teamA, [sid(match.teamB)]: match.teamB };
    const otherId = (id) => (sid(id) === sid(match.teamA) ? sid(match.teamB) : sid(match.teamA));
    const brief = (t) => t && { _id: sid(t), name: t.name, logoUrl: t.logoUrl };

    const roster = new Map();
    Object.values(xiByTeam).forEach((xi) =>
        (xi.players || []).forEach((p) => roster.set(sid(p), { id: sid(p), name: p.userId?.name || 'Unknown' }))
    );
    const xiPlayers = (teamId) => (xiByTeam[sid(teamId)]?.players || []).map((p) => roster.get(sid(p)));
    const nameOf = (id) => roster.get(sid(id))?.name || 'Unknown';

    /* what the scorer has to do next, when the match is not live */
    const first = inningsList[0];
    let setup = null;
    if (match.status === 'scheduled') {
        setup = { step: 'toss' };
    } else if (match.status === 'toss_done' || match.status === 'innings_break') {
        const isFirst = match.status === 'toss_done';
        const winner = sid(match.toss?.winner);
        const battingId = isFirst
            ? (match.toss.decision === 'bat' ? winner : otherId(winner))
            : sid(first.bowlingTeam);
        const bowlingId = otherId(battingId);
        setup = {
            step: isFirst ? 'openers' : 'second_innings',
            inningsNumber: isFirst ? 1 : 2,
            battingTeam: brief(teams[battingId]),
            bowlingTeam: brief(teams[bowlingId]),
            battingXI: xiPlayers(battingId),
            bowlingXI: xiPlayers(bowlingId),
            target: isFirst ? null : first.totalRuns + 1,
        };
    }

    /* the innings being scored (or the last one played) */
    const cur = inningsList[inningsList.length - 1];
    let current = null;
    let canUndo = false;
    if (cur) {
        const balls = await Ball.find({ inningsId: cur._id }).sort({ seq: 1 }).lean();
        const st = replay(balls);
        const inProgress = cur.status === 'in_progress';
        const striker = sid(cur.striker), nonStriker = sid(cur.nonStriker), bowler = sid(cur.currentBowler);
        const battingXI = xiPlayers(cur.battingTeam);
        const bowlingXI = xiPlayers(cur.bowlingTeam);

        const batLine = (id) => {
            if (!id) return null;
            const s = st.bat.get(id) || { runs: 0, balls: 0, fours: 0, sixes: 0 };
            return { id, name: nameOf(id), runs: s.runs, balls: s.balls, fours: s.fours, sixes: s.sixes, sr: s.balls ? r1((s.runs / s.balls) * 100) : 0 };
        };
        const bowlLine = (id) => {
            if (!id) return null;
            const b = st.bowl.get(id) || { legalBalls: 0, runs: 0, wickets: 0 };
            return { id, name: nameOf(id), overs: oversText(b.legalBalls), runs: b.runs, wickets: b.wickets, econ: b.legalBalls ? r2(b.runs / (b.legalBalls / 6)) : 0 };
        };
        const outText = (o) => {
            if (!o) return 'not out';
            const bn = nameOf(o.bowler);
            const fn = o.fielder ? nameOf(o.fielder) : null;
            switch (o.type) {
                case 'bowled': return `b ${bn}`;
                case 'caught': return fn && fn === bn ? `c & b ${bn}` : `c ${fn || 'sub'} b ${bn}`;
                case 'lbw': return `lbw b ${bn}`;
                case 'stumped': return `st ${fn || 'wk'} b ${bn}`;
                case 'run_out': return `run out${fn ? ` (${fn})` : ''}`;
                case 'hit_wicket': return `hit wicket b ${bn}`;
                default: return 'out';
            }
        };

        const used = new Set([...st.bat.keys(), striker, nonStriker].filter(Boolean));
        const prev = prevOverBowler(balls, st.legalBalls);
        const maxOvers = Math.ceil(match.overs / 5);

        const ballsLeft = match.overs * 6 - st.legalBalls;
        const chase = cur.target
            ? {
                target: cur.target,
                runsNeeded: Math.max(0, cur.target - st.runs),
                ballsLeft: Math.max(0, ballsLeft),
                rrr: ballsLeft > 0 ? r2((cur.target - st.runs) / (ballsLeft / 6)) : null,
            }
            : null;

        current = {
            number: cur.inningsNumber,
            status: cur.status,
            battingTeam: brief(teams[sid(cur.battingTeam)]),
            bowlingTeam: brief(teams[sid(cur.bowlingTeam)]),
            runs: st.runs,
            wickets: st.wickets,
            overs: oversText(st.legalBalls),
            legalBalls: st.legalBalls,
            crr: st.legalBalls ? r2(st.runs / (st.legalBalls / 6)) : 0,
            extras: { ...st.extras, total: st.extras.wides + st.extras.noBalls + st.extras.byes + st.extras.legByes },
            chase,
            striker: batLine(striker),
            nonStriker: batLine(nonStriker),
            bowler: bowlLine(bowler),
            batting: [...st.bat.keys()].map((id) => ({ ...batLine(id), out: outText(st.bat.get(id).out), isOut: !!st.bat.get(id).out })),
            bowling: [...st.bowl.keys()].map(bowlLine),
            fow: st.fow.map((f) => ({ ...f, name: nameOf(f.playerOut) })),
            lastBalls: balls.slice(-6).map(ballLabel),
            needs: { batter: inProgress && (!striker || !nonStriker), bowler: inProgress && !bowler },
            availableBatters: inProgress ? battingXI.filter((p) => !used.has(p.id)) : [],
            availableBowlers: inProgress
                ? bowlingXI.filter((p) => p.id !== prev && (st.bowl.get(p.id)?.legalBalls || 0) < maxOvers * 6)
                : [],
        };
        canUndo = balls.length > 0 && ['live', 'innings_break', 'completed'].includes(match.status);
    }

    const xiOk = (team) => {
        return (xiByTeam[sid(team)]?.players?.length || 0) >= 11
    };

    return {
        match: {
            _id: sid(match._id),
            status: match.status,
            format: match.format,
            overs: match.overs,
            matchNumber: match.matchNumber,
            tournament: match.tournamentId?.name,
            venue: match.venueId?.name,
            scheduledAt: match.scheduledAt,
            teamA: brief(match.teamA),
            teamB: brief(match.teamB),
            toss: match.toss?.winner ? { winner: brief(match.toss.winner), decision: match.toss.decision } : null,
            result: match.status === 'completed'
                ? { winner: brief(match.result?.winner), summary: match.result?.summary, margin: match.result?.margin, isTie: !!match.result?.isTie }
                : null,
        },

        xiReady: await xiReadyFor(match),
        // xiReady: { teamA: xiOk(match.teamA), teamB: xiOk(match.teamB) },
        setup,
        innings: inningsList.map((i) => ({
            number: i.inningsNumber,
            teamId: sid(i.battingTeam),
            team: teams[sid(i.battingTeam)]?.name,
            runs: i.totalRuns,
            wickets: i.totalWickets,
            overs: oversText(i.legalBalls || 0),
            status: i.status,
            target: i.target,
            endReason: i.endReason,
        })),
        current,
        canUndo,
    };
}

module.exports = {
    snapshotXIs, buildState, recordToss, startInnings, selectBatter, selectBowler, recordBall, undoLastBall,
};