const { z } = require('zod');

const addressBodySchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(10).max(15),
  houseNo: z.string().min(1),
  street: z.string().min(3),
  city: z.string().min(2),
  state: z.string().min(2),
  postalCode: z.string().min(4),
  label: z.string().min(2),
  isDefault: z.union([z.string(), z.boolean()]).optional()
});

const addAddressSchema = z.object({
  body: addressBodySchema
});

const updateAddressSchema = z.object({
  params: z.object({
    id: z.string().min(1)
  }),
  body: addressBodySchema
});

const deleteAddressSchema = z.object({
  params: z.object({
    id: z.string().min(1)
  })
});

module.exports = {
  addAddressSchema,
  updateAddressSchema,
  deleteAddressSchema
};
