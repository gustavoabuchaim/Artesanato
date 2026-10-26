import { lerEstado, tarefaRodando } from "./armazenamento";
import { buscarNoticiasDaSemana } from "./fluxo";

const UMA_HORA = 60 * 60 * 1000;
const g = globalThis as typeof globalThis & { __agenda?: NodeJS.Timeout };

/**
 * De hora em hora, se a semana atual ainda não tem notícias, busca. Assim a busca roda
 * no início de cada semana e também recupera se o servidor estava desligado na segunda.
 */
export function agendarBuscaSemanal() {
  if (g.__agenda) return;
  const verificar = async () => {
    try {
      if (tarefaRodando()) return;
      const estado = await lerEstado();
      if (!estado.buscadoEm) await buscarNoticiasDaSemana();
    } catch (erro) {
      console.error("[agenda] busca semanal:", erro);
    }
  };
  setTimeout(verificar, 10_000);
  g.__agenda = setInterval(verificar, UMA_HORA);
}
