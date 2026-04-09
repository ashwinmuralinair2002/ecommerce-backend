const { z } = require('zod');
const { nameSchema, emailSchema, phoneSchema } = require('./auth.validation');

const updateProfileSchema = z.object({
  body: z.object({
    name: nameSchema,
    phone: phoneSchema,
  })
});

const requestEmailChangeSchema = z.object({
  body: z.object({
    newEmail: emailSchema,
  })
});

module.exports = {
  updateProfileSchema,
  requestEmailChangeSchema,
};
