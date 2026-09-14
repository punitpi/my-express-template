import { z } from 'zod'

export const updateMeSchema = {
  body: z.object({
    email: z.string().email()
  })
}
