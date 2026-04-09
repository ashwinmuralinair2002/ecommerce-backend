const { z } = require('zod');

const couponValidationRules = {
    code: {
        minLength: 4,
        maxLength: 20,
        pattern: '^[A-Z0-9_-]+$'
    },
    discountValue: {
        min: 0,
        maxFlat: 100000
    },
    percentageDiscountMax: 100,
    highPercentageDiscountThreshold: 50,
    minOrderValue: {
        min: 0
    },
    maxDiscount: {
        min: 0
    },
    usageLimit: {
        min: 1
    },
    usagePerUser: {
        min: 1
    }
};

const emptyStringToUndefined = (value) => {
    if (value == null) {
        return undefined;
    }

    if (typeof value === 'string' && value.trim() === '') {
        return undefined;
    }

    return value;
};

const optionalNonNegativeNumber = (fieldLabel) => z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().nonnegative(`${fieldLabel} cannot be negative`).optional()
);

const optionalPositiveInt = (fieldLabel) => z.preprocess(
    emptyStringToUndefined,
    z.coerce.number()
        .int(`${fieldLabel} must be a whole number`)
        .positive(`${fieldLabel} must be greater than 0`)
        .optional()
);

const createCouponSchema = z.object({
    code: z.string()
        .trim()
        .min(1, 'Coupon code is required')
        .min(couponValidationRules.code.minLength, `Coupon code must be at least ${couponValidationRules.code.minLength} characters`)
        .max(couponValidationRules.code.maxLength, `Coupon code cannot exceed ${couponValidationRules.code.maxLength} characters`)
        .regex(/^\S+$/, 'Coupon code cannot contain spaces')
        .regex(new RegExp(couponValidationRules.code.pattern), 'Coupon code must be uppercase letters, numbers, underscores, or hyphens only'),
    discountType: z.enum(['FLAT', 'PERCENTAGE']),
    discountValue: z.coerce.number().positive('Discount value must be greater than 0'),
    minOrderValue: optionalNonNegativeNumber('Minimum order value').default(0),
    maxDiscount: optionalNonNegativeNumber('Max discount'),
    usageLimit: optionalPositiveInt('Usage limit'),
    usagePerUser: optionalPositiveInt('Usage per user'),
    startDate: z.string().trim().min(1, 'Start date is required'),
    endDate: z.string().trim().min(1, 'End date is required'),
    isActive: z.coerce.boolean().optional(),
    isDeleted: z.coerce.boolean().optional()
}).refine((data) => {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return true;
    }

    return endDate > startDate;
}, {
    message: 'End date must be after start date',
    path: ['endDate']
}).superRefine((data, ctx) => {
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);

    if (Number.isNaN(startDate.getTime())) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['startDate'],
            message: 'Start date is invalid'
        });
    }

    if (Number.isNaN(endDate.getTime())) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['endDate'],
            message: 'End date is invalid'
        });
    }

    if (data.discountType === 'PERCENTAGE' && data.discountValue > 100) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discountValue'],
            message: `Percentage discount cannot exceed ${couponValidationRules.percentageDiscountMax}`
        });
    }

    if (data.discountType === 'PERCENTAGE') {
        const requiresMaxDiscount = data.discountValue === couponValidationRules.percentageDiscountMax
            || data.discountValue > couponValidationRules.highPercentageDiscountThreshold;

        if (requiresMaxDiscount && (data.maxDiscount == null || Number(data.maxDiscount) <= 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxDiscount'],
                message: 'Maximum discount is required for high percentage coupons'
            });
        }
    }

    if (data.discountType === 'FLAT') {
        if (Number(data.discountValue) > couponValidationRules.discountValue.maxFlat) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['discountValue'],
                message: `Flat discount cannot exceed ${couponValidationRules.discountValue.maxFlat}`
            });
        }

        if (Number(data.discountValue) >= Number(data.minOrderValue || 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['discountValue'],
                message: 'Discount must be less than minimum order value'
            });
        }
    }
});

module.exports = {
    createCouponSchema,
    couponValidationRules
};
