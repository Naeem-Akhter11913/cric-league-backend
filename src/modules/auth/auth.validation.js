const { z } = require('zod');

const registerSchema = z.object({
  body: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(6),
    phone: z.string().optional(),
    // role: z.enum(['super_admin', 'organizer', 'team_manager', 'player', 'scorer']),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10),
  }),
});

module.exports = { registerSchema, loginSchema, refreshSchema };
