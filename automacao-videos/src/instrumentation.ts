export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { agendarBuscaSemanal } = await import("./lib/agenda");
    agendarBuscaSemanal();
  }
}
