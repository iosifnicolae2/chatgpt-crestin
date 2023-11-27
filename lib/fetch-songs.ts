import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

export const fetchSongs = async () => {
  const TEXTS_API_ENDPOINT = 'https://cantari-crestine.com/json-data/texts.json'
  const TITLES_API_ENDPOINT = 'https://cantari-crestine.com/json-data/titles.json'
  const NUMBERS_API_ENDPOINT = 'https://cantari-crestine.com/json-data/numbers.json'
  const THEME_API_ENDPOINT = 'https://cantari-crestine.com/json-data/themeGrouped2.json'
  const META_API_ENDPOINT = 'https://cantari-crestine.com/json-data/meta.json'

  // Fetch data from all endpoints
  const textsResponse = await fetch(TEXTS_API_ENDPOINT)
  const titlesResponse = await fetch(TITLES_API_ENDPOINT)
  const numbersResponse = await fetch(NUMBERS_API_ENDPOINT)
  const themeResponse = await fetch(THEME_API_ENDPOINT)
  const metaResponse = await fetch(META_API_ENDPOINT)

  // Parse the JSON responses
  const textsData = (await textsResponse.json()) as any
  const titlesData = (await titlesResponse.json()) as any
  const numbersData = (await numbersResponse.json()) as any
  const themeData = (await themeResponse.json()) as any
  const metaData = (await metaResponse.json()) as any

  // Combine the information into an array of objects
  const songsArray: any = []
  Object.entries(textsData).map(([category, songs]: any) => {
    songs.map((text: any, index: number) => {
      songsArray.push({
        id: `${category}-${index}`,
        title: titlesData[category]?.[index] || '',
        content: text || '',
        categories: [],
        info: {
          number: numbersData[category]?.[index] || '',
          meta: metaData[category]?.[index] || {},
        },
      })
    })
  })
  Object.entries(themeData).map(([category, themes]: any) => {
    Object.entries(themes).map(([theme, ids]: any) => {
      const formattedIds = ids.map((i: any) => `${category}-${i}`)
      songsArray.map((song: any) => {
        if (formattedIds.includes(song['id'])) {
          if (!song['categories']) {
            song['categories'] = []
          }
          song['categories'].push(theme)
        }
      })
    })
  })

  return songsArray
}

async function insertSongs(songs: any[]) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !process.env.OPENAI_KEY
  ) {
    return console.log(
      'Environment variables NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENAI_KEY are required: skipping embeddings generation'
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
    }
  )
  console.log({ song: songs[0] })
  const r = await supabaseClient.from('song').upsert(songs, { onConflict: 'id' })
  console.log(r)
}

async function main() {
  const songs = await fetchSongs()
  await insertSongs(songs)
}

main().catch((err) => console.error(err))
