import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { exportarCsvFinal } from '../services/exportar-csv.service.js'

const exportarCsvFinalRoute = new Hono()

exportarCsvFinalRoute.get('/', async (c) => {
  try {
    const result = await exportarCsvFinal()

    if (!result) {
      return c.json({ message: 'Nenhum documento finalizado pendente para exportação', exportados: 0 })
    }

    return c.json({ message: 'Exportação concluída com sucesso', ...result })
  } catch (err) {
    throw new HTTPException(500, { message: err instanceof Error ? err.message : 'Erro ao exportar CSV' })
  }
})

export default exportarCsvFinalRoute
