import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { answerQuestion } from '../services/assistant.js';
import { assistantQuestionSchema } from '../validators/schemas.js';
const router = Router();

const assistantLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'TOO_MANY_QUESTIONS', message: 'Too many questions right now. Please wait a minute and try again.' } }
});

router.post('/questions', assistantLimiter, async (request, response, next) => {
  try {
    const parsed = assistantQuestionSchema.safeParse(request.body);
    if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_QUESTION', message: 'Question must contain between 3 and 300 characters.' } });
    const products = await prisma.product.findMany({ where: { active: true }, orderBy: { price: 'asc' } });
    response.json(await answerQuestion(products, parsed.data.question));
  } catch (error) { next(error); }
});

export default router;
