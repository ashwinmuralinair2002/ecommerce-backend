const { z } = require('zod');

const addToWishlistSchema = z.object({
  body: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
  })
});

const removeFromWishlistSchema = z.object({
  query: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
  })
});

const moveToCartSchema = z.object({
  query: z.object({
    productId: z.string().min(1),
    variantId: z.string().min(1),
  })
});

module.exports = {
  addToWishlistSchema,
  removeFromWishlistSchema,
  moveToCartSchema
};
