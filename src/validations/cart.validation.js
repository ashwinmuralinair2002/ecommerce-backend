const { z } = require('zod');

const addToCartSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
    quantity: z.coerce.number().int().min(1),
  })
});

const updateCartItemSchema = z.object({
  body: z.object({
    quantity: z.coerce.number().int().min(1),
  }),
  params: z.object({
    itemId: z.string().min(1),
  })
});

const removeCartItemSchema = z.object({
  params: z.object({
    itemId: z.string().min(1),
  })
});

module.exports = {
  addToCartSchema,
  updateCartItemSchema,
  removeCartItemSchema
};
