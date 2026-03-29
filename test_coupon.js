const { z } = require('zod');
const { createCouponSchema } = require("./src/validators/coupon.validator");
const mongoose = require("mongoose");
const Coupon = require("./src/models/coupon.model.js");

const body = {
    code: 'SAVE30',
    discountType: 'PERCENTAGE',
    discountValue: 30,
    maxDiscount: 5000,
    minOrderValue: 15000,
    usageLimit: 100,
    usagePerUser: 1,
    startDate: '29/3/2026',
    endDate: '29/4/2026',
    isActive: true
};

const parsed = createCouponSchema.safeParse(body);
console.log("Zod parsed success:", parsed.success);
if (!parsed.success) {
    console.log("Zod errors:", parsed.error.issues);
} else {
    const c = new Coupon(parsed.data);
    const err = c.validateSync();
    console.log("Mongoose error:", err);
}

const body2 = { ...body, startDate: '2026-03-29', endDate: '2026-04-29' };
const parsed2 = createCouponSchema.safeParse(body2);
console.log("Zod 2 success:", parsed2.success);
if (parsed2.success) {
    const c2 = new Coupon(parsed2.data);
    const err2 = c2.validateSync();
    console.log("Mongoose 2 error:", err2);
}
