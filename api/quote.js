export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    return response.status(405).json({ error: 'Método no permitido.' })
  }

  try {
    const upstream = await fetch('https://quotes-api-three.vercel.app/api/randomquote?language=es', {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    })
    if (!upstream.ok) return response.status(502).json({ error: 'La fuente de frases no respondió.' })

    const quote = await upstream.json()
    if (typeof quote?.quote !== 'string' || typeof quote?.author !== 'string') {
      return response.status(502).json({ error: 'La fuente devolvió una frase incompleta.' })
    }

    response.setHeader('Cache-Control', 'no-store')
    return response.status(200).json(quote)
  } catch {
    return response.status(502).json({ error: 'No se pudo consultar la fuente de frases.' })
  }
}
