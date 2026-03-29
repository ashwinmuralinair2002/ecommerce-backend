const { z } = require('zod');

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid selection');
const toArray = (value) => {
    if (value == null || value === '') {
        return [];
    }

    return Array.isArray(value) ? value : [value];
};

const createOfferSchema = z.object({
    name: z.string().trim().min(3, 'Name must be at least 3 characters'),
    type: z.enum(['PRODUCT', 'CATEGORY', 'BRAND']),
    discountType: z.enum(['PERCENTAGE', 'FLAT']),
    discountValue: z.coerce.number(),
    applicableProducts: z.preprocess(toArray, z.array(objectIdSchema)).optional(),
    applicableCategories: z.preprocess(toArray, z.array(objectIdSchema)).optional(),
    applicableBrands: z.preprocess(toArray, z.array(objectIdSchema)).optional(),
    minOrderValue: z.coerce.number().nonnegative().optional(),
    maxDiscountAmount: z.union([z.literal(''), z.coerce.number().nonnegative('Max discount amount cannot be negative')]).optional(),
    maxDiscount: z.union([z.literal(''), z.coerce.number().nonnegative('Max discount cannot be negative')]).optional(),
    startDate: z.string().trim().min(1, 'Start date is required'),
    endDate: z.string().trim().min(1, 'End date is required')
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

    if (data.type === 'PRODUCT' && (!data.applicableProducts || data.applicableProducts.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['applicableProducts'],
            message: 'At least one target must be selected'
        });
    }

    if (data.type === 'CATEGORY' && (!data.applicableCategories || data.applicableCategories.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['applicableCategories'],
            message: 'At least one target must be selected'
        });
    }

    if (data.type === 'BRAND' && (!data.applicableBrands || data.applicableBrands.length === 0)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['applicableBrands'],
            message: 'At least one target must be selected'
        });
    }

    if (data.discountType === 'FLAT' && data.discountValue <= 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discountValue'],
            message: 'Flat discount must be greater than 0'
        });
    }

    if (data.discountType === 'PERCENTAGE' && data.discountValue > 100) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discountValue'],
            message: 'Percentage discount cannot exceed 100'
        });
    }

    if (data.discountType === 'PERCENTAGE' && data.discountValue <= 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['discountValue'],
            message: 'Percentage discount must be greater than 0'
        });
    }

    if (data.discountType === 'FLAT') {
        if (data.maxDiscountAmount !== '' && data.maxDiscountAmount != null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxDiscountAmount'],
                message: 'Max discount should not be set for flat offers'
            });
        }
    }

    if (data.discountType === 'PERCENTAGE') {
        if (data.maxDiscountAmount === '' || data.maxDiscountAmount == null || Number(data.maxDiscountAmount) <= 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['maxDiscountAmount'],
                message: 'Max discount is required for percentage offers'
            });
        }
    }
});

module.exports = {
    createOfferSchema
};
