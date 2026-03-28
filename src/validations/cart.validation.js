const { z } = require('zod');

const addToCartSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
    quantity: z.coerce.number().int().min(1),
    selectedOfferId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  })
});

const updateCartItemSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
    quantity: z.coerce.number().int().min(1),
  })
});

const removeCartItemSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
  })
});

module.exports = {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema
};
