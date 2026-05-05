import type { FastifyPluginAsync } from 'fastify'

export const voiceRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/voice/transcribe — base64 audio → Swedish transcript via Azure Speech
  fastify.post('/transcribe', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const key = process.env['AZURE_SPEECH_KEY']
    const region = process.env['AZURE_SPEECH_REGION']
    if (!key || !region) {
      return reply.code(503).send({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Azure Speech är inte konfigurerat',
      })
    }

    const body = req.body as { audio?: string; mimeType?: string }
    if (!body?.audio) {
      return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'audio (base64) saknas' })
    }

    const audioBuffer = Buffer.from(body.audio, 'base64')
    const mimeType = body.mimeType ?? 'audio/webm'

    const sttRes = await fetch(
      `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=sv-SE&format=simple`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': mimeType,
        },
        body: audioBuffer,
      },
    )

    if (!sttRes.ok) {
      const err = await sttRes.text()
      return reply.code(502).send({ statusCode: 502, error: 'Bad Gateway', message: `Azure Speech fel: ${err}` })
    }

    const result = await sttRes.json() as { RecognitionStatus: string; DisplayText?: string }

    if (result.RecognitionStatus !== 'Success' || !result.DisplayText) {
      return reply.code(422).send({ statusCode: 422, error: 'Unprocessable Entity', message: 'Inget tal igenkändes' })
    }

    return { transcript: result.DisplayText }
  })
}
