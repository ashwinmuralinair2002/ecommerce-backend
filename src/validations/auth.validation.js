const { z } = require('zod');
const validator = require("validator");

const normalizeWhitespace = (value) => value.trim().replace(/\s+/g, ' ');
const normalizePhone = (value) => value.trim().replace(/[\s-]+/g, '');

const nameSchema = z.string()
  .transform(normalizeWhitespace)
  .refine(value => value.length >= 2, { message: 'Name must be at least 2 characters' })
  .refine(value => value.length <= 60, { message: 'Name must be at most 60 characters' })
  .refine(value => validator.matches(value, /^[A-Za-z ]+$/), {
    message: 'Name can contain only letters and spaces'
  });

const emailSchema = z.string()
  .transform(value => value.trim().toLowerCase())
  .refine(value => validator.isEmail(value), {
    message: 'Please provide a valid email address'
  })
  .transform(value => validator.normalizeEmail(value) || value);

const phoneSchema = z.string()
  .transform(normalizePhone)
  .refine(value => validator.isMobilePhone(value, 'en-IN'), {
    message: 'Please provide a valid Indian phone number'
  })
  .transform(value => value.replace(/^(\+91|91)/, ''));

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .refine(value => /[A-Z]/.test(value), {
    message: 'Password must include at least one uppercase letter'
  })
  .refine(value => /[a-z]/.test(value), {
    message: 'Password must include at least one lowercase letter'
  })
  .refine(value => /\d/.test(value), {
    message: 'Password must include at least one number'
  })
  .refine(value => /[^A-Za-z0-9]/.test(value), {
    message: 'Password must include at least one special character'
  });

const signupSchema = z.object({
  body: z.object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    referralCode: z.string().trim().transform(value => value || undefined).optional(),
  })
});

const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(6),
  })
});

const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string().email(),
    otp: z.string().length(6),
    mode: z.string().optional(),
  })
});

const resendOtpSchema = z.object({
  body: z.object({
    email: emailSchema,
  })
});

const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  })
});

const resetPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
    newPassword: passwordSchema,
  })
});

module.exports = {
  nameSchema,
  emailSchema,
  phoneSchema,
  passwordSchema,
  signupSchema,
  loginSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema
};
