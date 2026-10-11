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
    // if (!endReason) {
    //     match.status = 'live';
    //     match.result = { isTie: false, isNoResult: false };
    // } else if (innings.inningsNumber === 1) {
    //     match.status = 'innings_break';
    //     match.result = { isTie: false, isNoResult: false };
    // } else {
    //     match.result = await computeResult(match);
    //     match.status = 'completed';
    // }
    if (!endReason) {
        match.status = 'live';
        match.result = { isTie: false, isNoResult: false };
        match.playerOfMatch = undefined;
    } else if (innings.inningsNumber === 1) {
        match.status = 'innings_break';
        match.result = { isTie: false, isNoResult: false };
        match.playerOfMatch = undefined;
    } else {
        match.result = await computeResult(match);
        match.status = 'completed';
        match.playerOfMatch = await pickPlayerOfMatch(match._id);
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


/* ================================================================== */
/* Live score read model (used by the Live Score page)                */
/* ================================================================== */

const PAR_RATE = { T20: 8, T10: 10, ODI: 5.5 };
const logistic = (x) => 1 / (1 + Math.exp(-x));
const cap = (s = '') => s.charAt(0).toUpperCase() + s.slice(1);
const isLegalBall = (b) => b.extraType !== 'wide' && b.extraType !== 'no_ball';

const outDescription = (o, nameOf) => {
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

// a maiden = a complete over where the bowler conceded nothing (byes and leg byes don't count against him)
function maidensByBowler(balls) {
    const overs = new Map();
    balls.forEach((b) => {
        const k = `${sid(b.bowler)}|${b.over}`;
        const o = overs.get(k) || { bowler: sid(b.bowler), legal: 0, conceded: 0 };
        if (isLegalBall(b)) o.legal += 1;
        o.conceded += b.runs + (b.extraType === 'wide' || b.extraType === 'no_ball' ? b.extraRuns : 0);
        overs.set(k, o);
    });
    const out = new Map();
    overs.forEach((o) => { if (o.legal === 6 && o.conceded === 0) out.set(o.bowler, (out.get(o.bowler) || 0) + 1); });
    return out;
}

function oversBreakdown(balls) {
    const byOver = new Map();
    balls.forEach((b) => {
        if (!byOver.has(b.over)) byOver.set(b.over, { over: b.over + 1, runs: 0, wickets: 0, legal: 0, tokens: [] });
        const o = byOver.get(b.over);
        o.runs += b.runs + b.extraRuns;
        if (b.isWicket) o.wickets += 1;
        if (isLegalBall(b)) o.legal += 1;
        const t = ballLabel(b).text;
        o.tokens.push(t === '0' ? '.' : t);
    });
    return [...byOver.values()].map((o) => ({ over: o.over, runs: o.runs, wickets: o.wickets, detail: o.tokens.join(' '), partial: o.legal < 6 }));
}

// every partnership of an innings; the last one is the current (open) one
function partnershipsOf(balls) {
    const parts = [];
    let wickets = 0;
    let seg = { runs: 0, balls: 0, ids: new Set(), wicketNo: 1 };
    balls.forEach((b) => {
        seg.runs += b.runs + b.extraRuns;
        if (isLegalBall(b)) seg.balls += 1;
        seg.ids.add(sid(b.striker));
        seg.ids.add(sid(b.nonStriker));
        if (b.isWicket) {
            parts.push(seg);
            wickets += 1;
            seg = { runs: 0, balls: 0, ids: new Set(), wicketNo: wickets + 1 };
        }
    });
    parts.push(seg);
    return parts;
}

function commentaryOf(inningsNumber, balls, nameOf) {
    const bat = new Map();
    const overRuns = new Map();
    const items = [];

    balls.forEach((b) => {
        const k = sid(b.striker);
        const s = bat.get(k) || { runs: 0, balls: 0 };
        if (b.extraType !== 'wide') s.balls += 1;
        if (!b.extraType || b.extraType === 'no_ball') s.runs += b.runs;
        bat.set(k, s);

        const legal = isLegalBall(b);
        const label = ballLabel(b);
        const batter = nameOf(b.striker);
        let text;
        let sub;

        if (b.isWicket) {
            const outId = sid(b.wicket?.playerOut);
            const o = bat.get(outId) || { runs: 0, balls: 0 };
            text = `OUT! ${cap((b.wicket?.type || 'wicket').replace('_', ' '))}!`;
            sub = `${nameOf(outId)} ${outDescription({ type: b.wicket?.type, bowler: sid(b.bowler), fielder: sid(b.wicket?.fielder) }, nameOf)} ${o.runs} (${o.balls})`;
        } else if (b.extraType === 'wide') {
            text = `Wide${b.extraRuns > 1 ? ` plus ${b.extraRuns - 1} run${b.extraRuns > 2 ? 's' : ''}` : ''}.`;
        } else if (b.extraType === 'no_ball') {
            text = `No ball!${b.runs ? ` ${batter} scores ${b.runs}.` : ''}`;
        } else if (b.extraType === 'bye' || b.extraType === 'leg_bye') {
            text = `${b.extraRuns} ${b.extraType === 'bye' ? 'bye' : 'leg bye'}${b.extraRuns > 1 ? 's' : ''}.`;
        } else if (b.runs === 6) text = `SIX! ${batter} sends it over the boundary!`;
        else if (b.runs === 4) text = `FOUR! ${batter} finds the gap.`;
        else if (b.runs === 0) text = 'No run.';
        else if (b.runs === 1) text = 'Single.';
        else text = `${b.runs} runs.`;

        items.push({
            inningsNumber,
            over: `${b.over}.${legal ? b.ballInOver : b.ballInOver + 1}`,
            ball: label.text, kind: label.kind,
            bowler: nameOf(b.bowler), batter, text, sub,
        });
        overRuns.set(b.over, (overRuns.get(b.over) || 0) + b.runs + b.extraRuns);
        if (legal && b.ballInOver === 6) items.push({ inningsNumber, endOfOver: b.over + 1, runs: overRuns.get(b.over) });
    });
    return items;
}

/* best performer of a match: runs + 25 per wicket + 10 per catch */
function performers(balls) {
    const p = new Map();
    const get = (id) => {
        const k = sid(id);
        if (!p.has(k)) p.set(k, { id: k, runs: 0, balls: 0, fours: 0, sixes: 0, wickets: 0, conceded: 0, bowled: 0, catches: 0 });
        return p.get(k);
    };
    balls.forEach((b) => {
        const s = get(b.striker);
        if (b.extraType !== 'wide') s.balls += 1;
        if (!b.extraType || b.extraType === 'no_ball') {
            s.runs += b.runs;
            if (b.runs === 4) s.fours += 1;
            if (b.runs === 6) s.sixes += 1;
        }
        const bw = get(b.bowler);
        if (isLegalBall(b)) bw.bowled += 1;
        bw.conceded += b.runs + (b.extraType === 'wide' || b.extraType === 'no_ball' ? b.extraRuns : 0);
        if (b.isWicket) {
            if (BOWLER_CREDIT.includes(b.wicket?.type)) bw.wickets += 1;
            if (b.wicket?.type === 'caught' && b.wicket.fielder) get(b.wicket.fielder).catches += 1;
        }
    });
    p.forEach((x) => { x.points = x.runs + x.wickets * 25 + x.catches * 10; });
    return [...p.values()].sort((a, b) => b.points - a.points);
}

const performerRole = (x) => (x.runs >= 15 && x.wickets >= 1 ? 'ALL-ROUNDER' : x.wickets >= 1 && x.wickets * 25 > x.runs ? 'BOWLER' : 'BATTER');
const performerSummary = (x) => {
    const role = performerRole(x);
    if (role === 'ALL-ROUNDER') return `${x.runs} (${x.balls}) & ${x.wickets}/${x.conceded}`;
    if (role === 'BOWLER') return `${x.wickets}/${x.conceded} (${oversText(x.bowled)} Overs)`;
    return `${x.runs} (${x.balls})`;
};

async function pickPlayerOfMatch(matchId) {
    const balls = await Ball.find({ matchId }).select('striker bowler runs extraType extraRuns isWicket wicket').lean();
    const top = performers(balls)[0];
    return top && top.points > 0 ? { player: top.id, summary: performerSummary(top) } : undefined;
}

/* rough win chance, an estimate and nothing more */
function winProbability(match, cur, st) {
    const A = sid(match.teamA), B = sid(match.teamB);
    const split = (battingId, p) => {
        const pct = Math.min(99, Math.max(1, Math.round(p * 100)));
        return battingId === A ? { teamA: pct, teamB: 100 - pct } : { teamA: 100 - pct, teamB: pct };
    };
    if (match.status === 'completed') {
        const w = sid(match.result?.winner);
        if (!w) return { teamA: 50, teamB: 50 };
        return w === A ? { teamA: 100, teamB: 0 } : { teamA: 0, teamB: 100 };
    }
    if (!cur) return { teamA: 50, teamB: 50 };

    const par = PAR_RATE[match.format] || 8;
    const total = match.overs * 6;
    const ballsLeft = Math.max(0, total - st.legalBalls);
    const batting = sid(cur.battingTeam);
    const other = batting === A ? B : A;

    if (match.status === 'innings_break') {
        const need = st.runs + 1;
        const sd = 5 + 1.1 * Math.sqrt(total);
        return split(other, logistic(((match.overs * par - need) / sd) * 1.6));
    }

    const crr = st.legalBalls ? st.runs / (st.legalBalls / 6) : par;
    const rate = st.legalBalls >= 12 ? 0.6 * crr + 0.4 * par : par;

    if (cur.inningsNumber === 1) {
        const projected = st.runs + (ballsLeft / 6) * rate * Math.max(0.35, 1 - st.wickets * 0.07);
        return split(batting, logistic((projected - match.overs * par) / 14));
    }
    const need = cur.target - st.runs;
    if (need <= 0) return split(batting, 0.99);
    if (ballsLeft === 0 || st.wickets >= 10) return split(batting, 0.01);
    const expected = (ballsLeft / 6) * rate * Math.max(0.2, Math.pow((10 - st.wickets) / 10, 0.7));
    const sd = 5 + 1.1 * Math.sqrt(ballsLeft);
    return split(batting, logistic(((expected - need) / sd) * 1.6));
}

async function buildLive(matchId) {
    const match = await Match.findById(matchId)
        .populate('teamA teamB', 'name logoUrl')
        .populate('tournamentId', 'name')
        .populate('venueId', 'name address')
        .populate('toss.winner result.winner', 'name')
        .lean();
    if (!match) throw new ApiError(404, 'Match not found');

    const [inningsList, xiByTeam, allBalls] = await Promise.all([
        Innings.find({ matchId }).sort({ inningsNumber: 1 }).lean(),
        loadXIs(match),
        Ball.find({ matchId }).sort({ seq: 1 }).lean(),
    ]);

    const teams = { [sid(match.teamA)]: match.teamA, [sid(match.teamB)]: match.teamB };
    const brief = (t) => t && { _id: sid(t), name: t.name, logoUrl: t.logoUrl };

    const roster = new Map();
    const teamOf = new Map();
    Object.entries(xiByTeam).forEach(([teamId, xi]) =>
        (xi.players || []).forEach((p) => {
            roster.set(sid(p), { id: sid(p), name: p.userId?.name || 'Unknown' });
            teamOf.set(sid(p), teamId);
        })
    );
    const nameOf = (id) => roster.get(sid(id))?.name || 'Unknown';
    const xiPlayers = (teamId) => (xiByTeam[sid(teamId)]?.players || []).map((p) => roster.get(sid(p)));

    const ballsBy = new Map();
    allBalls.forEach((b) => {
        const k = sid(b.inningsId);
        if (!ballsBy.has(k)) ballsBy.set(k, []);
        ballsBy.get(k).push(b);
    });

    /* one full scorecard per innings */
    const inningsViews = inningsList.map((inn) => {
        const balls = ballsBy.get(sid(inn._id)) || [];
        const st = replay(balls);
        const maidens = maidensByBowler(balls);
        const inProgress = inn.status === 'in_progress';
        const striker = sid(inn.striker);
        const nonStriker = sid(inn.nonStriker);

        return {
            number: inn.inningsNumber,
            status: inn.status,
            target: inn.target,
            endReason: inn.endReason,
            battingTeam: brief(teams[sid(inn.battingTeam)]),
            bowlingTeam: brief(teams[sid(inn.bowlingTeam)]),
            runs: st.runs,
            wickets: st.wickets,
            overs: oversText(st.legalBalls),
            legalBalls: st.legalBalls,
            crr: st.legalBalls ? r2(st.runs / (st.legalBalls / 6)) : 0,
            extras: { ...st.extras, total: st.extras.wides + st.extras.noBalls + st.extras.byes + st.extras.legByes },
            batting: [...st.bat.keys()].map((id) => {
                const s = st.bat.get(id);
                const atCrease = inProgress && (id === striker || id === nonStriker);
                return {
                    id, name: nameOf(id), runs: s.runs, balls: s.balls, fours: s.fours, sixes: s.sixes,
                    sr: s.balls ? r1((s.runs / s.balls) * 100) : 0,
                    out: s.out ? outDescription(s.out, nameOf) : atCrease ? 'batting' : 'not out',
                    isOut: !!s.out, atCrease, onStrike: inProgress && id === striker,
                };
            }),
            didNotBat: xiPlayers(inn.battingTeam).filter((p) => p && !st.bat.has(p.id)).map((p) => p.name),
            bowling: [...st.bowl.keys()].map((id) => {
                const b = st.bowl.get(id);
                return {
                    id, name: nameOf(id), overs: oversText(b.legalBalls), maidens: maidens.get(id) || 0,
                    runs: b.runs, wickets: b.wickets, econ: b.legalBalls ? r2(b.runs / (b.legalBalls / 6)) : 0,
                    isCurrent: inProgress && id === sid(inn.currentBowler),
                };
            }),
            fow: st.fow.map((f) => ({ ...f, name: nameOf(f.playerOut) })),
            oversBreakdown: oversBreakdown(balls),
        };
    });

    /* the innings being played, or the last one */
    const curInn = inningsList[inningsList.length - 1];
    const curView = inningsViews[inningsViews.length - 1];
    const curBalls = curInn ? ballsBy.get(sid(curInn._id)) || [] : [];
    const st = replay(curBalls);
    let current = null;

    if (curInn) {
        const parts = partnershipsOf(curBalls);
        const open = parts[parts.length - 1];
        const cursor = [sid(curInn.striker), sid(curInn.nonStriker)].filter(Boolean);
        const pairIds = cursor.length === 2 ? cursor : [...open.ids];
        const best = parts.filter((p) => p.ids.size >= 2).sort((a, b) => b.runs - a.runs)[0];
        const ballsLeft = Math.max(0, match.overs * 6 - st.legalBalls);

        current = {
            number: curInn.inningsNumber,
            status: curInn.status,
            ballsLeft,
            projected: Math.round(st.runs + (ballsLeft / 6) * (st.legalBalls ? st.runs / (st.legalBalls / 6) : 0)),
            chase: curInn.target
                ? {
                    target: curInn.target,
                    runsNeeded: Math.max(0, curInn.target - st.runs),
                    ballsLeft,
                    rrr: ballsLeft > 0 ? r2((curInn.target - st.runs) / (ballsLeft / 6)) : null,
                }
                : null,
            partnership: {
                runs: open.runs, balls: open.balls, wicketNo: open.wicketNo,
                batters: pairIds.map((id) => ({ id, name: nameOf(id) })),
                pct: st.runs ? Math.round((open.runs / st.runs) * 100) : 0,
            },
            highestPartnership: best
                ? { runs: best.runs, balls: best.balls, wicketNo: best.wicketNo, names: [...best.ids].map(nameOf).join(' & ') }
                : null,
            lastBalls: curBalls.slice(-6).map(ballLabel),
        };
    }

    const top = performers(allBalls)[0];
    const topPerformer = top && top.points > 0
        ? {
            name: nameOf(top.id),
            team: teams[teamOf.get(top.id)]?.name,
            role: performerRole(top),
            runs: top.runs, balls: top.balls, fours: top.fours, sixes: top.sixes,
            sr: top.balls ? r1((top.runs / top.balls) * 100) : 0,
            wickets: top.wickets, conceded: top.conceded, overs: oversText(top.bowled),
            summary: performerSummary(top),
        }
        : null;

    const xiList = (teamId) => {
        const xi = xiByTeam[sid(teamId)];
        return xiPlayers(teamId).filter(Boolean).map((p) => ({
            ...p, captain: sid(xi?.captain) === p.id, viceCaptain: sid(xi?.viceCaptain) === p.id,
        }));
    };

    const venue = match.venueId;
    const city = venue?.address && typeof venue.address === 'object' ? venue.address.city : undefined;

    return {
        match: {
            _id: sid(match._id),
            status: match.status,
            format: match.format,
            overs: match.overs,
            matchNumber: match.matchNumber,
            tournament: match.tournamentId?.name,
            venue: venue ? { name: venue.name, city } : null,
            scheduledAt: match.scheduledAt,
            umpires: match.umpires || [],
            tvUmpire: match.tvUmpire || '',
            teamA: brief(match.teamA),
            teamB: brief(match.teamB),
            toss: match.toss?.winner ? { winner: brief(match.toss.winner), decision: match.toss.decision } : null,
            tossText: match.toss?.winner
                ? `${match.toss.winner.name} won the toss and elected to ${match.toss.decision}`
                : null,
            result: match.status === 'completed'
                ? { winner: brief(match.result?.winner), summary: match.result?.summary, margin: match.result?.margin, isTie: !!match.result?.isTie }
                : null,
        },
        innings: inningsViews,
        current,
        winProbability: winProbability(match, curInn, st),
        commentary: inningsList.flatMap((inn) =>
            commentaryOf(inn.inningsNumber, ballsBy.get(sid(inn._id)) || [], nameOf)
        ),
        topPerformer,
        xi: { teamA: xiList(match.teamA), teamB: xiList(match.teamB) },
    };
}

// module.exports = {
//     snapshotXIs, buildState, recordToss, startInnings, selectBatter, selectBowler, recordBall, undoLastBall,
// };

const TOSS_ROLES = process.env.SCORER_CAN_TOSS === 'true' ? ['organizer', 'scorer'] : ['organizer'];
const canRecordToss = (user) => TOSS_ROLES.includes(user?.role);


module.exports = {
    buildState, buildLive, recordToss, startInnings, selectBatter, selectBowler, recordBall, undoLastBall,
    canRecordToss, snapshotXIs,
};