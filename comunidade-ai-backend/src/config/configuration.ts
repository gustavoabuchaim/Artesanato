import { envSchema } from './env.schema';

export function configuration() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Config inválida: ${parsed.error.message}`);
  }
  return parsed.data;
}
