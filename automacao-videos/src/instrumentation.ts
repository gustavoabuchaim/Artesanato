export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { agendarBuscaSemanal } = await import("./lib/agenda");
    agendarBuscaSemanal();
    // Instala o whisper em segundo plano ao subir, para a primeira transcrição não esperar minutos.
    const { prepararWhisper } = await import("./lib/midia");
    void prepararWhisper().catch((erro) => console.error("[whisper] preparação:", erro));
  }
}
