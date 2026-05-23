import { SignJWT, jwtVerify } from 'jose';

export type AccessTokenPayload = {
  sub: string;
  tenantId: string;
};

export function jwtSecretFromString(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(params: {
  secret: string;
  payload: AccessTokenPayload;
  ttlSeconds: number;
}) {
  const now = Math.floor(Date.now() / 1000);

  return new SignJWT({ tenantId: params.payload.tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(params.payload.sub)
    .setIssuedAt(now)
    .setExpirationTime(now + params.ttlSeconds)
    .sign(jwtSecretFromString(params.secret));
}

export async function verifyAccessToken(params: { secret: string; token: string }) {
  const { payload } = await jwtVerify(params.token, jwtSecretFromString(params.secret));
  const sub = payload.sub;
  const tenantId = (payload as unknown as { tenantId?: unknown }).tenantId;

  if (typeof sub !== 'string' || typeof tenantId !== 'string') {
    throw new Error('JWT inválido');
  }

  return { userId: sub, tenantId };
}

