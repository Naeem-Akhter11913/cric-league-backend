const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ORGANIZER: 'organizer',
  TEAM_MANAGER: 'team_manager',
  PLAYER: 'player',
  SCORER: 'scorer',
};

const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  TOSS_DONE: 'toss_done',
  LIVE: 'live',
  INNINGS_BREAK: 'innings_break',
  COMPLETED: 'completed',
  ABANDONED: 'abandoned',
};

const BALL_EXTRA_TYPES = {
  WIDE: 'wide',
  NO_BALL: 'no_ball',
  BYE: 'bye',
  LEG_BYE: 'leg_bye',
};

const WICKET_TYPES = {
  BOWLED: 'bowled',
  CAUGHT: 'caught',
  LBW: 'lbw',
  RUN_OUT: 'run_out',
  STUMPED: 'stumped',
  HIT_WICKET: 'hit_wicket',
  OTHER: 'other',
};

module.exports = { ROLES, MATCH_STATUS, BALL_EXTRA_TYPES, WICKET_TYPES };
