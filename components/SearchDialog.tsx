'use client'

import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCompletion } from 'ai/react'
import { Frown} from 'lucide-react'
import { useRef } from 'react'
import { parse } from 'best-effort-json-parser'

export function SearchDialog() {
  const [open, setOpen] = React.useState(false)
  const [completionSongs, setCompletionSongs] = React.useState([])
  const [query, setQuery] = React.useState<string>('')

  const ref: any = useRef(null)

  const { complete, completion, isLoading, error } = useCompletion({
    api: '/api/vector-search',
  })
  console.log({ completion })

  React.useEffect(() => {
    try {
      setCompletionSongs(parse(completion).results)
    } catch (e) {}
  }, [completion])

  React.useEffect(() => {
    if (open) {
      ref.current && ref.current.focus()
    }
  }, [open])

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && e.metaKey) {
        setOpen(true)
      }

      if (e.key === 'Escape') {
        console.log('esc')
        handleModalToggle()
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  function handleModalToggle() {
    setOpen(!open)
    setQuery('')
  }

  const handleSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault()
    console.log(query)
    complete(query)
  }

  return (
    <div className={'flex flex-col'} style={{ width: '700px' }}>
      <form onSubmit={handleSubmit} className={'w-full'}>
        <div className="relative flex flex-row mb-8 w-full">
          <Input
            ref={ref}
            placeholder="Tastează subiectul biblic..."
            name="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="col-span-3 w-full"
          />
          <Button type="submit" className="bg-black ml-2 px-6 min-w-fit" disabled={isLoading}>
            {isLoading ? 'Se incarca..' : 'Trimite'}
          </Button>
        </div>
      </form>

      {error && (
        <div className="flex items-center gap-4">
          <span className="bg-red-100 p-2 w-8 h-8 rounded-full text-center flex items-center justify-center">
            <Frown width={18} />
          </span>
          <span className="text-black">
            A apărut o eroare neașteptată. Vă rugăm să încercați din nou.
          </span>
        </div>
      )}

      {completionSongs && !error ? (
        <div className="flex flex-col items-start gap-4 dark:text-white">
          <div className={'w-full'}>
            <div className="container mx-auto mt-2 w-full">
              <ul className="space-y-6 w-full">
                {completionSongs?.map((song: any) => (
                  <li key={song['id']} className="bg-white p-6 rounded-lg w-full">
                    <a
                      className="font-medium text-blue-600 dark:text-blue-500 hover:underline"
                      href={
                        song['number']
                          ? `https://cantari-crestine.com/${song['id']
                              ?.replace('-', '')
                              .replace(/\d/g, '')}/${song['number']}`
                          : `https://cantari-crestine.com/${song['id']?.replace('-', '/')}`
                      }
                      target={'_blank'}
                    >
                      <h2 className="text-xl font-bold mb-2 w-full">
                        {song['title'] || 'Necunoscut'}
                      </h2>
                    </a>
                    <p className="text-gray-700 w-full">{song['reason']}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
