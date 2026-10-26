"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Login() {
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function entrar(evento: React.FormEvent) {
    evento.preventDefault();
    setEnviando(true);
    setErro("");
    const resposta = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha }),
    });
    if (resposta.ok) {
      router.replace("/");
      return;
    }
    setErro((await resposta.json().catch(() => ({}))).erro ?? "Não foi possível entrar.");
    setEnviando(false);
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={entrar} className="w-full max-w-sm space-y-4 rounded-2xl border border-borda bg-painel p-8">
        <div>
          <p className="text-xs font-semibold tracking-widest text-teal-300">ESTÚDIO DE NOTÍCIAS</p>
          <h1 className="mt-1 text-2xl font-bold">Artesanato em 1 minuto</h1>
        </div>
        <label className="block space-y-2">
          <span className="text-sm text-suave">Senha</span>
          <input
            type="password"
            autoFocus
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 outline-none focus:border-teal-300"
          />
        </label>
        {erro && <p className="text-sm text-rose-300">{erro}</p>}
        <button
          disabled={enviando}
          className="w-full rounded-lg bg-teal-400 px-4 py-2 font-semibold text-slate-950 hover:bg-teal-300 disabled:opacity-60"
        >
          {enviando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
