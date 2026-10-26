import { lerEstado } from "@/lib/armazenamento";

export async function GET() {
  return Response.json(await lerEstado());
}
