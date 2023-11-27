import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import yargs from 'yargs'
import { Configuration, OpenAIApi } from 'openai-edge'

dotenv.config()

async function generateEmbeddings() {
  const argv = await yargs.option('refresh', {
    alias: 'r',
    description: 'Refresh data',
    type: 'boolean',
  }).argv

  const shouldRefresh = argv.refresh

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.OPENAI_KEY
  ) {
    return console.log(
      'Environment variables NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_KEY are required: skipping embeddings generation',
    )
  }

  const supabaseClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  const { data, error } = await supabaseClient
    .from('song')
    .select()
    .is('embedding', null);

  if (!data || error) {
    throw new Error(JSON.stringify({ error }))
  }
  console.log(`Items to process: ${data.length}`)

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_KEY,
  })
  const openai = new OpenAIApi(configuration)

  const batchSize = 100;
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize)

    const input = batch.map(song => {
      return `title=${song['title']||''},categories=${song['categories']||''},content=${song['content']}`.replaceAll('\n', '')
    })
    const embeddingResponse: any = await openai.createEmbedding({
      model: 'text-embedding-ada-002',
      input,
    })

    for (let j = 0; j < batch.length; j++) {
      const song = batch[j];
      const embedding = embeddingResponse.data.data[j];

      const r = await supabaseClient
        .from('song')
        .update({
          embedding: embedding.embedding,
          embedding_info: {
            model: embeddingResponse.data.model,
            usage: embeddingResponse.data.usage,
            object: embeddingResponse.data.object,
          },
        })
        .eq('id', song['id'])

      if (r.error) {
        throw new Error(JSON.stringify({ error: r.error }))
      }
    }
    console.log(`inserted ${batch.length} docs`)
  }

  console.log('Embedding generation complete')
}

async function main() {
  await generateEmbeddings()
}

main().catch((err) => console.error(err))
