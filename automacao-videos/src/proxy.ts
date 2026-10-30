import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/sessao";

export function proxy(request: NextRequest) {
  if (sessaoValida(request.cookies.get(COOKIE_SESSAO)?.value)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ erro: "Digite a senha para continuar." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // marca/: logos e símbolos públicos, usados já na tela de senha.
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico|marca/).*)"],
};
