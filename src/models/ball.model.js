const { Schema, model } = require('mongoose');

const ballSchema = new Schema(
  {
    ballUuid: { type: String, required: true, unique: true }, // client-generated, idempotency
    matchId: { type: Schema.Types.ObjectId, ref: 'Match', required: true },
    inningsId: { type: Schema.Types.ObjectId, ref: 'Innings', required: true },
    over: { type: Number, required: true },
    ballInOver: { type: Number, required: true }, // 1-6 legal deliveries
    bowler: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    striker: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    nonStriker: { type: Schema.Types.ObjectId, ref: 'Player', required: true },
    runs: { type: Number, default: 0 }, // bat runs
    extraType: {
      type: String,
      enum: [null, 'wide', 'no_ball', 'bye', 'leg_bye'],
      default: null,
    },
    extraRuns: { type: Number, default: 0 },
    isWicket: { type: Boolean, default: false },
    wicket: {
      type: {
        type: String,
        enum: ['bowled', 'caught', 'lbw', 'run_out', 'stumped', 'hit_wicket', 'other'],
      },
      playerOut: { type: Schema.Types.ObjectId, ref: 'Player' },
      fielder: { type: Schema.Types.ObjectId, ref: 'Player' },
    },
    commentary: { type: String },
    isCorrected: { type: Boolean, default: false },
    correctedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

ballSchema.index({ inningsId: 1, over: 1, ballInOver: 1 });

module.exports = model('Ball', ballSchema);
